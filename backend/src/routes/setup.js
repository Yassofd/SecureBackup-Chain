'use strict';
const { Router } = require('express');
const fs = require('fs');
const net = require('net');
const bcrypt = require('bcryptjs');
const db = require('../services/db');
const { isInitialized, INIT_FILE } = require('../middleware/require-initialized');

const router = Router();

// GET /api/setup/status
router.get('/status', (req, res) => {
  res.json({ initialized: isInitialized() });
});

// POST /api/setup/test-server
router.post('/test-server', async (req, res) => {
  const { host, port } = req.body;
  if (!host || !port) return res.status(400).json({ error: 'host et port requis' });

  const socket = new net.Socket();
  try {
    await new Promise((resolve, reject) => {
      socket.setTimeout(3000);
      socket.on('connect', () => { socket.destroy(); resolve(); });
      socket.on('error', reject);
      socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout')); });
      socket.connect(parseInt(port, 10), host);
    });
    res.json({ reachable: true });
  } catch (err) {
    res.json({ reachable: false, error: err.message });
  }
});

// POST /api/setup/initialize
router.post('/initialize', async (req, res, next) => {
  if (isInitialized()) {
    return res.status(403).json({ error: 'Système déjà initialisé' });
  }

  const { organization, server, admin } = req.body;
  if (!organization?.name || !admin?.email || !admin?.password) {
    return res.status(400).json({ error: 'Données incomplètes' });
  }

  try {
    // Créer ou mettre à jour le compte admin
    const existing = await db.user.findUnique({ where: { email: admin.email } });
    const passwordHash = await bcrypt.hash(admin.password, 12);
    if (existing) {
      await db.user.update({ where: { id: existing.id }, data: { passwordHash, role: 'admin' } });
    } else {
      await db.user.create({ data: { email: admin.email, passwordHash, role: 'admin' } });
    }

    // Écrire initialized.json
    const config = {
      initializedAt: new Date().toISOString(),
      organization,
      server,
      admin: { email: admin.email },
    };
    fs.writeFileSync(INIT_FILE, JSON.stringify(config, null, 2));

    // Kit de récupération (retourné une seule fois)
    const recoveryKit = {
      ...config,
      warning: 'Conservez ce fichier en lieu sûr. Copiez le MASTER_KEY depuis backend/.env dans ce document.',
      masterKey: '[voir backend/.env → MASTER_KEY]',
    };

    res.status(201).json({ initialized: true, recoveryKit });
  } catch (err) { next(err); }
});

module.exports = router;
