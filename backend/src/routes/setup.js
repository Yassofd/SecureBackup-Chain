'use strict';
const { Router } = require('express');
const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const db = require('../services/db');
const { isInitialized, INIT_FILE } = require('../middleware/require-initialized');

const router = Router();
const NETWORK_DIR = path.resolve(__dirname, '../../../network');

// ── Utilitaire : test TCP avec mesure de latence ──────────────────────────────
function testPort(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      const latencyMs = Date.now() - start;
      socket.destroy();
      resolve({ reachable: true, latencyMs });
    });
    socket.on('error', () => resolve({ reachable: false, latencyMs: null }));
    socket.on('timeout', () => { socket.destroy(); resolve({ reachable: false, latencyMs: null }); });
    socket.connect(port, host);
  });
}

// ── GET /api/setup/status ─────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json({ initialized: isInitialized() });
});

// ── GET /api/setup/wizard ─────────────────────────────────────────────────────
// Téléchargement du script setup-wizard.sh (public, sans auth)
router.get('/wizard', (req, res) => {
  const wizardPath = path.join(NETWORK_DIR, 'setup-wizard.sh');
  if (!fs.existsSync(wizardPath)) {
    return res.status(404).json({ error: 'Script setup-wizard.sh introuvable' });
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="setup-wizard.sh"');
  fs.createReadStream(wizardPath).pipe(res);
});

// ── GET /api/setup/connectivity/stream ───────────────────────────────────────
// SSE : teste en temps réel la connectivité vers les 3 nœuds Fabric
// Query params : org1, org2, org3 (IPs/hostnames — défaut localhost)
router.get('/connectivity/stream', (req, res) => {
  const { org1 = 'localhost', org2 = 'localhost', org3 = 'localhost' } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const checks = [
    { node: 1, org: 'Org1', service: 'Orderer', host: org1, port: 7050 },
    { node: 1, org: 'Org1', service: 'Peer',    host: org1, port: 7051 },
    { node: 1, org: 'Org1', service: 'CA',       host: org1, port: 7054 },
    { node: 1, org: 'Org1', service: 'IPFS API', host: org1, port: 5001 },
    { node: 2, org: 'Org2', service: 'Orderer',  host: org2, port: 8050 },
    { node: 2, org: 'Org2', service: 'Peer',     host: org2, port: 8051 },
    { node: 2, org: 'Org2', service: 'CA',       host: org2, port: 8054 },
    { node: 2, org: 'Org2', service: 'IPFS API', host: org2, port: 5002 },
    { node: 3, org: 'Org3', service: 'Orderer',  host: org3, port: 9050 },
    { node: 3, org: 'Org3', service: 'Peer',     host: org3, port: 9051 },
    { node: 3, org: 'Org3', service: 'CA',       host: org3, port: 9054 },
    { node: 3, org: 'Org3', service: 'IPFS API', host: org3, port: 5003 },
  ];

  (async () => {
    for (const check of checks) {
      if (res.writableEnded) break;
      const result = await testPort(check.host, check.port);
      send({ ...check, ...result });
    }
    send({ done: true });
    if (!res.writableEnded) res.end();
  })();

  req.on('close', () => { if (!res.writableEnded) res.end(); });
});

// ── GET /api/setup/connectivity ───────────────────────────────────────────────
// Version one-shot (JSON) — pour les dashboards sans SSE
router.get('/connectivity', async (req, res, next) => {
  const { org1 = 'localhost', org2 = 'localhost', org3 = 'localhost' } = req.query;

  const checks = [
    { node: 1, org: 'Org1', service: 'Orderer', host: org1, port: 7050 },
    { node: 1, org: 'Org1', service: 'Peer',    host: org1, port: 7051 },
    { node: 1, org: 'Org1', service: 'CA',       host: org1, port: 7054 },
    { node: 1, org: 'Org1', service: 'IPFS API', host: org1, port: 5001 },
    { node: 2, org: 'Org2', service: 'Orderer',  host: org2, port: 8050 },
    { node: 2, org: 'Org2', service: 'Peer',     host: org2, port: 8051 },
    { node: 2, org: 'Org2', service: 'CA',       host: org2, port: 8054 },
    { node: 2, org: 'Org2', service: 'IPFS API', host: org2, port: 5002 },
    { node: 3, org: 'Org3', service: 'Orderer',  host: org3, port: 9050 },
    { node: 3, org: 'Org3', service: 'Peer',     host: org3, port: 9051 },
    { node: 3, org: 'Org3', service: 'CA',       host: org3, port: 9054 },
    { node: 3, org: 'Org3', service: 'IPFS API', host: org3, port: 5003 },
  ];

  try {
    const results = await Promise.all(
      checks.map(async (c) => ({ ...c, ...(await testPort(c.host, c.port)) })),
    );
    res.json({ results });
  } catch (err) { next(err); }
});

// ── GET /api/setup/download/node/:n ──────────────────────────────────────────
// Télécharge le package tar.gz pour un nœud (docker-compose + wizard + certs)
// Requiert l'auth (via le middleware de l'app)
router.get('/download/node/:n', (req, res) => {
  const { n } = req.params;
  if (!['1', '2', '3'].includes(n)) {
    return res.status(400).json({ error: 'Nœud invalide (1, 2 ou 3)' });
  }

  const orgLower = ['', 'org1', 'org2', 'org3'][parseInt(n, 10)];
  const composeFile = `docker-compose-node${n}.yaml`;

  // Vérifier que les fichiers existent
  const requiredFiles = [
    path.join(NETWORK_DIR, composeFile),
    path.join(NETWORK_DIR, 'setup-wizard.sh'),
    path.join(NETWORK_DIR, 'channel-artifacts', 'genesis.block'),
    path.join(NETWORK_DIR, 'crypto-config', 'ordererOrganizations', `${orgLower}.example.com`),
    path.join(NETWORK_DIR, 'crypto-config', 'peerOrganizations', `${orgLower}.example.com`),
  ];

  for (const f of requiredFiles) {
    if (!fs.existsSync(f)) {
      return res.status(404).json({ error: `Fichier requis introuvable : ${path.relative(NETWORK_DIR, f)}` });
    }
  }

  res.setHeader('Content-Type', 'application/gzip');
  res.setHeader('Content-Disposition', `attachment; filename="securebackup-node${n}-${orgLower}.tar.gz"`);

  // Archiver les fichiers pertinents avec tar
  const tarArgs = [
    '-czf', '-',
    composeFile,
    'setup-wizard.sh',
    'channel-artifacts/genesis.block',
    'channel-artifacts/backupchannel.block',
    `crypto-config/ordererOrganizations/${orgLower}.example.com`,
    `crypto-config/peerOrganizations/${orgLower}.example.com`,
  ];

  const tar = spawn('tar', tarArgs, { cwd: NETWORK_DIR });
  tar.stdout.pipe(res);
  tar.stderr.on('data', (d) => console.error('[setup-download]', d.toString().trim()));
  tar.on('error', (err) => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
  tar.on('close', (code) => {
    if (code !== 0 && !res.writableEnded) res.end();
  });
});

// ── POST /api/setup/test-server ───────────────────────────────────────────────
router.post('/test-server', async (req, res) => {
  const { host, port } = req.body;
  if (!host || !port) return res.status(400).json({ error: 'host et port requis' });
  const result = await testPort(host, parseInt(port, 10));
  res.json(result);
});

// ── POST /api/setup/initialize ────────────────────────────────────────────────
router.post('/initialize', async (req, res, next) => {
  if (isInitialized()) {
    return res.status(403).json({ error: 'Système déjà initialisé' });
  }

  const { organization, server, admin } = req.body;
  if (!organization?.name || !admin?.email || !admin?.password) {
    return res.status(400).json({ error: 'Données incomplètes' });
  }

  try {
    const existing = await db.user.findUnique({ where: { email: admin.email } });
    const passwordHash = await bcrypt.hash(admin.password, 12);
    if (existing) {
      await db.user.update({ where: { id: existing.id }, data: { passwordHash, role: 'admin' } });
    } else {
      await db.user.create({ data: { email: admin.email, passwordHash, role: 'admin' } });
    }

    const config = {
      initializedAt: new Date().toISOString(),
      organization,
      server,
      admin: { email: admin.email },
    };
    fs.writeFileSync(INIT_FILE, JSON.stringify(config, null, 2));

    const recoveryKit = {
      ...config,
      warning: 'Conservez ce fichier en lieu sûr. Copiez le MASTER_KEY depuis backend/.env dans ce document.',
      masterKey: '[voir backend/.env → MASTER_KEY]',
    };

    res.status(201).json({ initialized: true, recoveryKit });
  } catch (err) { next(err); }
});

module.exports = router;
