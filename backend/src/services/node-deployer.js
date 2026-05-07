'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const sshService = require('./ssh');
const logger = require('../utils/logger');

const NETWORK_DIR = path.resolve(__dirname, '../../../network');
const CRYPTO_DIR  = path.join(NETWORK_DIR, 'crypto-config');
const ARTIFACTS_DIR = path.join(NETWORK_DIR, 'channel-artifacts');

const REMOTE_BASE = '/opt/securebackup-chain';

// ── Étapes de déploiement ─────────────────────────────────────────────────────
const STEPS = [
  { id: 'connect',    label: 'Connexion SSH',                   pct: 5  },
  { id: 'docker',     label: 'Vérification Docker',             pct: 12 },
  { id: 'mkdir',      label: 'Création des répertoires',        pct: 18 },
  { id: 'certs',      label: 'Transfert des certificats',       pct: 50 },
  { id: 'artifacts',  label: 'Transfert channel artifacts',     pct: 60 },
  { id: 'compose',    label: 'Transfert docker-compose',        pct: 65 },
  { id: 'chaincode',  label: 'Transfert chaincode',             pct: 70 },
  { id: 'env',        label: 'Configuration .env',              pct: 72 },
  { id: 'pull',       label: 'Téléchargement images Docker',    pct: 82 },
  { id: 'start',      label: 'Démarrage des services',          pct: 90 },
  { id: 'join',       label: 'Jointure du channel Fabric',      pct: 96 },
  { id: 'done',       label: 'Déploiement terminé',             pct: 100 },
];

// ── Utilitaire : compresse un dossier local en tar.gz ─────────────────────────
function packDir(localDir) {
  const base    = path.dirname(localDir);
  const dirName = path.basename(localDir);
  const tmp     = path.join(os.tmpdir(), `sbchain_${Date.now()}.tar.gz`);
  execSync(`tar -czf "${tmp}" -C "${base}" "${dirName}"`);
  return tmp;
}

