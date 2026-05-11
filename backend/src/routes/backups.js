'use strict';
const { Router } = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const fabric = require('../services/fabric');
const ipfs = require('../services/ipfs');
const { sha256, sha256File, encryptAES, encryptFileToFile, decryptAES } = require('../services/crypto');
const { encrypt: encryptCred, decrypt: decryptCred } = require('../services/credentials');
const sshService = require('../services/ssh');
const db = require('../services/db');
const { notify } = require('../services/notifications');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/role');
const env = require('../../config/env');

const router = Router();

// diskStorage : le fichier est écrit sur disque, pas en RAM — supporte les gros fichiers
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, `sbc-upload-${randomUUID()}`),
  }),
});

router.use(authMiddleware);

// POST /api/backups — admin et responsable uniquement
router.post('/', requireRole('admin', 'responsable'), upload.single('file'), async (req, res, next) => {
  const tempPlain = req.file?.path;
  const tempEnc   = tempPlain ? `${tempPlain}.enc` : null;
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { originalname, mimetype, size } = req.file;

    // Streaming : aucune donnée complète en RAM
    const fileHash = await sha256File(tempPlain);
    await encryptFileToFile(tempPlain, tempEnc, env.MASTER_KEY);
    const cid = await ipfs.addFromFile(tempEnc, originalname);

    const backupId = randomUUID();
    const entry = await fabric.submitTransaction(
      'registerBackup',
      backupId, cid, originalname, fileHash, String(size), mimetype,
    );

    await db.backupOwnership.create({ data: { backupId: entry.backupId, userId: req.user.sub } });
    notify(req.user.sub, 'backup_success', 'Sauvegarde créée',
      `Fichier "${originalname}" (${(size / 1048576).toFixed(1)} Mo) sauvegardé avec succès.`);

    res.status(201).json({ backupId: entry.backupId, cid: entry.cid, txId: entry.txId });
  } catch (err) {
    next(err);
  } finally {
    if (tempPlain) fs.unlink(tempPlain, () => {});
    if (tempEnc)   fs.unlink(tempEnc,   () => {});
  }
});

// GET /api/backups — tous les rôles (responsable : filtré sur ses fichiers)
router.get('/', async (req, res, next) => {
  try {
    let backups = await fabric.evaluateTransaction('getAllBackups');

    if (req.user.role === 'responsable') {
      const owned = await db.backupOwnership.findMany({
        where: { userId: req.user.sub },
        select: { backupId: true },
      });
      const ownedSet = new Set(owned.map((o) => o.backupId));
      backups = backups.filter((b) => ownedSet.has(b.backupId));
    }

    res.json(backups);
  } catch (err) { next(err); }
});

// GET /api/backups/:id — tous les rôles (responsable : vérifie ownership)
router.get('/:id', async (req, res, next) => {
  try {
    if (req.user.role === 'responsable') {
      const own = await db.backupOwnership.findFirst({
        where: { backupId: req.params.id, userId: req.user.sub },
      });
      if (!own) return res.status(403).json({ error: 'Accès refusé' });
    }

    const entry = await fabric.evaluateTransaction('getBackup', req.params.id);
    res.json(entry);
  } catch (err) {
    if (err.message?.includes('introuvable')) return res.status(404).json({ error: err.message });
    next(err);
  }
});

// POST /api/backups/:id/verify — tous les rôles
router.post('/:id/verify', upload.single('file'), async (req, res, next) => {
  const tempPath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileHash = await sha256File(tempPath);
    const result = await fabric.submitTransaction('verifyIntegrity', req.params.id, fileHash);
    if (!result.valid) {
      notify(req.user.sub, 'integrity_failure', 'Intégrité compromise',
        `La vérification de la sauvegarde ${req.params.id} a échoué — le fichier semble altéré.`);
    }
    res.json(result);
  } catch (err) {
    if (err.message?.includes('introuvable')) return res.status(404).json({ error: err.message });
    next(err);
  } finally {
    if (tempPath) fs.unlink(tempPath, () => {});
  }
});

