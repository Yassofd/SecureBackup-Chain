'use strict';
const Docker = require('dockerode');
const { PrismaClient } = require('@prisma/client');
const { notifyAdmins } = require('./notifications');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const prisma = new PrismaClient();

// Conteneurs Fabric/IPFS à surveiller avec leur type et organisation
const WATCHED_CONTAINERS = [
  { name: 'orderer1.example.com',   type: 'orderer',  org: 'OrdererOrg', port: 7050 },
  { name: 'orderer2.example.com',   type: 'orderer',  org: 'OrdererOrg', port: 8050 },
  { name: 'orderer3.example.com',   type: 'orderer',  org: 'OrdererOrg', port: 9050 },
  { name: 'peer0.org1.example.com', type: 'peer',     org: 'Org1MSP',    port: 7051 },
  { name: 'ca.org1.example.com',    type: 'ca',       org: 'Org1MSP',    port: 7054 },
  { name: 'couchdb0',               type: 'couchdb',  org: 'Org1MSP',    port: 5984 },
  { name: 'ipfs0',                  type: 'ipfs',     org: null,         port: 5001 },
  { name: 'backup-cc',              type: 'chaincode', org: 'Org1MSP',   port: null },
];

let intervalHandle = null;
const prevStatus = {};

async function getContainerMetrics(containerName) {
  try {
    const container = docker.getContainer(containerName);
    const info = await container.inspect();

    const running = info.State.Running;
    const health = info.State.Health ? info.State.Health.Status : null;

    let status = 'offline';
    if (running && health === 'healthy') status = 'online';
    else if (running && health === 'unhealthy') status = 'degraded';
    else if (running) status = 'online';

    const metrics = {
      image:   info.Config.Image,
      started: info.State.StartedAt,
      health:  health || 'none',
      pid:     info.State.Pid,
    };

    // Ajout stats CPU/mem si disponible (non-bloquant)
    try {
      const statsStream = await container.stats({ stream: false });
      if (statsStream && statsStream.cpu_stats) {
        const cpuDelta = statsStream.cpu_stats.cpu_usage.total_usage
          - statsStream.precpu_stats.cpu_usage.total_usage;
        const sysDelta = statsStream.cpu_stats.system_cpu_usage
          - statsStream.precpu_stats.system_cpu_usage;
        const numCpu = statsStream.cpu_stats.online_cpus || 1;
        metrics.cpuPercent = sysDelta > 0
          ? parseFloat(((cpuDelta / sysDelta) * numCpu * 100).toFixed(2))
          : 0;
        const mem = statsStream.memory_stats;
        if (mem && mem.usage) {
          metrics.memMB = parseFloat((mem.usage / 1024 / 1024).toFixed(1));
          metrics.memLimitMB = parseFloat((mem.limit / 1024 / 1024).toFixed(1));
        }
      }
    } catch (_) {}

    return { status, metrics };
  } catch (err) {
    return { status: 'offline', metrics: { error: err.message } };
  }
}

async function detectLeader(nodes) {
  // Interroge les logs de chaque orderer pour identifier le leader Raft actuel
  nodes.forEach((n) => { n.isLeader = false; });
  const orderers = nodes.filter((n) => n.type === 'orderer' && n.status === 'online');
  for (const ord of orderers) {
    try {
      const container = docker.getContainer(ord.name);
      const logs = await container.logs({ stdout: true, stderr: true, tail: 50 });
      const text = logs.toString('utf8');
      if (text.includes('became leader') || text.includes('Raft leader changed: 0 ->')) {
        ord.isLeader = true;
        break;
      }
    } catch (_) {}
  }
  // Fallback : si aucun leader détecté, marquer le premier orderer en ligne
  if (!orderers.some((n) => n.isLeader) && orderers.length > 0) {
    orderers[0].isLeader = true;
  }
}

async function collect() {
  try {
    const snapshots = await Promise.all(
      WATCHED_CONTAINERS.map(async (def) => {
        const { status, metrics } = await getContainerMetrics(def.name);
        return { ...def, status, metrics };
      }),
    );

    await detectLeader(snapshots);

    for (const snap of snapshots) {
      const prev = prevStatus[snap.name];

      await prisma.networkNode.upsert({
        where:  { name: snap.name },
        create: {
          name:         snap.name,
          type:         snap.type,
          organization: snap.org,
          port:         snap.port,
          status:       snap.status,
          isLeader:     snap.isLeader,
          lastSeen:     snap.status !== 'offline' ? new Date() : null,
          metrics:      snap.metrics,
        },
        update: {
          status:   snap.status,
          isLeader: snap.isLeader,
          lastSeen: snap.status !== 'offline' ? new Date() : null,
          metrics:  snap.metrics,
        },
      });

      // Alerte si passage en offline/degraded
      if (prev && prev !== snap.status && (snap.status === 'offline' || snap.status === 'degraded')) {
        notifyAdmins(
          'node_alert',
          `Nœud ${snap.status === 'offline' ? 'hors ligne' : 'dégradé'} : ${snap.name}`,
          `Le nœud ${snap.name} (${snap.type}) est passé en état "${snap.status}".`,
        ).catch(() => {});
      }
      prevStatus[snap.name] = snap.status;
    }
  } catch (err) {
    console.error('[monitoring] collect error:', err.message);
  }
}

function start() {
  if (intervalHandle) return;
  collect();
  intervalHandle = setInterval(collect, 30_000);
}

function stop() {
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
}

module.exports = { start, stop, collect };
