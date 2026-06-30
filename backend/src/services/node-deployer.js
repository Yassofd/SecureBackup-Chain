'use strict';

const path = require('path');
const fs   = require('fs');
const { execSync } = require('child_process');

const { getPorts, getOrgNames } = require('./port-allocator');
const { generateCompose }       = require('./compose-generator');
const { generateOrgCrypto }     = require('./crypto-generator');
const { addOrgToChannel }       = require('./channel-updater');
const logger                    = require('../utils/logger');

// Chemins internes au conteneur (lecture/écriture de fichiers)
const NETWORK_DIR   = path.resolve(__dirname, '../../../network');
const ARTIFACTS_DIR = path.join(NETWORK_DIR, 'channel-artifacts');

// Chemins hôte pour les commandes docker (daemon hôte ne connaît pas /securebackup/...)
const HOST_PROJECT_DIR = process.env.HOST_PROJECT_DIR || path.resolve(NETWORK_DIR, '../..');
const HOST_NETWORK_DIR = path.join(HOST_PROJECT_DIR, 'network');
const HOST_ARTIFACTS   = path.join(HOST_PROJECT_DIR, 'network', 'channel-artifacts');
const DOCKER_NETWORK   = process.env.DOCKER_NETWORK || 'securebackup-net';

const STEPS = [
  { id: 'crypto',    label: 'Génération des certificats',   pct: 10 },
  { id: 'channel',   label: 'Mise à jour du channel',       pct: 25 },
  { id: 'compose',   label: 'Génération docker-compose',    pct: 40 },
  { id: 'pull',      label: 'Téléchargement images Docker', pct: 65 },
  { id: 'start',     label: 'Démarrage des conteneurs',     pct: 85 },
  { id: 'join',      label: 'Jointure du channel Fabric',   pct: 93 },
  { id: 'ccinstall', label: 'Installation du chaincode',    pct: 97 },
  { id: 'done',      label: 'Déploiement terminé',          pct: 100 },
];

/**
 * Déploie un nœud Fabric/IPFS supplémentaire sur la machine locale (Docker mono-hôte).
 * @param {{ orgNum: number, knownNodes: {orgNum,ip}[], chaincodeId?: string }} options
 * @param {(event: object) => void} onEvent
 */
