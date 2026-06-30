'use strict';

const path = require('path');
const fs   = require('fs');
const { execSync } = require('child_process');

const { getPorts, getOrgNames } = require('./port-allocator');
const { generateCompose }       = require('./compose-generator');
const { generateOrgCrypto }     = require('./crypto-generator');
const { addOrgToChannel }       = require('./channel-updater');
const logger                    = require('../utils/logger');

const NETWORK_DIR   = path.resolve(__dirname, '../../../network');
const ARTIFACTS_DIR = path.join(NETWORK_DIR, 'channel-artifacts');
const CRYPTO_DIR    = path.join(NETWORK_DIR, 'crypto-config');

const HOST_PROJECT_DIR = process.env.HOST_PROJECT_DIR || path.resolve(NETWORK_DIR, '../..');
const HOST_NETWORK_DIR = path.join(HOST_PROJECT_DIR, 'network');
const HOST_ARTIFACTS   = path.join(HOST_PROJECT_DIR, 'network', 'channel-artifacts');
const DOCKER_NETWORK   = process.env.DOCKER_NETWORK || 'securebackup-net';

const CHANNEL    = 'backupchannel';
const CC_NAME    = 'backup-cc';
const CC_VERSION = '1.0';
const ORDERER_FLAGS = [
  '--orderer orderer.org1.example.com:7050 --tls',
  '--cafile /etc/hyperledger/crypto-config/ordererOrganizations/org1.example.com/orderers/orderer.org1.example.com/tls/ca.crt',
].join(' ');

const STEPS = [
  { id: 'crypto',    label: 'Génération des certificats',    pct: 10 },
  { id: 'channel',   label: 'Mise à jour du channel',        pct: 20 },
  { id: 'compose',   label: 'Génération docker-compose',     pct: 32 },
  { id: 'pull',      label: 'Téléchargement images Docker',  pct: 52 },
  { id: 'start',     label: 'Démarrage des conteneurs',      pct: 68 },
  { id: 'join',      label: 'Jointure du channel Fabric',    pct: 78 },
  { id: 'ccinstall', label: 'Installation du chaincode',     pct: 85 },
  { id: 'ccapprove', label: 'Approbation lifecycle',         pct: 91 },
  { id: 'ccpolicy',  label: 'Mise à jour signature policy',  pct: 97 },
  { id: 'done',      label: 'Déploiement terminé',           pct: 100 },
];

/** Lance une commande fabric-tools via docker run en tant qu'admin de l'orgN. */
function fabricRun(orgNum, cmd) {
  const { org, domain } = getOrgNames(orgNum);
  const ports = getPorts(orgNum);
  return execSync([
    'docker run --rm',
    `--network ${DOCKER_NETWORK}`,
    `-v "${HOST_NETWORK_DIR}/crypto-config:/etc/hyperledger/crypto-config"`,
    `-v "${HOST_ARTIFACTS}:/etc/hyperledger/channel-artifacts"`,
    `-e CORE_PEER_TLS_ENABLED=true`,
    `-e CORE_PEER_LOCALMSPID=${org}MSP`,
    `-e CORE_PEER_ADDRESS=peer0.${domain}:${ports.peer}`,
    `-e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/peerOrganizations/${domain}/users/Admin@${domain}/msp`,
    `-e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/peerOrganizations/${domain}/peers/peer0.${domain}/tls/ca.crt`,
    'hyperledger/fabric-tools:2.5.4',
    cmd,
  ].join(' '), { stdio: 'pipe', timeout: 90_000 });
}

/** Retourne les orgNums dont les certs existent dans crypto-config/peerOrganizations. */
function getDeployedOrgNums() {
  const dir = path.join(CRYPTO_DIR, 'peerOrganizations');
  if (!fs.existsSync(dir)) return [1];
  return fs.readdirSync(dir)
    .map(d => parseInt(d.match(/org(\d+)/)?.[1]))
    .filter(Boolean)
    .sort((a, b) => a - b);
}

