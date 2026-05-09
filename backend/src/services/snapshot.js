'use strict';
const { execSync }  = require('child_process');
const fs            = require('fs');
const path          = require('path');
const cron          = require('node-cron');
const logger        = require('../utils/logger');
const env           = require('../../config/env');

const SNAPSHOT_DIR  = path.resolve(__dirname, '../../../snapshots');
const NETWORK_BASE  = path.resolve(__dirname, '../../../network');
const FABRIC_BIN    = path.resolve(__dirname, '../../../network/fabric-samples/bin');
const FABRIC_CFG    = path.resolve(__dirname, '../../../network/fabric-samples/config');
const CRYPTO_BASE   = path.resolve(__dirname, '../../../network/crypto-config');

const PEER_TLS_CERT = path.join(CRYPTO_BASE,
  'peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt');
const ADMIN_MSP     = path.join(CRYPTO_BASE,
  'peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp');
const ORDERER_CA    = path.join(CRYPTO_BASE,
  'ordererOrganizations/org1.example.com/orderers/orderer.org1.example.com/tls/ca.crt');

function ensureDir() {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
}

function datestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function cleanOld(prefix, keepDays = 30) {
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(SNAPSHOT_DIR)) {
    if (!f.startsWith(prefix)) continue;
    const full = path.join(SNAPSHOT_DIR, f);
    if (fs.statSync(full).mtimeMs < cutoff) {
      fs.unlinkSync(full);
      logger.info('Snapshot expiré supprimé', { file: f });
    }
  }
}

async function snapshotPostgres() {
  ensureDir();
  const file = path.join(SNAPSHOT_DIR, `postgres-${datestamp()}.sql.gz`);
  try {
    execSync(`pg_dump "${env.DATABASE_URL}" | gzip > "${file}"`, {
      stdio: 'pipe',
      shell: true,
    });
    const size = fs.statSync(file).size;
    logger.info('Snapshot PostgreSQL créé', { file: path.basename(file), size });
    cleanOld('postgres-');
    return file;
  } catch (err) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    logger.error('Snapshot PostgreSQL échoué', { error: err.message });
    throw err;
  }
}

async function snapshotLedger() {
  ensureDir();
  const file = path.join(SNAPSHOT_DIR, `ledger-${datestamp()}.block`);
  try {
    const peerEnv = {
      ...process.env,
      PATH: `${FABRIC_BIN}:${process.env.PATH}`,
      FABRIC_CFG_PATH: FABRIC_CFG,
      CORE_PEER_TLS_ENABLED: 'true',
      CORE_PEER_LOCALMSPID: 'Org1MSP',
      CORE_PEER_TLS_ROOTCERT_FILE: PEER_TLS_CERT,
      CORE_PEER_MSPCONFIGPATH: ADMIN_MSP,
      CORE_PEER_ADDRESS: 'localhost:7051',
    };
    execSync(
      `peer channel fetch newest "${file}" -c ${env.FABRIC.CHANNEL} ` +
      `-o localhost:7050 --ordererTLSHostnameOverride orderer.org1.example.com ` +
      `--tls --cafile "${ORDERER_CA}"`,
      { env: peerEnv, stdio: 'pipe' },
    );
    const size = fs.statSync(file).size;
    logger.info('Snapshot ledger créé', { file: path.basename(file), size });
    cleanOld('ledger-');
    return file;
  } catch (err) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    logger.error('Snapshot ledger échoué', { error: err.message });
    throw err;
  }
}

async function runAll() {
  logger.info('Démarrage snapshot quotidien');
  const results = { postgres: null, ledger: null, errors: [] };
  try { results.postgres = await snapshotPostgres(); } catch (e) { results.errors.push('postgres: ' + e.message); }
  try { results.ledger   = await snapshotLedger();   } catch (e) { results.errors.push('ledger: '   + e.message); }
  logger.info('Snapshot quotidien terminé', results);
  return results;
}

let task = null;

function start() {
  if (task) return;
  // Tous les jours à 02:00
  task = cron.schedule('0 2 * * *', () => {
    runAll().catch((err) => logger.error('Snapshot cron error', { error: err.message }));
  });
  logger.info('Snapshot cron démarré (quotidien à 02:00)');
}

function stop() {
  if (task) { task.stop(); task = null; }
}

module.exports = { start, stop, runAll, snapshotPostgres, snapshotLedger };
