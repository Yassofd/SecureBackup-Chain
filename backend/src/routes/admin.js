'use strict';
const { Router }   = require('express');
const { execSync } = require('child_process');
const fs           = require('fs');
const path         = require('path');
const os           = require('os');
const crypto       = require('crypto');
const tar          = require('tar');
const authMiddleware = require('../middleware/auth');
const requireRole    = require('../middleware/role');
const logger         = require('../utils/logger');
const env            = require('../../config/env');

const router = Router();
router.use(authMiddleware);
router.use(requireRole('admin'));

const CRYPTO_BASE  = path.resolve(__dirname, '../../../network/crypto-config');
const NETWORK_BASE = path.resolve(__dirname, '../../../network');
const WALLET_PATH  = path.resolve(env.FABRIC.WALLET_PATH || path.join(__dirname, '../../../backend/wallet'));

// AES-256-GCM encrypt/decrypt using MASTER_KEY
function aesEncrypt(buf, key32hex) {
  const key  = Buffer.from(key32hex, 'hex');
  const iv   = crypto.randomBytes(12);
  const c    = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc  = Buffer.concat([c.update(buf), c.final()]);
  const tag  = c.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

function aesDecrypt(buf, key32hex) {
  const key  = Buffer.from(key32hex, 'hex');
  const iv   = buf.subarray(0, 12);
  const tag  = buf.subarray(12, 28);
  const enc  = buf.subarray(28);
  const d    = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]);
}

// POST /api/admin/export-config
router.post('/export-config', async (req, res, next) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbchain-export-'));
  const tarPath = path.join(os.tmpdir(), `config-export-${Date.now()}.tar.gz`);
  try {
    // 1. Fabric crypto-config
    const cryptoDest = path.join(tmp, 'crypto-config');
    fs.cpSync(CRYPTO_BASE, cryptoDest, { recursive: true });

    // 2. Wallet
    if (fs.existsSync(WALLET_PATH)) {
      fs.cpSync(WALLET_PATH, path.join(tmp, 'wallet'), { recursive: true });
    }

    // 3. Network config files (configtx, env files)
    const netDest = path.join(tmp, 'network');
    fs.mkdirSync(netDest, { recursive: true });
    for (const f of ['configtx.yaml', 'docker-compose-node1.yaml']) {
      const src = path.join(NETWORK_BASE, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(netDest, f));
    }

    // 4. PostgreSQL dump
    const pgDump = path.join(tmp, 'postgres.sql');
    const dbUrl  = env.DATABASE_URL;
    execSync(`pg_dump "${dbUrl}" -f "${pgDump}"`, { stdio: 'pipe' });

    // 5. Channel artifacts (genesis + channel tx)
    const artifacts = path.join(NETWORK_BASE, 'channel-artifacts');
    if (fs.existsSync(artifacts)) {
      fs.cpSync(artifacts, path.join(tmp, 'channel-artifacts'), { recursive: true });
    }

    // 6. Metadata
    fs.writeFileSync(path.join(tmp, 'export-meta.json'), JSON.stringify({
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.email || req.user.sub,
      version: '1.0',
    }, null, 2));

    // 7. Create tar.gz
    await tar.create({ gzip: true, file: tarPath, cwd: tmp }, ['.']);

    // 8. Encrypt with MASTER_KEY
    const plain = fs.readFileSync(tarPath);
    const enc   = aesEncrypt(plain, env.MASTER_KEY);

    fs.rmSync(tmp,    { recursive: true, force: true });
    fs.unlinkSync(tarPath);

    logger.info('Config export generated', { by: req.user.sub });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="securebackup-config-${Date.now()}.tar.gz.enc"`);
    res.send(enc);
  } catch (err) {
    fs.rmSync(tmp,     { recursive: true, force: true });
    if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
    next(err);
  }
});

// POST /api/admin/import-config
router.post('/import-config', async (req, res, next) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbchain-import-'));
  const tarPath = path.join(os.tmpdir(), `config-import-${Date.now()}.tar.gz`);
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const encBuf = Buffer.concat(chunks);

    // Decrypt
    const plain = aesDecrypt(encBuf, env.MASTER_KEY);
    fs.writeFileSync(tarPath, plain);

    // Extract
    await tar.extract({ file: tarPath, cwd: tmp });
    fs.unlinkSync(tarPath);

    // Validate metadata
    const metaPath = path.join(tmp, 'export-meta.json');
    if (!fs.existsSync(metaPath)) return res.status(400).json({ error: 'Archive invalide — métadonnées manquantes' });
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

    // Restore PostgreSQL
    const pgSql = path.join(tmp, 'postgres.sql');
    if (fs.existsSync(pgSql)) {
      execSync(`psql "${env.DATABASE_URL}" -f "${pgSql}"`, { stdio: 'pipe' });
    }

    fs.rmSync(tmp, { recursive: true, force: true });

    logger.info('Config import completed', { by: req.user.sub, exportedAt: meta.exportedAt });
    res.json({ ok: true, exportedAt: meta.exportedAt, exportedBy: meta.exportedBy });
  } catch (err) {
    fs.rmSync(tmp,     { recursive: true, force: true });
    if (fs.existsSync(tarPath)) fs.unlinkSync(tarPath);
    next(err);
  }
});

// POST /api/admin/snapshot — déclenche un snapshot immédiat
router.post('/snapshot', async (req, res, next) => {
  try {
    const snapshot = require('../services/snapshot');
    const results = await snapshot.runAll();
    logger.info('Snapshot manuel déclenché', { by: req.user.sub });
    res.json({ ok: true, ...results });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/snapshots — liste les snapshots disponibles
router.get('/snapshots', (req, res) => {
  const snapshotDir = path.resolve(__dirname, '../../../snapshots');
  if (!fs.existsSync(snapshotDir)) return res.json([]);
  const files = fs.readdirSync(snapshotDir)
    .filter(f => f.endsWith('.gz') || f.endsWith('.sql'))
    .map(f => {
      const stat = fs.statSync(path.join(snapshotDir, f));
      return { name: f, size: stat.size, createdAt: stat.birthtime };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(files);
});

module.exports = router;
