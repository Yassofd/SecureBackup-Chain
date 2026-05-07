'use strict';
const cron = require('node-cron');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const fabric = require('./fabric');
const ipfs = require('./ipfs');
const sshService = require('./ssh');
const { sha256, encryptAES } = require('./crypto');
const { decrypt: decryptCred } = require('./credentials');
const env = require('../../config/env');

// Map scheduleId → cron.ScheduledTask
const activeTasks = new Map();

function computeNextRun(cronExpression) {
  try {
    const interval = cron.schedule(cronExpression, () => {});
    interval.stop();
    // node-cron doesn't expose next-run natively; approximate with Date + 1 min buffer
    // For a proper implementation, use cron-parser (optional dependency)
    return null;
  } catch {
    return null;
  }
}

async function executeSchedule(scheduleId) {
  const schedule = await db.scheduledBackup.findUnique({
    where: { id: scheduleId },
    include: { sshServer: true },
  });
  if (!schedule || schedule.status !== 'active') return;

  const run = await db.scheduledBackupRun.create({
    data: {
      scheduleId,
      startedAt: new Date(),
      status: 'running',
    },
  });

  let tmpPath = null;
  let ssh = null;
  try {
    const server = schedule.sshServer;
    if (!server) throw new Error('Serveur SSH introuvable');

    const credentials = JSON.parse(decryptCred(server.encryptedCredentials));
    ssh = await sshService.connect({
      host: server.host,
      port: server.port,
      username: server.username,
      auth_type: server.authType,
      credentials,
    });

    const remoteFileHash = await sshService.remoteHash(ssh, schedule.remotePath);
    const { localPath, isDirectory } = await sshService.fetchRemotePath(ssh, schedule.remotePath);
    tmpPath = localPath;
    await sshService.closeConnection(ssh);
    ssh = null;

    const buffer = fs.readFileSync(tmpPath);
    const localHash = sha256(buffer);
    const size = buffer.length;
    const baseName = path.posix.basename(schedule.remotePath);
    const fileName = isDirectory ? `${baseName}.tar.gz` : baseName;
    const mimeType = isDirectory ? 'application/gzip' : 'application/octet-stream';

    const encrypted = encryptAES(buffer, env.MASTER_KEY);
    const cid = await ipfs.add(encrypted, fileName);

    const backupId = randomUUID();
    const entry = await fabric.submitTransaction(
      'registerBackup',
      backupId, cid, fileName, localHash, String(size), mimeType,
    );

    if (schedule.ownerId) {
      await db.backupOwnership.create({ data: { backupId: entry.backupId, userId: schedule.ownerId } });
    }

    await db.scheduledBackupRun.update({
      where: { id: run.id },
      data: { completedAt: new Date(), status: 'success', backupId: entry.backupId },
    });
    await db.scheduledBackup.update({
      where: { id: scheduleId },
      data: { lastRun: new Date(), lastStatus: 'success' },
    });

    // Rétention : supprimer les runs les plus anciens au-delà de retentionCount
    if (schedule.retentionCount) {
      const allRuns = await db.scheduledBackupRun.findMany({
        where: { scheduleId, status: 'success' },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      });
      if (allRuns.length > schedule.retentionCount) {
        const toDelete = allRuns.slice(schedule.retentionCount).map((r) => r.id);
        await db.scheduledBackupRun.deleteMany({ where: { id: { in: toDelete } } });
      }
    }
  } catch (err) {
    await db.scheduledBackupRun.update({
      where: { id: run.id },
      data: { completedAt: new Date(), status: 'error', errorMessage: err.message },
    });
    await db.scheduledBackup.update({
      where: { id: scheduleId },
      data: { lastRun: new Date(), lastStatus: 'error' },
    });
  } finally {
    if (ssh) { try { await sshService.closeConnection(ssh); } catch (_) {} }
    if (tmpPath) { try { fs.unlinkSync(tmpPath); } catch (_) {} }
  }
}

function registerTask(schedule) {
  if (activeTasks.has(schedule.id)) {
    activeTasks.get(schedule.id).stop();
    activeTasks.delete(schedule.id);
  }
  if (schedule.status !== 'active') return;

  const task = cron.schedule(schedule.cronExpression, () => {
    executeSchedule(schedule.id).catch((err) => {
      console.error(`[scheduler] Erreur tâche ${schedule.id}:`, err.message);
    });
  });
  activeTasks.set(schedule.id, task);
}

function unregisterTask(scheduleId) {
  if (activeTasks.has(scheduleId)) {
    activeTasks.get(scheduleId).stop();
    activeTasks.delete(scheduleId);
  }
}

async function loadAll() {
  try {
    const schedules = await db.scheduledBackup.findMany({ where: { status: 'active' } });
    for (const s of schedules) {
      if (cron.validate(s.cronExpression)) {
        registerTask(s);
      }
    }
    console.log(`[scheduler] ${schedules.length} tâche(s) chargée(s)`);
  } catch (err) {
    console.error('[scheduler] Erreur au chargement:', err.message);
  }
}

module.exports = { loadAll, registerTask, unregisterTask, executeSchedule };
