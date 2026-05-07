'use strict';
const { Router } = require('express');
const multer = require('multer');
const { randomUUID } = require('crypto');
const fabric = require('../services/fabric');
const ipfs = require('../services/ipfs');
const { sha256, encryptAES, decryptAES } = require('../services/crypto');
const env = require('../../config/env');

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('file'), async (req, res, next) => {
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

    res.status(201).json({ backupId: entry.backupId, cid: entry.cid, txId: entry.txId });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const backups = await fabric.evaluateTransaction('getAllBackups');
    res.json(backups);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const entry = await fabric.evaluateTransaction('getBackup', req.params.id);
    res.json(entry);
  } catch (err) {
    if (err.message && err.message.includes('introuvable')) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/:id/verify', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const fileHash = sha256(req.file.buffer);
    const result = await fabric.submitTransaction('verifyIntegrity', req.params.id, fileHash);
    res.json(result);
  } catch (err) {
    if (err.message && err.message.includes('introuvable')) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const entry = await fabric.evaluateTransaction('getBackup', req.params.id);
    const encrypted = await ipfs.cat(entry.cid);
    const decrypted = decryptAES(encrypted, env.MASTER_KEY);

    res.setHeader('Content-Type', entry.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${entry.fileName}"`);
    res.send(decrypted);
  } catch (err) {
    if (err.message && err.message.includes('introuvable')) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
