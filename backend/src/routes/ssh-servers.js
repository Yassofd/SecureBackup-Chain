'use strict';
const { Router } = require('express');
const db = require('../services/db');
const { encrypt, decrypt } = require('../services/credentials');
const sshService = require('../services/ssh');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/role');

const router = Router();
router.use(authMiddleware);

function sanitizeServer(s) {
  const { encryptedCredentials, ...rest } = s;
  return rest;
}

// GET /api/ssh-servers
router.get('/', async (req, res, next) => {
  try {
    const where = req.user.role === 'admin' ? {} : { ownerId: req.user.sub };
    const servers = await db.sshServer.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json(servers.map(sanitizeServer));
  } catch (err) { next(err); }
});

// POST /api/ssh-servers — admin et responsable
router.post('/', requireRole('admin', 'responsable'), async (req, res, next) => {
  try {
    const { name, host, port = 22, username, auth_type, credentials, description } = req.body;
    if (!name || !host || !username || !auth_type || !credentials) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }
    if (!['password', 'key'].includes(auth_type)) {
      return res.status(400).json({ error: 'auth_type invalide' });
    }

    const encryptedCredentials = encrypt(JSON.stringify(credentials));
    const server = await db.sshServer.create({
      data: {
        name,
        host,
        port: Number(port),
        username,
        authType: auth_type,
        encryptedCredentials,
        description: description || null,
        ownerId: req.user.sub,
      },
    });
    res.status(201).json(sanitizeServer(server));
  } catch (err) { next(err); }
});

// PUT /api/ssh-servers/:id
router.put('/:id', requireRole('admin', 'responsable'), async (req, res, next) => {
  try {
    const existing = await db.sshServer.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Serveur non trouvé' });
    if (req.user.role !== 'admin' && existing.ownerId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const { name, host, port, username, auth_type, credentials, description } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (host !== undefined) data.host = host;
    if (port !== undefined) data.port = Number(port);
    if (username !== undefined) data.username = username;
    if (auth_type !== undefined) data.authType = auth_type;
    if (credentials !== undefined) data.encryptedCredentials = encrypt(JSON.stringify(credentials));
    if (description !== undefined) data.description = description;

    const updated = await db.sshServer.update({ where: { id: req.params.id }, data });
    res.json(sanitizeServer(updated));
  } catch (err) { next(err); }
});

// DELETE /api/ssh-servers/:id
router.delete('/:id', requireRole('admin', 'responsable'), async (req, res, next) => {
  try {
    const existing = await db.sshServer.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Serveur non trouvé' });
    if (req.user.role !== 'admin' && existing.ownerId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    await db.sshServer.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) { next(err); }
});

// POST /api/ssh-servers/:id/test
router.post('/:id/test', requireRole('admin', 'responsable'), async (req, res, next) => {
  try {
    const server = await db.sshServer.findUnique({ where: { id: req.params.id } });
    if (!server) return res.status(404).json({ error: 'Serveur non trouvé' });
    if (req.user.role !== 'admin' && server.ownerId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    const credentials = JSON.parse(decrypt(server.encryptedCredentials));
    await sshService.testConnection({
      host: server.host,
      port: server.port,
      username: server.username,
      auth_type: server.authType,
      credentials,
    });
    res.json({ ok: true, message: 'Connexion SSH réussie' });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    // Erreur SSH : retourner un 200 avec ok:false pour l'UI
    res.json({ ok: false, message: err.message });
  }
});

module.exports = router;
