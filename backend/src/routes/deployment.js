'use strict';
const { Router } = require('express');
const { v4: uuid } = require('uuid');
const { spawn } = require('child_process');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { deployNode, STEPS } = require('../services/node-deployer');

const router = Router();
router.use(authMiddleware);

const NETWORK_DIR = path.resolve(__dirname, '../../../network');

// In-memory job store : jobId → { status, events[], createdAt }
const jobs = new Map();

// Nettoyage auto des jobs terminés après 30 min
setInterval(() => {
  const limit = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && job.createdAt < limit) jobs.delete(id);
  }
}, 5 * 60 * 1000);

// ── POST /api/deployment/nodes ────────────────────────────────────────────────
// Lance le déploiement SSH d'un nœud en tâche de fond et retourne un jobId
router.post('/nodes', requireRole('admin'), async (req, res) => {
  const { orgNum, sshHost, sshPort, sshUser, sshPassword, sshKey, networkIps, chaincodeId } = req.body;

  if (!orgNum || !sshHost || !sshUser || (!sshPassword && !sshKey)) {
    return res.status(400).json({ error: 'orgNum, sshHost, sshUser et sshPassword/sshKey requis' });
  }
  if (![1, 2, 3].includes(Number(orgNum))) {
    return res.status(400).json({ error: 'orgNum doit être 1, 2 ou 3' });
  }

  const jobId = uuid();
  const job = { status: 'running', events: [], createdAt: Date.now() };
  jobs.set(jobId, job);

  deployNode(
    { orgNum: Number(orgNum), sshHost, sshPort, sshUser, sshPassword, sshKey, networkIps, chaincodeId },
    (event) => {
      job.events.push({ ...event, ts: new Date().toISOString() });
      if (event.success) job.status = 'done';
      if (event.step === 'error') job.status = 'error';
    },
  ).catch((err) => {
    job.events.push({ step: 'error', label: 'Erreur inattendue', error: err.message, ts: new Date().toISOString() });
    job.status = 'error';
  });

  res.json({ jobId });
});

// ── GET /api/deployment/jobs/:id/stream ──────────────────────────────────────
// SSE : stream les événements d'un job de déploiement
router.get('/jobs/:id/stream', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job introuvable' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let cursor = 0;

  const flush = () => {
    while (cursor < job.events.length) {
      res.write(`data: ${JSON.stringify(job.events[cursor])}\n\n`);
      cursor++;
    }
    if (job.status !== 'running') {
      res.write(`data: ${JSON.stringify({ done: true, status: job.status })}\n\n`);
      clearInterval(timer);
      res.end();
    }
  };

  flush();
  const timer = setInterval(flush, 300);
  req.on('close', () => clearInterval(timer));
});

// ── GET /api/deployment/jobs/:id ──────────────────────────────────────────────
router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job introuvable' });
  res.json({ status: job.status, eventCount: job.events.length });
});

// ── GET /api/setup/init-network/stream (réexporté depuis ici via setup.js) ───
// Démarre le réseau local complet via init-network.sh et stream les logs SSE
router.get('/init-network/stream', requireRole('admin'), (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const scriptPath = path.join(NETWORK_DIR, 'init-network.sh');
  const proc = spawn('bash', [scriptPath], {
    cwd: NETWORK_DIR,
    env: { ...process.env, PATH: process.env.PATH },
  });

  proc.stdout.on('data', (chunk) => {
    const lines = chunk.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      // Format: "[HH:MM:SS] STEP:id Message" | "OK:id Message" | "DONE:network Message"
      const m = line.match(/\[[\d:]+\]\s+(STEP|OK|DONE|INFO|ERROR):(\w+)\s+(.*)/);
      if (m) {
        const [, type, id, msg] = m;
        send({ type, step: id, log: msg });
      } else {
        send({ type: 'log', log: line.trim() });
      }
    }
  });

  proc.stderr.on('data', (chunk) => {
    const lines = chunk.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      if (line.trim()) send({ type: 'log', log: line.trim() });
    }
  });

  proc.on('close', (code) => {
    if (code === 0) {
      send({ type: 'DONE', step: 'network', log: 'Réseau initialisé avec succès', done: true });
    } else {
      send({ type: 'ERROR', step: 'network', log: `Erreur (code ${code})`, error: true, done: true });
    }
    if (!res.writableEnded) res.end();
  });

  req.on('close', () => proc.kill());
});

// ── GET /api/deployment/steps ─────────────────────────────────────────────────
router.get('/steps', (req, res) => {
  res.json({ steps: STEPS });
});

module.exports = router;
