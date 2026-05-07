'use strict';
const { Router } = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const fabric = require('../services/fabric');
const ipfs = require('../services/ipfs');
const { sha256, encryptAES, decryptAES } = require('../services/crypto');
const { encrypt: encryptCred, decrypt: decryptCred } = require('../services/credentials');
const sshService = require('../services/ssh');
const db = require('../services/db');
const { notify } = require('../services/notifications');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/role');
const env = require('../../config/env');

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

// POST /api/backups — admin et responsable uniquement
router.post('/', requireRole('admin', 'responsable'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { buffer, originalname, mimetype, size } = req.file;

    const fileHash = sha256(buffer);
    const encrypted = encryptAES(buffer, env.MASTER_KEY);
    const cid = await ipfs.add(encrypted, originalname);

    const backupId = randomUUID();
    const entry = await fabric.submitTransaction(
      'registerBackup',
      backupId, cid, originalname, fileHash, String(size), mimetype,
    );

    await db.backupOwnership.create({ data: { backupId: entry.backupId, userId: req.user.sub } });
    notify(req.user.sub, 'backup_success', 'Sauvegarde créée',
      `Fichier "${originalname}" (${(size / 1024).toFixed(1)} Ko) sauvegardé avec succès.`);

    res.status(201).json({ backupId: entry.backupId, cid: entry.cid, txId: entry.txId });
  } catch (err) { next(err); }
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
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileHash = sha256(req.file.buffer);
    const result = await fabric.submitTransaction('verifyIntegrity', req.params.id, fileHash);
    if (!result.valid) {
      notify(req.user.sub, 'integrity_failure', 'Intégrité compromise',
        `La vérification de la sauvegarde ${req.params.id} a échoué — le fichier semble altéré.`);
    }
    res.json(result);
  } catch (err) {
    if (err.message?.includes('introuvable')) return res.status(404).json({ error: err.message });
    next(err);
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

    // Lire le fichier local
    const buffer = fs.readFileSync(tmpPath);
    const localHash = sha256(buffer);
    const size = buffer.length;
    const baseName = path.posix.basename(remotePath);
    const fileName = isDirectory ? `${baseName}.tar.gz` : baseName;
    const mimeType = isDirectory ? 'application/gzip' : 'application/octet-stream';

    // Chiffrement + IPFS
    const encrypted = encryptAES(buffer, env.MASTER_KEY);
    const cid = await ipfs.add(encrypted, fileName);

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
    if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch (_) {} }
  }
});

module.exports = router;
