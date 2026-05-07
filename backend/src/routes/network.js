'use strict';
const { Router } = require('express');
const { PrismaClient } = require('@prisma/client');
const Docker = require('dockerode');
const authMiddleware = require('../middleware/auth');

const router = Router();
const prisma = new PrismaClient();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

router.use(authMiddleware);

// GET /api/network/topology
router.get('/topology', async (req, res, next) => {
  try {
    const nodes = await prisma.networkNode.findMany({
      orderBy: { type: 'asc' },
    });
    res.json({ nodes });
  } catch (err) {
    next(err);
  }
});

// GET /api/network/health
router.get('/health', async (req, res, next) => {
  try {
    const nodes = await prisma.networkNode.findMany();
    const total   = nodes.length;
    const online  = nodes.filter((n) => n.status === 'online').length;
    const offline = nodes.filter((n) => n.status === 'offline').length;
    const degraded = nodes.filter((n) => n.status === 'degraded').length;

    const globalStatus =
      offline > 0  ? 'degraded' :
      degraded > 0 ? 'degraded' :
      total === 0  ? 'unknown'  : 'healthy';

    res.json({ status: globalStatus, total, online, offline, degraded });
  } catch (err) {
    next(err);
  }
});

// GET /api/network/nodes/:id
router.get('/nodes/:id', async (req, res, next) => {
  try {
    const node = await prisma.networkNode.findUnique({ where: { id: req.params.id } });
    if (!node) return res.status(404).json({ error: 'Nœud introuvable' });
    res.json({ node });
  } catch (err) {
    next(err);
  }
});

// GET /api/network/nodes/:id/logs
router.get('/nodes/:id/logs', async (req, res, next) => {
  try {
    const node = await prisma.networkNode.findUnique({ where: { id: req.params.id } });
    if (!node) return res.status(404).json({ error: 'Nœud introuvable' });

    const lines = parseInt(req.query.lines) || 50;
    let logs = '';
    try {
      const container = docker.getContainer(node.name);
      const stream = await container.logs({ stdout: true, stderr: true, tail: lines });
      logs = stream.toString('utf8').replace(/[\x00-\x08\x0e-\x1f]/g, '');
    } catch (err) {
      logs = `[Impossible de récupérer les logs : ${err.message}]`;
    }

    res.json({ nodeId: node.id, name: node.name, logs });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
