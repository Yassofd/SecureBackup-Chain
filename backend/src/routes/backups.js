'use strict';
const { Router } = require('express');
const { PassThrough } = require('stream');
const multer = require('multer');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const fabric = require('../services/fabric');
const ipfs = require('../services/ipfs');
const busboy = require('busboy');
const { sha256, sha256File, encryptAES, encryptFileToFile, createEncryptStream, decryptAES } = require('../services/crypto');
const { encrypt: encryptCred, decrypt: decryptCred } = require('../services/credentials');
const sshService = require('../services/ssh');
const db = require('../services/db');
const { notify } = require('../services/notifications');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/role');
const env = require('../../config/env');

const router = Router();

// ── Sessions de chunked upload ────────────────────────────────────────────────
// Permet d'uploader de gros fichiers via le tunnel Codespaces en découpant en
// morceaux de 50 Mo. Chaque chunk arrive dans une requête séparée → aucun
// timeout tunnel. Le pipeline AES+IPFS reste en streaming continu.
const chunkSessions = new Map();
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 2h sans activité
  for (const [id, s] of chunkSessions) {
    if (s.createdAt < cutoff) { s.passthrough.destroy(); chunkSessions.delete(id); }
  }
}, 10 * 60 * 1000);

// multer diskStorage conservé uniquement pour la route /verify (fichiers modérés)
const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, cb) => cb(null, `sbc-verify-${randomUUID()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 * 1024 }, // 10 Go max pour verify
});

router.use(authMiddleware);

// POST /api/backups — admin et responsable uniquement
// Streaming pur via busboy : zéro fichier temporaire, zéro Buffer complet en RAM.
// Pipeline : HTTP body → busboy → hash+cipher (single pass) → IPFS
// Supporte des fichiers de taille quelconque (3 To et plus).
router.post('/', requireRole('admin', 'responsable'), async (req, res, next) => {
  const ct = req.headers['content-type'] || '';
  if (!ct.includes('multipart/form-data')) {
    return res.status(400).json({ error: 'multipart/form-data requis' });
  }

  try {
    await new Promise((resolve, reject) => {
      const bb = busboy({ headers: req.headers, limits: { files: 1 } });
      let handled = false;

      bb.on('file', async (fieldName, fileStream, info) => {
        if (handled) { fileStream.resume(); return; }
        handled = true;

        const filename = info.filename || 'file';
        const mimeType = info.mimeType || 'application/octet-stream';

        try {
          // Single pass : hash SHA-256 du clair + chiffrement AES-256-CBC simultanés
          const { stream: encStream, getHash, getSize } = createEncryptStream(fileStream, env.MASTER_KEY);

          // Envoi streamé vers IPFS — le chiffré n'est jamais écrit sur disque
          const cid = await ipfs.addFromAsyncIterable(encStream, filename);

          const fileHash = getHash(); // disponible après consommation complète du stream
          const size     = getSize();

          const backupId = randomUUID();
          const entry = await fabric.submitTransaction(
            'registerBackup',
            backupId, cid, filename, fileHash, String(size), mimeType,
          );

          await db.backupOwnership.create({ data: { backupId: entry.backupId, userId: req.user.sub } });

          const sizeFmt = size >= 1073741824
            ? `${(size / 1073741824).toFixed(2)} Go`
            : `${(size / 1048576).toFixed(1)} Mo`;
          notify(req.user.sub, 'backup_success', 'Sauvegarde créée',
            `Fichier "${filename}" (${sizeFmt}) sauvegardé avec succès.`);

          res.status(201).json({ backupId: entry.backupId, cid: entry.cid, txId: entry.txId });
          resolve();
        } catch (err) {
          fileStream.destroy(); // libère busboy — évite le blocage par backpressure
          reject(err);
        }
      });

      bb.on('finish', () => { if (!handled) reject(new Error('No file uploaded')); });
      bb.on('error', reject);
      req.pipe(bb);
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/backups/chunks/:uploadId — chunked upload pour gros fichiers
// Chaque chunk est envoyé en application/octet-stream avec les headers x-chunk-*.
// Le pipeline AES+IPFS démarre dès le premier chunk et reste ouvert jusqu'au dernier.
router.post(
  '/chunks/:uploadId',
  requireRole('admin', 'responsable'),
  (req, res, next) => {
    // Collecter le body brut (chunk binaire) sans parser JSON/multipart
    const chunks = [];
    req.on('data', (d) => chunks.push(d));
    req.on('end', () => { req.rawBody = Buffer.concat(chunks); next(); });
    req.on('error', next);
  },
  async (req, res, next) => {
    const { uploadId } = req.params;
    const chunkIndex  = parseInt(req.headers['x-chunk-index']  ?? '0', 10);
    const totalChunks = parseInt(req.headers['x-total-chunks'] ?? '1', 10);
    const filename    = decodeURIComponent(req.headers['x-filename']  || 'file');
    const mimeType    = req.headers['x-mime-type'] || 'application/octet-stream';

    try {
      let session = chunkSessions.get(uploadId);

      if (chunkIndex === 0) {
        const passthrough = new PassThrough();
        const { stream: encStream, getHash, getSize } = createEncryptStream(passthrough, env.MASTER_KEY);
        const ipfsPromise = ipfs.addFromAsyncIterable(encStream, filename);
        session = { passthrough, ipfsPromise, getHash, getSize, filename, mimeType, createdAt: Date.now(), userId: req.user.sub };
        chunkSessions.set(uploadId, session);
      }

      if (!session) return res.status(400).json({ error: 'Session introuvable — relancer depuis le chunk 0' });

      // Écriture du chunk dans le stream avec gestion de la backpressure
      await new Promise((resolve, reject) => {
        const ok = session.passthrough.write(req.rawBody, (err) => (err ? reject(err) : resolve()));
        if (!ok) session.passthrough.once('drain', resolve);
      });

      const isLast = chunkIndex === totalChunks - 1;
      if (!isLast) return res.json({ ok: true, received: chunkIndex + 1, total: totalChunks });

      // Dernier chunk : finaliser le stream et attendre IPFS
      session.passthrough.end();
      const cid      = await session.ipfsPromise;
      const fileHash = session.getHash();
      const size     = session.getSize();
      chunkSessions.delete(uploadId);

      const backupId = randomUUID();
      const entry = await fabric.submitTransaction(
        'registerBackup',
        backupId, cid, session.filename, fileHash, String(size), session.mimeType,
      );
      await db.backupOwnership.create({ data: { backupId: entry.backupId, userId: session.userId } });

      const sizeFmt = size >= 1073741824
        ? `${(size / 1073741824).toFixed(2)} Go`
        : `${(size / 1048576).toFixed(1)} Mo`;
      notify(session.userId, 'backup_success', 'Sauvegarde créée',
        `Fichier "${session.filename}" (${sizeFmt}) sauvegardé avec succès.`);

      return res.status(201).json({ backupId: entry.backupId, cid: entry.cid, txId: entry.txId });
    } catch (err) {
      chunkSessions.delete(uploadId);
      next(err);
    }
  },
);

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

    // Single pass streaming : hash SHA-256 + chiffrement AES → IPFS sans fichier chiffré temporaire
    const baseName = path.posix.basename(remotePath);
    const fileName = isDirectory ? `${baseName}.tar.gz` : baseName;
    const mimeType = isDirectory ? 'application/gzip' : 'application/octet-stream';
    const size = fs.statSync(tmpPath).size;

    const { stream: encStream, getHash: getLocalHash } = createEncryptStream(
      fs.createReadStream(tmpPath), env.MASTER_KEY,
    );
    const cid = await ipfs.addFromAsyncIterable(encStream, fileName);
    const localHash = getLocalHash();

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
    if (tmpPath) fs.unlink(tmpPath, () => {}); // seul fichier temp : le clair téléchargé via SSH
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