async function deployNode(options, onEvent) {
  const { orgNum, knownNodes = [], chaincodeId } = options;

  const { org, lower, domain } = getOrgNames(orgNum);
  const ports       = getPorts(orgNum);
  const composeFile = `docker-compose-node${orgNum}.yaml`;
  // Chemins conteneur (docker compose CLI tourne dans le container → chemins container)
  const composePath = path.join(NETWORK_DIR, composeFile);
  const envPath     = path.join(NETWORK_DIR, `.env.node${orgNum}`);

  const emit = (stepId, extra = {}) => {
    const step = STEPS.find((s) => s.id === stepId);
    onEvent({ step: stepId, label: step?.label || stepId, progress: step?.pct || 0, ...extra });
  };

  try {
    // ── 1. Génération crypto ───────────────────────────────────────────────────
    emit('crypto', { log: `Génération des certificats pour ${org}…` });
    const cryptoResult = generateOrgCrypto(orgNum);
    emit('crypto', { log: cryptoResult.alreadyExists ? `Certificats ${org} déjà présents` : `Certificats ${org} générés` });

    // ── 2. Mise à jour du channel Fabric ──────────────────────────────────────
    emit('channel', { log: `Ajout de ${org} au channel backupchannel…` });
    try {
      await addOrgToChannel(orgNum);
      emit('channel', { log: `${org} ajouté au channel avec succès` });
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('already exists') || msg.includes('existing')) {
        emit('channel', { log: `${org} déjà présent dans le channel — on continue`, warn: true });
      } else {
        emit('channel', { log: `Avertissement channel update : ${msg.slice(0, 150)}`, warn: true });
      }
    }

    // ── 3. Génération docker-compose et .env locaux ───────────────────────────
    emit('compose', { log: `Génération de ${composeFile}…` });
    const allNodes       = [...knownNodes, { orgNum, ip: '127.0.0.1' }];
    const composeContent = generateCompose({ orgNum, otherNodes: allNodes });
    fs.writeFileSync(composePath, composeContent);

    const clusterSecret = process.env.CLUSTER_SECRET || '0'.repeat(64);
    const envLines = [
      `CLUSTER_SECRET=${clusterSecret}`,
      `CHAINCODE_ID=${chaincodeId || 'backup-cc_1.0:placeholder'}`,
    ];
    fs.writeFileSync(envPath, envLines.join('\n') + '\n');
    emit('compose', { log: `${composeFile} écrit localement` });

    // ── 4. Pull des images Docker ──────────────────────────────────────────────
    emit('pull', { log: 'Téléchargement des images Docker…' });
    try {
      const pullOut = execSync(
        `docker compose -f "${composePath}" --env-file "${envPath}" pull 2>&1`,
        { cwd: NETWORK_DIR, stdio: 'pipe', timeout: 300_000 },
      ).toString();
      const lastLines = pullOut.split('\n').filter(Boolean).slice(-3).join(' | ');
      emit('pull', { log: lastLines || 'Images prêtes' });
    } catch (e) {
      emit('pull', { log: `Avertissement pull : ${e.message.slice(0, 150)}`, warn: true });
    }

    // ── 5. Démarrage des conteneurs ────────────────────────────────────────────
    emit('start', { log: `Démarrage des conteneurs pour ${org}…` });
    const startOut = execSync(
      `docker compose -f "${composePath}" --env-file "${envPath}" up -d 2>&1`,
      { cwd: NETWORK_DIR, stdio: 'pipe', timeout: 120_000 },
    ).toString();
    emit('start', { log: startOut.trim().split('\n').slice(-3).join(' | ') || 'Commande envoyée' });

    // Attente démarrage
    await new Promise((r) => setTimeout(r, 10_000));
    const psOut = execSync(
      `docker compose -f "${composePath}" --env-file "${envPath}" ps --format "table {{.Name}}\\t{{.Status}}" 2>&1`,
      { cwd: NETWORK_DIR, stdio: 'pipe' },
    ).toString().trim();
    const runningCount = (psOut.match(/Up|running/gi) || []).length;
    emit('start', { log: `${runningCount} conteneur(s) actif(s)` });

    if (runningCount === 0) {
      const logsOut = execSync(
        `docker compose -f "${composePath}" --env-file "${envPath}" logs --tail=20 2>&1`,
        { cwd: NETWORK_DIR, stdio: 'pipe' },
      ).toString();
      throw new Error(`Aucun conteneur actif.\n${logsOut.slice(0, 500)}`);
    }

    // ── 6. Jointure du channel ─────────────────────────────────────────────────
    const blockPath = path.join(ARTIFACTS_DIR, 'backupchannel.block');
    if (fs.existsSync(blockPath)) {
      emit('join', { log: `Jointure de peer0.${lower} au channel backupchannel…` });
      const joinCmd = [
        `docker run --rm`,
        `--network ${DOCKER_NETWORK}`,
        `-v "${HOST_NETWORK_DIR}/crypto-config:/etc/hyperledger/crypto-config"`,
        `-v "${HOST_ARTIFACTS}:/etc/hyperledger/channel-artifacts"`,
        `-e CORE_PEER_LOCALMSPID=${org}MSP`,
        `-e CORE_PEER_TLS_ENABLED=true`,
        `-e CORE_PEER_ADDRESS=peer0.${domain}:${ports.peer}`,
        `-e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/peerOrganizations/${domain}/users/Admin@${domain}/msp`,
        `-e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/peerOrganizations/${domain}/peers/peer0.${domain}/tls/ca.crt`,
        `hyperledger/fabric-tools:2.5.4`,
        `peer channel join -b /etc/hyperledger/channel-artifacts/backupchannel.block`,
      ].join(' ');
      try {
        execSync(joinCmd, { stdio: 'pipe', timeout: 60_000 });
        emit('join', { log: `peer0.${lower} a rejoint backupchannel` });
      } catch (e) {
        emit('join', { log: `Jointure échouée — ${e.message.slice(0, 200)}`, warn: true });
      }
    } else {
      emit('join', { log: 'backupchannel.block absent — jointure manuelle nécessaire', warn: true });
    }

    // ── 7. Installation du chaincode ───────────────────────────────────────────
    const ccPackage = path.join(ARTIFACTS_DIR, 'backup-cc.tar.gz');
    if (fs.existsSync(ccPackage)) {
      emit('ccinstall', { log: `Installation du chaincode sur peer0.${lower}…` });
      const ccCmd = [
        `docker run --rm`,
        `--network ${DOCKER_NETWORK}`,
        `-v "${HOST_NETWORK_DIR}/crypto-config:/etc/hyperledger/crypto-config"`,
        `-v "${HOST_ARTIFACTS}:/etc/hyperledger/channel-artifacts"`,
        `-e CORE_PEER_LOCALMSPID=${org}MSP`,
        `-e CORE_PEER_TLS_ENABLED=true`,
        `-e CORE_PEER_ADDRESS=peer0.${domain}:${ports.peer}`,
        `-e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/peerOrganizations/${domain}/users/Admin@${domain}/msp`,
        `-e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/peerOrganizations/${domain}/peers/peer0.${domain}/tls/ca.crt`,
        `hyperledger/fabric-tools:2.5.4`,
        `peer lifecycle chaincode install /etc/hyperledger/channel-artifacts/backup-cc.tar.gz`,
      ].join(' ');
      try {
        execSync(ccCmd, { stdio: 'pipe', timeout: 60_000 });
        emit('ccinstall', { log: `Chaincode installé sur peer0.${lower}` });
      } catch (e) {
        emit('ccinstall', { log: `Installation chaincode échouée — ${e.message.slice(0, 200)}`, warn: true });
      }
    } else {
      emit('ccinstall', { log: 'Package backup-cc.tar.gz introuvable — installation manuelle nécessaire', warn: true });
    }

    emit('done', { log: `Nœud ${orgNum} (${org}) démarré localement sur Docker`, success: true });
    logger.info(`[node-deployer] ${org} deployed locally`);
    return { success: true };

  } catch (err) {
    logger.error(`[node-deployer] Erreur : ${err.message}`);
    onEvent({ step: 'error', label: 'Erreur', progress: 0, error: err.message, log: `ERREUR : ${err.message}` });
    return { success: false, error: err.message };
  }
}

/**
 * Arrête et supprime les conteneurs d'un nœud déployé localement.
 */
async function stopNode(orgNum) {
  const composeFile = `docker-compose-node${orgNum}.yaml`;
  const composePath = path.join(NETWORK_DIR, composeFile);
  const envPath     = path.join(NETWORK_DIR, `.env.node${orgNum}`);
  if (!fs.existsSync(composePath)) return;
  try {
    execSync(
      `docker compose -f "${composePath}" --env-file "${envPath}" down -v 2>&1`,
      { cwd: NETWORK_DIR, stdio: 'pipe', timeout: 60_000 },
    );
  } catch (_) {}
}

module.exports = { deployNode, stopNode, STEPS };
