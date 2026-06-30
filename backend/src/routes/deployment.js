'use strict';

const { Router } = require('express');
const { randomUUID: uuid } = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const authMiddleware = require('../middleware/auth');
const requireRole    = require('../middleware/role');
const { deployNode, stopNode, STEPS } = require('../services/node-deployer');
const db = require('../services/db');

const router = Router();
router.use(authMiddleware);

const NETWORK_DIR = path.resolve(__dirname, '../../../network');

// In-memory job store — nettoyage des jobs terminés après 30 min
const jobs = new Map();
setInterval(() => {
  const limit = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && job.createdAt < limit) jobs.delete(id);
  }
}, 5 * 60 * 1000);

// ── GET /api/deployment/nodes ─────────────────────────────────────────────────
router.get('/nodes', async (req, res, next) => {
  try {
    const nodes = await db.fabricNode.findMany({ orderBy: { orgNum: 'asc' } });
    res.json(nodes);
  } catch (err) { next(err); }
});

// ── POST /api/deployment/nodes ────────────────────────────────────────────────
// Lance le déploiement local d'un nœud Docker. orgNum est auto-assigné.
router.post('/nodes', requireRole('admin'), async (req, res, next) => {
  try {
    const { chaincodeId } = req.body;

    // Auto-assigner l'orgNum suivant
    const last   = await db.fabricNode.findFirst({ orderBy: { orgNum: 'desc' } });
    const orgNum = (last?.orgNum ?? 1) + 1;

    const existing    = await db.fabricNode.findMany({ select: { orgNum: true, ip: true } });
    const knownNodes  = existing.some((n) => n.orgNum === 1)
      ? existing
      : [{ orgNum: 1, ip: '127.0.0.1' }, ...existing];

    const { getPorts, getOrgNames } = require('../services/port-allocator');
    const ports   = getPorts(orgNum);
    const { org } = getOrgNames(orgNum);

    const node = await db.fabricNode.create({
      data: {
        orgNum,
        orgName:     org,
        host:        'localhost',
        ip:          '127.0.0.1',
        sshUser:     'local',
        peerPort:    ports.peer,
        ordererPort: ports.orderer,
        caPort:      ports.ca,
        ipfsPort:    ports.ipfs,
        couchPort:   ports.couchHost,
        status:      'deploying',
      },
    });

    const jobId = uuid();
    const job   = { status: 'running', events: [], createdAt: Date.now(), nodeId: node.id };
    jobs.set(jobId, job);

    deployNode(
      { orgNum, knownNodes, chaincodeId },
      (event) => {
        job.events.push({ ...event, ts: new Date().toISOString() });
        if (event.success)          job.status = 'done';
        if (event.step === 'error') job.status = 'error';
      },
    ).then(async (result) => {
      await db.fabricNode.update({
        where: { id: node.id },
        data:  { status: result.success ? 'running' : 'error' },
      });
    }).catch(async (err) => {
      job.events.push({ step: 'error', label: 'Erreur inattendue', error: err.message, ts: new Date().toISOString() });
      job.status = 'error';
      await db.fabricNode.update({ where: { id: node.id }, data: { status: 'error' } }).catch(() => {});
    });

    res.json({ jobId, orgNum, nodeId: node.id });
  } catch (err) { next(err); }
});

// ── DELETE /api/deployment/nodes/:id ─────────────────────────────────────────
// Arrête les conteneurs locaux et supprime l'entrée DB.
router.delete('/nodes/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const node = await db.fabricNode.findUnique({ where: { id: req.params.id } });
    if (node) {
      await stopNode(node.orgNum).catch(() => {});
      await db.fabricNode.delete({ where: { id: node.id } });
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── GET /api/deployment/jobs/:id/stream ──────────────────────────────────────
router.get('/jobs/:id/stream', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job introuvable' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let cursor = 0;
  let timer;
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
  timer = setInterval(flush, 300);
  req.on('close', () => clearInterval(timer));
});

// ── GET /api/deployment/jobs/:id ─────────────────────────────────────────────
router.get('/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job introuvable' });
  res.json({ status: job.status, eventCount: job.events.length });
});

// ── GET /api/deployment/init-network/stream ───────────────────────────────────
router.get('/init-network/stream', requireRole('admin'), (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`); };

  const scriptPath = path.join(NETWORK_DIR, 'init-network.sh');
  const proc = spawn('bash', [scriptPath], { cwd: NETWORK_DIR, env: { ...process.env, PATH: process.env.PATH } });

  proc.stdout.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      const m = line.match(/\[[\d:]+\]\s+(STEP|OK|DONE|INFO|ERROR):(\w+)\s+(.*)/);
      send(m ? { type: m[1], step: m[2], log: m[3] } : { type: 'log', log: line.trim() });
    }
  });
  proc.stderr.on('data', (chunk) => {
    for (const line of chunk.toString().split('\n').filter(Boolean)) {
      if (line.trim()) send({ type: 'log', log: line.trim() });
    }
  });
  proc.on('close', (code) => {
    send(code === 0
      ? { type: 'DONE', step: 'network', log: 'Réseau initialisé avec succès', done: true }
      : { type: 'ERROR', step: 'network', log: `Erreur (code ${code})`, error: true, done: true });
    if (!res.writableEnded) res.end();
  });
  req.on('close', () => proc.kill());
});

// ── GET /api/deployment/steps ─────────────────────────────────────────────────
router.get('/steps', (req, res) => res.json({ steps: STEPS }));

module.exports = router;