// ── Déploiement principal ─────────────────────────────────────────────────────
async function deployNode(options, onEvent) {
  const {
    orgNum,               // 1 | 2 | 3
    sshHost,
    sshPort = 22,
    sshUser,
    sshPassword,
    sshKey,               // contenu PEM optionnel
    networkIps,           // { org1, org2, org3 }
    chaincodeId,          // ex: "backup-cc_1.0:abc123"
  } = options;

  const org      = `Org${orgNum}`;
  const orgLower = `org${orgNum}`;
  const compose  = `docker-compose-node${orgNum}.yaml`;

  const emit = (stepId, extra = {}) => {
    const step = STEPS.find((s) => s.id === stepId);
    onEvent({
      step: stepId,
      label: step?.label || stepId,
      progress: step?.pct || 0,
      ...extra,
    });
  };

  const sshParams = {
    host: sshHost,
    port: sshPort,
    username: sshUser,
    auth_type: sshKey ? 'key' : 'password',
    credentials: sshKey ? { privateKey: sshKey } : { password: sshPassword },
  };

  let ssh;
  try {
    // ── 1. Connexion SSH ──────────────────────────────────────────────────────
    emit('connect', { log: `Connexion SSH ${sshUser}@${sshHost}:${sshPort}…` });
    ssh = await sshService.connect(sshParams);
    emit('connect', { log: 'Connexion établie', done: false });

    // ── 2. Vérifier / installer Docker ───────────────────────────────────────
    emit('docker', { log: 'Vérification de Docker…' });
    const dockerVer = await ssh.execCommand('docker --version 2>/dev/null || echo MISSING');
    if (dockerVer.stdout.includes('MISSING')) {
      emit('docker', { log: 'Docker absent — installation en cours (peut prendre 2-3 min)…' });
      const install = await ssh.execCommand(
        'curl -fsSL https://get.docker.com | sh && systemctl enable --now docker',
      );
      if (install.code !== 0) throw new Error(`Échec installation Docker : ${install.stderr}`);
      emit('docker', { log: 'Docker installé' });
    } else {
      emit('docker', { log: `Docker OK : ${dockerVer.stdout.trim()}` });
    }

    // ── 3. Créer répertoires ──────────────────────────────────────────────────
    emit('mkdir', { log: `Création de ${REMOTE_BASE}/network…` });
    await ssh.execCommand([
      `mkdir -p ${REMOTE_BASE}/network/crypto-config/ordererOrganizations`,
      `mkdir -p ${REMOTE_BASE}/network/crypto-config/peerOrganizations`,
      `mkdir -p ${REMOTE_BASE}/network/channel-artifacts`,
      `mkdir -p ${REMOTE_BASE}/chaincode`,
    ].join(' && '));
    emit('mkdir', { log: 'Répertoires créés' });

    // ── 4. Transfert certificats ──────────────────────────────────────────────
    emit('certs', { log: `Compression crypto-config/${orgLower}…` });

    const ordererDir  = path.join(CRYPTO_DIR, 'ordererOrganizations', `${orgLower}.example.com`);
    const peerDir     = path.join(CRYPTO_DIR, 'peerOrganizations',    `${orgLower}.example.com`);
    const ordererTar  = packDir(ordererDir);
    const peerTar     = packDir(peerDir);

    emit('certs', { log: 'Envoi ordererOrganizations…' });
    await ssh.putFile(ordererTar,
      `/tmp/orderer_${orgLower}.tar.gz`);
    await ssh.execCommand(
      `tar -xzf /tmp/orderer_${orgLower}.tar.gz -C ${REMOTE_BASE}/network/crypto-config/ordererOrganizations && rm /tmp/orderer_${orgLower}.tar.gz`,
    );

    emit('certs', { log: 'Envoi peerOrganizations…' });
    await ssh.putFile(peerTar,
      `/tmp/peer_${orgLower}.tar.gz`);
    await ssh.execCommand(
      `tar -xzf /tmp/peer_${orgLower}.tar.gz -C ${REMOTE_BASE}/network/crypto-config/peerOrganizations && rm /tmp/peer_${orgLower}.tar.gz`,
    );

    fs.unlinkSync(ordererTar);
    fs.unlinkSync(peerTar);
    emit('certs', { log: 'Certificats transférés' });

    // ── 5. Transfert channel artifacts ───────────────────────────────────────
    emit('artifacts', { log: 'Envoi genesis.block et backupchannel.block…' });
    await ssh.putFile(
      path.join(ARTIFACTS_DIR, 'genesis.block'),
      `${REMOTE_BASE}/network/channel-artifacts/genesis.block`,
    );
    const channelBlock = path.join(ARTIFACTS_DIR, 'backupchannel.block');
    if (fs.existsSync(channelBlock)) {
      await ssh.putFile(channelBlock,
        `${REMOTE_BASE}/network/channel-artifacts/backupchannel.block`);
    }
    emit('artifacts', { log: 'Artifacts transférés' });

    // ── 6. Transfert docker-compose ───────────────────────────────────────────
    emit('compose', { log: `Envoi ${compose}…` });
    await ssh.putFile(
      path.join(NETWORK_DIR, compose),
      `${REMOTE_BASE}/network/${compose}`,
    );
    emit('compose', { log: 'docker-compose transféré' });

    // ── 7. Transfert chaincode ────────────────────────────────────────────────
    emit('chaincode', { log: 'Compression chaincode…' });
    const chaincodeLocal = path.resolve(NETWORK_DIR, '../chaincode');
    if (fs.existsSync(chaincodeLocal)) {
      const chaincodeTar = packDir(chaincodeLocal);
      await ssh.putFile(chaincodeTar, `/tmp/chaincode.tar.gz`);
      await ssh.execCommand(
        `tar -xzf /tmp/chaincode.tar.gz -C ${REMOTE_BASE} && rm /tmp/chaincode.tar.gz`,
      );
      fs.unlinkSync(chaincodeTar);
    }
    emit('chaincode', { log: 'Chaincode transféré' });

    // ── 8. Écriture .env ─────────────────────────────────────────────────────
    emit('env', { log: 'Génération .env…' });
    const envContent = [
      `ORG1_IP=${networkIps.org1}`,
      `ORG2_IP=${networkIps.org2}`,
      `ORG3_IP=${networkIps.org3}`,
      `CHAINCODE_ID=${chaincodeId || 'backup-cc_1.0:placeholder'}`,
    ].join('\n');
    await ssh.execCommand(`cat > ${REMOTE_BASE}/network/.env << 'ENVEOF'\n${envContent}\nENVEOF`);
    emit('env', { log: '.env créé' });

    // ── 9. Pull images Docker ─────────────────────────────────────────────────
    emit('pull', { log: 'Téléchargement des images (peut prendre 3-5 min)…' });
    const pullResult = await ssh.execCommand(
      `cd ${REMOTE_BASE}/network && docker compose -f ${compose} --env-file .env pull 2>&1 | tail -5`,
      { execOptions: { pty: false } },
    );
    emit('pull', { log: pullResult.stdout || 'Images prêtes' });

    // ── 10. Démarrage ─────────────────────────────────────────────────────────
    emit('start', { log: 'Démarrage des services Docker…' });
    const startResult = await ssh.execCommand(
      `cd ${REMOTE_BASE}/network && docker compose -f ${compose} --env-file .env up -d 2>&1`,
    );
    if (startResult.code !== 0 && startResult.stderr.includes('Error')) {
      throw new Error(`docker compose up échoué : ${startResult.stderr}`);
    }
    emit('start', { log: 'Services démarrés — attente 12s…' });
    await new Promise((r) => setTimeout(r, 12000));

    // Vérification conteneurs
    const psResult = await ssh.execCommand(
      `cd ${REMOTE_BASE}/network && docker compose -f ${compose} ps --format "table {{.Name}}\\t{{.Status}}" 2>&1`,
    );
    emit('start', { log: psResult.stdout || 'Conteneurs actifs' });

    // ── 11. Jointure channel ──────────────────────────────────────────────────
    const blockPath = `${REMOTE_BASE}/network/channel-artifacts/backupchannel.block`;
    const blockExists = await ssh.execCommand(`test -f ${blockPath} && echo yes || echo no`);

    if (blockExists.stdout.trim() === 'yes') {
      emit('join', { log: `Jointure de peer0.${orgLower} au channel backupchannel…` });
      const ports = { 1: 7051, 2: 8051, 3: 9051 };
      const joinCmd = [
        `docker run --rm`,
        `--network securebackup-fabric`,
        `-v ${REMOTE_BASE}/network/crypto-config:/etc/hyperledger/crypto-config`,
        `-v ${REMOTE_BASE}/network/channel-artifacts:/etc/hyperledger/channel-artifacts`,
        `-e CORE_PEER_LOCALMSPID=${org}MSP`,
        `-e CORE_PEER_TLS_ENABLED=true`,
        `-e CORE_PEER_ADDRESS=peer0.${orgLower}.example.com:${ports[orgNum]}`,
        `-e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/peerOrganizations/${orgLower}.example.com/users/Admin@${orgLower}.example.com/msp`,
        `-e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/peerOrganizations/${orgLower}.example.com/peers/peer0.${orgLower}.example.com/tls/ca.crt`,
        `hyperledger/fabric-tools:2.5.4`,
        `peer channel join -b /etc/hyperledger/channel-artifacts/backupchannel.block`,
      ].join(' ');
      const joinResult = await ssh.execCommand(joinCmd);
      if (joinResult.code === 0) {
        emit('join', { log: `peer0.${orgLower} a rejoint backupchannel` });
      } else {
        emit('join', { log: `Attention : jointure échouée — ${joinResult.stderr.slice(0, 200)}`, warn: true });
      }
    } else {
      emit('join', { log: 'backupchannel.block absent — jointure à faire manuellement', warn: true });
    }

    // ── Terminé ───────────────────────────────────────────────────────────────
    emit('done', { log: `Nœud ${orgNum} (${org}) déployé avec succès sur ${sshHost}`, success: true });
    logger.info(`[node-deployer] ${org} deployed to ${sshHost}`);
    return { success: true };

  } catch (err) {
    logger.error(`[node-deployer] Erreur : ${err.message}`);
    onEvent({ step: 'error', label: 'Erreur', progress: 0, error: err.message, log: `ERREUR : ${err.message}` });
    return { success: false, error: err.message };
  } finally {
    if (ssh) await sshService.closeConnection(ssh).catch(() => {});
  }
}

module.exports = { deployNode, STEPS };