// GET /api/backups/:id/download — admin et responsable uniquement
router.get('/:id/download', requireRole('admin', 'responsable'), async (req, res, next) => {
  try {
    if (req.user.role === 'responsable') {
      const own = await db.backupOwnership.findFirst({
        where: { backupId: req.params.id, userId: req.user.sub },
      });
      if (!own) return res.status(403).json({ error: 'Accès refusé' });
    }

    const entry = await fabric.evaluateTransaction('getBackup', req.params.id);
    const encrypted = await ipfs.cat(entry.cid);
    const decrypted = decryptAES(encrypted, env.MASTER_KEY);

    res.setHeader('Content-Type', entry.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${entry.fileName}"`);
    res.send(decrypted);
  } catch (err) {
    if (err.message?.includes('introuvable')) return res.status(404).json({ error: err.message });
    next(err);
  }
});

// POST /api/backups/remote — sauvegarde depuis un serveur distant via SSH
router.post('/remote', requireRole('admin', 'responsable'), async (req, res, next) => {
  let tmpPath = null;
  let ssh = null;
  try {
    const { serverId, remotePath } = req.body;
    if (!serverId || !remotePath) {
      return res.status(400).json({ error: 'serverId et remotePath sont obligatoires' });
    }

    // Récupérer + déchiffrer les credentials
    const server = await db.sshServer.findUnique({ where: { id: serverId } });
    if (!server) return res.status(404).json({ error: 'Serveur SSH non trouvé' });
    if (req.user.role !== 'admin' && server.ownerId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const credentials = JSON.parse(decryptCred(server.encryptedCredentials));

    // Connexion SSH
    ssh = await sshService.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      auth_type: server.authType,
      credentials,
    });

    // Hash distant
    const remoteFileHash = await sshService.remoteHash(ssh, remotePath);

    // Téléchargement
    const { localPath, isDirectory } = await sshService.fetchRemotePath(ssh, remotePath);
    tmpPath = localPath;

    await sshService.closeConnection(ssh);
    ssh = null;

    // Streaming : hash + chiffrement sans charger le fichier en RAM
    const baseName = path.posix.basename(remotePath);
    const fileName = isDirectory ? `${baseName}.tar.gz` : baseName;
    const mimeType = isDirectory ? 'application/gzip' : 'application/octet-stream';
    const size = fs.statSync(tmpPath).size;

    const localHash = await sha256File(tmpPath);
    const encPath = `${tmpPath}.enc`;
    await encryptFileToFile(tmpPath, encPath, env.MASTER_KEY);
    const cid = await ipfs.addFromFile(encPath, fileName);

    // Enregistrement Fabric
    const backupId = randomUUID();
    const entry = await fabric.submitTransaction(
      'registerBackup',
      backupId, cid, fileName, localHash, String(size), mimeType,
    );

    await db.backupOwnership.create({ data: { backupId: entry.backupId, userId: req.user.sub } });
    notify(req.user.sub, 'backup_success', 'Sauvegarde distante créée',
      `Fichier "${fileName}" depuis ${server.username}@${server.host}:${remotePath} sauvegardé avec succès.`);

    res.status(201).json({
      backupId: entry.backupId,
      cid: entry.cid,
      txId: entry.txId,
      remoteHash: remoteFileHash,
      localHash,
      source: `${server.username}@${server.host}:${remotePath}`,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  } finally {
    if (ssh) { try { await sshService.closeConnection(ssh); } catch (_) {} }
    if (tmpPath) fs.unlink(tmpPath, () => {});
    const _encPath = tmpPath ? `${tmpPath}.enc` : null;
    if (_encPath) fs.unlink(_encPath, () => {});
  }
});

// POST /api/backups/:id/restore-remote — restaure vers un serveur SSH
router.post('/:id/restore-remote', requireRole('admin', 'responsable'), async (req, res, next) => {
  let tmpPath = null;
  let ssh = null;
  try {
    const { ssh_server_id, destination_path, preserve_permissions = false, overwrite = false } = req.body;
    if (!ssh_server_id || !destination_path) {
      return res.status(400).json({ error: 'ssh_server_id et destination_path sont obligatoires' });
    }

    // 1. Métadonnées depuis Fabric
    const entry = await fabric.evaluateTransaction('getBackup', req.params.id);

    // 2. Vérification des droits
    if (req.user.role === 'responsable') {
      const own = await db.backupOwnership.findFirst({
        where: { backupId: req.params.id, userId: req.user.sub },
      });
      if (!own) return res.status(403).json({ error: 'Accès refusé' });
    }

    // 3. Credentials SSH
    const server = await db.sshServer.findUnique({ where: { id: ssh_server_id } });
    if (!server) return res.status(404).json({ error: 'Serveur SSH non trouvé' });
    if (req.user.role !== 'admin' && server.ownerId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé au serveur SSH' });
    }
    const credentials = JSON.parse(decryptCred(server.encryptedCredentials));

    // 4. Téléchargement IPFS + déchiffrement
    const encrypted = await ipfs.cat(entry.cid);
    const decrypted = decryptAES(encrypted, env.MASTER_KEY);

    // 5. Vérification intégrité
    const computedHash = sha256(decrypted);
    if (computedHash !== entry.fileHash) {
      return res.status(422).json({ error: 'Intégrité compromise : le hash ne correspond pas' });
    }

    // 6. Connexion SSH
    ssh = await sshService.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      auth_type: server.authType,
      credentials,
    });

    // 7. Espace disque
    const availableBytes = await sshService.checkDiskSpace(ssh, '/');
    if (availableBytes < decrypted.length * 1.2) {
      return res.status(507).json({
        error: `Espace insuffisant : ${(availableBytes / 1024 / 1024).toFixed(1)} Mo disponibles, ${(decrypted.length / 1024 / 1024).toFixed(1)} Mo requis`,
      });
    }

    // 8. Chemin de destination du fichier
    const destDir = destination_path.replace(/\/$/, '');
    const destFilePath = `${destDir}/${entry.fileName}`;

    // 9. Vérification fichier existant
    const fileExists = await sshService.remoteFileExists(ssh, destFilePath);
    if (fileExists && !overwrite) {
      return res.status(409).json({ error: 'Le fichier existe déjà à destination', fileExists: true, path: destFilePath });
    }

    // 10. Création du répertoire destination
    await sshService.mkdirRemote(ssh, destDir);

    // 11. Écriture locale temporaire + transfert SFTP
    tmpPath = path.join(os.tmpdir(), `restore_${Date.now()}_${entry.fileName}`);
    fs.writeFileSync(tmpPath, decrypted);
    await sshService.pushFile(ssh, tmpPath, destFilePath);

    // 12. Si tar.gz : décompression distante
    const isTar = entry.fileName.endsWith('.tar.gz') || entry.mimeType === 'application/gzip';
    if (isTar) {
      const tarFlags = preserve_permissions ? '-xzpf' : '-xzf';
      await sshService.executeCommand(ssh, `tar ${tarFlags} "${destFilePath}" -C "${destDir}" && rm -f "${destFilePath}"`);
    }

    await sshService.closeConnection(ssh);
    ssh = null;

    // 13. Audit Fabric
    await fabric.submitTransaction(
      'recordAuditEntry',
      'restore_remote',
      req.params.id,
      JSON.stringify({ destination: `${server.username}@${server.host}:${destFilePath}`, userId: req.user.sub }),
    );

    // 14. Notification
    notify(req.user.sub, 'restore_success', 'Restauration terminée',
      `Fichier "${entry.fileName}" restauré vers ${server.username}@${server.host}:${destFilePath}`);

    res.json({
      ok: true,
      destination: `${server.username}@${server.host}:${destFilePath}`,
      fileName: entry.fileName,
      size: decrypted.length,
      decompressed: isTar,
    });
  } catch (err) {
    if (err.message?.includes('introuvable')) return res.status(404).json({ error: err.message });
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  } finally {
    if (ssh) { try { await sshService.closeConnection(ssh); } catch (_) {} }
    if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch (_) {} }
  }
});

module.exports = router;