/** Construit la signature policy Fabric pour une liste d'orgNums. */
function buildPolicy(orgNums) {
  return `OR(${orgNums.map(n => `'Org${n}MSP.member'`).join(',')})`;
}

/**
 * Déploie un nœud Fabric/IPFS supplémentaire sur la machine locale (Docker mono-hôte).
 * @param {{ orgNum: number, knownNodes: {orgNum,ip}[], chaincodeId?: string }} options
 * @param {(event: object) => void} onEvent
 */
async function deployNode(options, onEvent) {
  const { orgNum, knownNodes = [], chaincodeId } = options;

  const { org, lower, domain } = getOrgNames(orgNum);
  const composeFile = `docker-compose-node${orgNum}.yaml`;
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
    emit('channel', { log: `Ajout de ${org} au channel ${CHANNEL}…` });
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
    fs.writeFileSync(envPath, [
      `CLUSTER_SECRET=${clusterSecret}`,
      `CHAINCODE_ID=${chaincodeId || 'backup-cc_1.0:placeholder'}`,
    ].join('\n') + '\n');
    emit('compose', { log: `${composeFile} écrit localement` });

    // ── 4. Pull des images Docker ──────────────────────────────────────────────
    emit('pull', { log: 'Téléchargement des images Docker…' });
    try {
      const pullOut = execSync(
        `docker compose -f "${composePath}" --env-file "${envPath}" pull 2>&1`,
        { cwd: NETWORK_DIR, stdio: 'pipe', timeout: 300_000 },
      ).toString();
      emit('pull', { log: pullOut.split('\n').filter(Boolean).slice(-3).join(' | ') || 'Images prêtes' });
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
      emit('join', { log: `Jointure de peer0.${lower} au channel ${CHANNEL}…` });
      try {
        fabricRun(orgNum, `peer channel join -b /etc/hyperledger/channel-artifacts/backupchannel.block`);
        emit('join', { log: `peer0.${lower} a rejoint ${CHANNEL}` });
      } catch (e) {
        emit('join', { log: `Jointure échouée — ${e.message.slice(0, 200)}`, warn: true });
      }
    } else {
      emit('join', { log: 'backupchannel.block absent — jointure manuelle nécessaire', warn: true });
    }

    // ── 7. Installation du chaincode ───────────────────────────────────────────
    const ccPackage = path.join(ARTIFACTS_DIR, 'backup-cc.tar.gz');
    let installedPkgId = null;
    if (fs.existsSync(ccPackage)) {
      emit('ccinstall', { log: `Installation du chaincode sur peer0.${lower}…` });
      try {
        fabricRun(orgNum, `peer lifecycle chaincode install /etc/hyperledger/channel-artifacts/backup-cc.tar.gz`);
        emit('ccinstall', { log: `Chaincode installé sur peer0.${lower}` });
      } catch (e) {
        emit('ccinstall', { log: `Installation chaincode échouée — ${e.message.slice(0, 200)}`, warn: true });
      }
      // Récupérer le Package ID (idempotent si déjà installé)
      try {
        const qiOut = fabricRun(orgNum, 'peer lifecycle chaincode queryinstalled').toString();
        installedPkgId = qiOut.match(/Package ID: ([^\n,]+)/)?.[1]?.trim() || null;
      } catch (_) {}
    } else {
      emit('ccinstall', { log: 'Package backup-cc.tar.gz introuvable — installation manuelle nécessaire', warn: true });
    }

    // ── 8. Approbation lifecycle (séquence courante) ───────────────────────────
    // Le nouveau peer approuve la définition commitée courante → peut endosser immédiatement.
    emit('ccapprove', { log: `Approbation lifecycle sur peer0.${lower}…` });
    let currentSeq = 1;
    try {
      const qcOut = fabricRun(1, `peer lifecycle chaincode querycommitted --channelID ${CHANNEL} --name ${CC_NAME}`).toString();
      currentSeq = parseInt(qcOut.match(/Sequence: (\d+)/)?.[1] || '1');

      if (!installedPkgId) throw new Error('Package ID inconnu — impossible d\'approuver');

      // La policy commitée = toutes les orgs déployées SAUF la nouvelle (non encore dans la policy)
      const existingOrgs   = getDeployedOrgNums().filter(n => n !== orgNum);
      const currentPolicy  = buildPolicy(existingOrgs.length ? existingOrgs : [1]);

      fabricRun(orgNum,
        `peer lifecycle chaincode approveformyorg ${ORDERER_FLAGS}` +
        ` --channelID ${CHANNEL} --name ${CC_NAME}` +
        ` --version ${CC_VERSION} --package-id "${installedPkgId}"` +
        ` --sequence ${currentSeq} --signature-policy "${currentPolicy}" --waitForEvent=false`,
      );
      emit('ccapprove', { log: `peer0.${lower} a approuvé séquence ${currentSeq}` });
    } catch (e) {
      const msg = (e.stderr || Buffer.alloc(0)).toString() + e.message;
      if (msg.includes('unchanged content')) {
        emit('ccapprove', { log: `Séquence ${currentSeq} déjà approuvée par ${org}` });
      } else {
        emit('ccapprove', { log: `Approbation échouée — ${e.message?.slice(0, 200)}`, warn: true });
      }
    }

    // ── 9. Mise à jour signature policy (nouvelle séquence) ────────────────────
    // Bumpe la séquence et ajoute le nouvel org à la policy de signature.
    emit('ccpolicy', { log: `Mise à jour de la signature policy pour inclure ${org}…` });
    try {
      if (!installedPkgId) throw new Error('Package ID manquant');

      const allOrgs   = getDeployedOrgNums();
      const newSeq    = currentSeq + 1;
      const newPolicy = buildPolicy(allOrgs);

      // Approbation par toutes les orgs (tolérant aux pannes — MAJORITY suffit)
      let approvedCount = 0;
      for (const n of allOrgs) {
        try {
          fabricRun(n,
            `peer lifecycle chaincode approveformyorg ${ORDERER_FLAGS}` +
            ` --channelID ${CHANNEL} --name ${CC_NAME}` +
            ` --version ${CC_VERSION} --package-id "${installedPkgId}"` +
            ` --sequence ${newSeq} --signature-policy "${newPolicy}" --waitForEvent=false`,
          );
          approvedCount++;
          logger.info(`[node-deployer] Org${n} a approuvé séquence ${newSeq}`);
        } catch (e) {
          const msg = (e.stderr || Buffer.alloc(0)).toString() + e.message;
          if (msg.includes('unchanged content')) { approvedCount++; continue; }
          logger.warn(`[node-deployer] approveformyorg Org${n} échoué : ${e.message?.slice(0, 100)}`);
        }
      }

      const majority = Math.floor(allOrgs.length / 2) + 1;
      if (approvedCount < majority) {
        throw new Error(`Seulement ${approvedCount}/${allOrgs.length} approbations — MAJORITY (${majority}) requises`);
      }

      // Commit avec les peer addresses de toutes les orgs
      const peerFlags = allOrgs.map(n => {
        const { domain: d } = getOrgNames(n);
        const p = getPorts(n);
        return `--peerAddresses peer0.${d}:${p.peer} --tlsRootCertFiles /etc/hyperledger/crypto-config/peerOrganizations/${d}/peers/peer0.${d}/tls/ca.crt`;
      }).join(' ');

      fabricRun(1,
        `peer lifecycle chaincode commit ${ORDERER_FLAGS}` +
        ` --channelID ${CHANNEL} --name ${CC_NAME}` +
        ` --version ${CC_VERSION} --sequence ${newSeq}` +
        ` --signature-policy "${newPolicy}" ${peerFlags}`,
      );
      emit('ccpolicy', { log: `Policy : ${newPolicy} (séquence ${newSeq})` });
    } catch (e) {
      emit('ccpolicy', { log: `Mise à jour policy échouée — ${e.message?.slice(0, 250)}`, warn: true });
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
