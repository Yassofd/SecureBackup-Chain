'use strict';
const { Router } = require('express');
const cron = require('node-cron');
const db = require('../services/db');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/role');
const { registerTask, unregisterTask, executeSchedule } = require('../services/scheduler');

const router = Router();
router.use(authMiddleware);

function sanitize(s) {
  return {
    id: s.id,
    name: s.name,
    serverType: s.sftpServerId ? 'sftp' : 'ssh',
    sshServerId: s.sshServerId,
    sshServer: s.sshServer
      ? { id: s.sshServer.id, name: s.sshServer.name, host: s.sshServer.host, username: s.sshServer.username }
      : null,
    sftpServerId: s.sftpServerId,
    sftpServer: s.sftpServer
      ? { id: s.sftpServer.id, name: s.sftpServer.name, host: s.sftpServer.host, username: s.sftpServer.username }
      : null,
    remotePath: s.remotePath,
    cronExpression: s.cronExpression,
    retentionDays: s.retentionDays,
    retentionCount: s.retentionCount,
    status: s.status,
    lastRun: s.lastRun,
    lastStatus: s.lastStatus,
    ownerId: s.ownerId,
    createdAt: s.createdAt,
  };
}

// GET /api/schedules
router.get('/', async (req, res, next) => {
  try {
    const where = req.user.role === 'responsable' ? { ownerId: req.user.sub } : {};
    const schedules = await db.scheduledBackup.findMany({
      where,
      include: { sshServer: true, sftpServer: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(schedules.map(sanitize));
  } catch (err) { next(err); }
});

// POST /api/schedules
router.post('/', requireRole('admin', 'responsable'), async (req, res, next) => {
  try {
    const { name, sshServerId, sftpServerId, remotePath, cronExpression, retentionDays, retentionCount } = req.body;
    if (!name || (!sshServerId && !sftpServerId) || !remotePath || !cronExpression) {
      return res.status(400).json({ error: 'name, remotePath, cronExpression et sshServerId (ou sftpServerId) sont obligatoires' });
    }
    if (sshServerId && sftpServerId) {
      return res.status(400).json({ error: 'Choisir soit sshServerId soit sftpServerId, pas les deux' });
    }
    if (!cron.validate(cronExpression)) {
      return res.status(400).json({ error: 'Expression cron invalide' });
    }
    if (sshServerId) {
      const server = await db.sshServer.findUnique({ where: { id: sshServerId } });
      if (!server) return res.status(404).json({ error: 'Serveur SSH non trouvé' });
    }
    if (sftpServerId) {
      const server = await db.sftpServer.findUnique({ where: { id: sftpServerId } });
      if (!server) return res.status(404).json({ error: 'Serveur SFTP non trouvé' });
    }

    const schedule = await db.scheduledBackup.create({
      data: {
        name,
        ...(sshServerId  && { sshServerId }),
        ...(sftpServerId && { sftpServerId }),
        remotePath,
        cronExpression,
        retentionDays: retentionDays ?? 30,
        retentionCount: retentionCount ?? null,
        status: 'active',
        ownerId: req.user.sub,
      },
      include: { sshServer: true, sftpServer: true },
    });
    registerTask(schedule);
    res.status(201).json(sanitize(schedule));
  } catch (err) { next(err); }
});

// PUT /api/schedules/:id
router.put('/:id', requireRole('admin', 'responsable'), async (req, res, next) => {
  try {
    const existing = await db.scheduledBackup.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Planification non trouvée' });
    if (req.user.role !== 'admin' && existing.ownerId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const { name, sshServerId, sftpServerId, remotePath, cronExpression, retentionDays, retentionCount } = req.body;
    if (cronExpression && !cron.validate(cronExpression)) {
      return res.status(400).json({ error: 'Expression cron invalide' });
    }
    const updated = await db.scheduledBackup.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(sshServerId  !== undefined && { sshServerId,  sftpServerId: null }),
        ...(sftpServerId !== undefined && { sftpServerId, sshServerId:  null }),
        ...(remotePath && { remotePath }),
        ...(cronExpression && { cronExpression }),
        ...(retentionDays !== undefined && { retentionDays }),
        ...(retentionCount !== undefined && { retentionCount }),
      },
      include: { sshServer: true, sftpServer: true },
    });
    registerTask(updated);
    res.json(sanitize(updated));
  } catch (err) { next(err); }
});

// DELETE /api/schedules/:id
router.delete('/:id', requireRole('admin', 'responsable'), async (req, res, next) => {
  try {
    const existing = await db.scheduledBackup.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Planification non trouvée' });
    if (req.user.role !== 'admin' && existing.ownerId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    unregisterTask(req.params.id);
    await db.scheduledBackup.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/schedules/:id/pause
router.post('/:id/pause', requireRole('admin', 'responsable'), async (req, res, next) => {
  try {
    const existing = await db.scheduledBackup.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Planification non trouvée' });
    if (req.user.role !== 'admin' && existing.ownerId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    unregisterTask(req.params.id);
    const updated = await db.scheduledBackup.update({
      where: { id: req.params.id },
      data: { status: 'paused' },
      include: { sshServer: true, sftpServer: true },
    });
    res.json(sanitize(updated));
  } catch (err) { next(err); }
});

// POST /api/schedules/:id/resume
router.post('/:id/resume', requireRole('admin', 'responsable'), async (req, res, next) => {
  try {
    const existing = await db.scheduledBackup.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Planification non trouvée' });
    if (req.user.role !== 'admin' && existing.ownerId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    if (!cron.validate(existing.cronExpression)) {
      return res.status(400).json({ error: 'Expression cron invalide' });
    }
    const updated = await db.scheduledBackup.update({
      where: { id: req.params.id },
      data: { status: 'active' },
      include: { sshServer: true, sftpServer: true },
    });
    registerTask(updated);
    res.json(sanitize(updated));
  } catch (err) { next(err); }
});

// POST /api/schedules/:id/run-now
router.post('/:id/run-now', requireRole('admin', 'responsable'), async (req, res, next) => {
  try {
    const existing = await db.scheduledBackup.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Planification non trouvée' });
    if (req.user.role !== 'admin' && existing.ownerId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    // Lance en arrière-plan, répond immédiatement
    executeSchedule(req.params.id).catch((err) => {
      console.error(`[run-now] ${req.params.id}:`, err.message);
    });
    res.json({ ok: true, message: 'Exécution lancée en arrière-plan' });
  } catch (err) { next(err); }
});

// GET /api/schedules/:id/history
router.get('/:id/history', async (req, res, next) => {
  try {
    const existing = await db.scheduledBackup.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Planification non trouvée' });
    if (req.user.role === 'responsable' && existing.ownerId !== req.user.sub) {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    const runs = await db.scheduledBackupRun.findMany({
      where: { scheduleId: req.params.id },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    res.json(runs);
  } catch (err) { next(err); }
});

module.exports = router;
