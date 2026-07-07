'use strict';

const path = require('path');
const fs   = require('fs');
const { execSync } = require('child_process');

const { CRYPTO_DIR, NETWORK_DIR, generateOrgConfigtxJson, generateOrdererOrgMspJson } = require('./crypto-generator');
const { getPorts } = require('./port-allocator');
const logger = require('../utils/logger');

const CHANNEL          = 'backupchannel';
const DOCKER_NETWORK   = process.env.DOCKER_NETWORK || 'securebackup-net';
const HOST_PROJECT_DIR = process.env.HOST_PROJECT_DIR || path.resolve(NETWORK_DIR, '../..');
const HOST_CRYPTO      = path.join(HOST_PROJECT_DIR, 'network', 'crypto-config');
const HOST_ARTIFACTS   = path.join(HOST_PROJECT_DIR, 'network', 'channel-artifacts');

const ORG1_DOMAIN = 'org1.example.com';

/**
 * Lance une commande fabric-tools via docker run en tant qu'adminN.
 * signerOrgNum : org dont on utilise les credentials (default 1).
 */
function fabricRun(cmd, signerOrgNum = 1) {
  const n      = signerOrgNum;
  const domain = `org${n}.example.com`;
  const ports  = n === 1 ? { peer: 7051 } : getPorts(n);
  const fullCmd = [
    'docker run --rm',
    `--network ${DOCKER_NETWORK}`,
    `-v "${HOST_CRYPTO}:/etc/hyperledger/crypto-config"`,
    `-v "${HOST_ARTIFACTS}:/etc/hyperledger/channel-artifacts"`,
    `-e CORE_PEER_TLS_ENABLED=true`,
    `-e CORE_PEER_LOCALMSPID=Org${n}MSP`,
    `-e CORE_PEER_ADDRESS=peer0.${domain}:${ports.peer}`,
    `-e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/peerOrganizations/${domain}/users/Admin@${domain}/msp`,
    `-e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/peerOrganizations/${domain}/peers/peer0.${domain}/tls/ca.crt`,
    'hyperledger/fabric-tools:2.5.4',
    cmd,
  ].join(' ');
  return execSync(fullCmd, { stdio: 'pipe' });
}

const ORDERER_FLAGS = [
  `-o orderer.${ORG1_DOMAIN}:7050 --tls`,
  `--cafile /etc/hyperledger/crypto-config/ordererOrganizations/${ORG1_DOMAIN}/orderers/orderer.${ORG1_DOMAIN}/tls/ca.crt`,
].join(' ');

/**
 * Ajoute OrgN au channel backupchannel.
 * Utilise docker run fabric-tools — compatible Alpine/conteneur.
 */
async function addOrgToChannel(orgNum) {
  const workDirName = `ch_update_org${orgNum}_${Date.now()}`;
  // Backend-container path for fs.* operations
  const workDirNode = path.join(CRYPTO_DIR, workDirName);
  // Path inside fabric-tools container (HOST_CRYPTO is mounted at /etc/hyperledger/crypto-config)
  const workDirCont = `/etc/hyperledger/crypto-config/${workDirName}`;
  fs.mkdirSync(workDirNode, { recursive: true });

  try {
    // 1. Récupérer le config block courant
    fabricRun(
      `peer channel fetch config "${workDirCont}/config_block.pb" -c ${CHANNEL} ${ORDERER_FLAGS}`,
    );

    // 2. Décoder en JSON
    const decoded = fabricRun(
      `configtxlator proto_decode --input "${workDirCont}/config_block.pb" --type common.Block`,
    );
    const block  = JSON.parse(decoded.toString());
    const config = block.data.data[0].payload.data.config;

    // 3. Générer le JSON MSP du nouvel org
    const orgMspJson = generateOrgConfigtxJson(orgNum);

    // 4. Construire la config modifiée
    const modified = JSON.parse(JSON.stringify(config));

    // 4a. MSP dans Application
    const appGroups = modified.channel_group.groups.Application.groups;
    if (appGroups[`Org${orgNum}MSP`]) {
      throw Object.assign(new Error(`Org${orgNum}MSP already exists in channel`), { code: 'ALREADY_EXISTS' });
    }
    appGroups[`Org${orgNum}MSP`] = orgMspJson;

    // Note: modification de /Channel/Orderer/ConsensusType (Raft consenters) omise —
    // elle requiert la signature Org1OrdererMSP.admin, pas Org1MSP.admin.
    // L'orderer Raft reste Org1 ; Org2/Org3 contribuent uniquement comme peers endorseurs.

    // 5. Écrire config.json et modified_config.json (chemin container pour fs)
    fs.writeFileSync(path.join(workDirNode, 'config.json'),          JSON.stringify(config));
    fs.writeFileSync(path.join(workDirNode, 'modified_config.json'), JSON.stringify(modified));

    // 6. Encoder + compute_update
    fabricRun(`configtxlator proto_encode --input "${workDirCont}/config.json" --type common.Config --output "${workDirCont}/original.pb"`);
    fabricRun(`configtxlator proto_encode --input "${workDirCont}/modified_config.json" --type common.Config --output "${workDirCont}/modified.pb"`);
    fabricRun(`configtxlator compute_update --channel_id ${CHANNEL} --original "${workDirCont}/original.pb" --updated "${workDirCont}/modified.pb" --output "${workDirCont}/config_update.pb"`);

    // 7. Enveloppe
    const updateDecoded = fabricRun(
      `configtxlator proto_decode --input "${workDirCont}/config_update.pb" --type common.ConfigUpdate`,
    );
    const envelope = {
      payload: {
        header: { channel_header: { channel_id: CHANNEL, type: 2 } },
        data:   { config_update: JSON.parse(updateDecoded.toString()) },
      },
    };
    fs.writeFileSync(path.join(workDirNode, 'update_envelope.json'), JSON.stringify(envelope));
    fabricRun(`configtxlator proto_encode --input "${workDirCont}/update_envelope.json" --type common.Envelope --output "${workDirCont}/update_envelope.pb"`);

    // 8. Signer avec TOUS les orgs existants, puis soumettre
    // (politique MAJORITY : floor(N/2)+1 signatures requises ; on en fournit N)
    const existingOrgNums = Object.keys(config.channel_group.groups.Application.groups)
      .map((k) => parseInt(k.replace('Org', '').replace('MSP', ''), 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);

    // Chaque org existant signe (signconfigtx) sauf le dernier qui signe via channel update
    for (const n of existingOrgNums.slice(0, -1)) {
      logger.info(`[channel-updater] signconfigtx Org${n}MSP`);
      fabricRun(`peer channel signconfigtx -f "${workDirCont}/update_envelope.pb"`, n);
    }
    const submitterOrg = existingOrgNums[existingOrgNums.length - 1] || 1;
    logger.info(`[channel-updater] channel update (signer+submit) Org${submitterOrg}MSP`);
    fabricRun(`peer channel update -f "${workDirCont}/update_envelope.pb" -c ${CHANNEL} ${ORDERER_FLAGS}`, submitterOrg);

    return { success: true };
  } finally {
    fs.rmSync(workDirNode, { recursive: true, force: true });
  }
}

/**
 * Lance une commande fabric-tools signée par l'admin de l'org ORDERER N.
 * Nécessaire pour modifier /Channel/Orderer (consenters Raft, MSP orderer).
 */
function fabricRunAsOrdererAdmin(cmd, signerOrgNum = 1) {
  const n      = signerOrgNum;
  const domain = `org${n}.example.com`;
  return execSync([
    'docker run --rm',
    `--network ${DOCKER_NETWORK}`,
    `-v "${HOST_CRYPTO}:/etc/hyperledger/crypto-config"`,
    `-v "${HOST_ARTIFACTS}:/etc/hyperledger/channel-artifacts"`,
    `-e CORE_PEER_TLS_ENABLED=true`,
    `-e CORE_PEER_LOCALMSPID=Org${n}OrdererMSP`,
    `-e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/ordererOrganizations/${domain}/users/Admin@${domain}/msp`,
    `-e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/ordererOrganizations/${domain}/orderers/orderer.${domain}/tls/ca.crt`,
    'hyperledger/fabric-tools:2.5.4',
    cmd,
  ].join(' '), { stdio: 'pipe' });
}

/**
 * Ajoute l'orderer de l'OrgN au cluster Raft du channel et enregistre
 * son MSP dans /Channel/Orderer/groups.
 * Signé par Org1OrdererMSP.admin (seul autorisé à modifier /Channel/Orderer).
 */
async function addOrdererToRaft(orgNum) {
  const domain  = `org${orgNum}.example.com`;
  const ports   = getPorts(orgNum);
  const mspKey  = `Org${orgNum}OrdererMSP`;

  const workDirName = `raft_update_org${orgNum}_${Date.now()}`;
  const workDirNode = path.join(CRYPTO_DIR, workDirName);
  const workDirCont = `/etc/hyperledger/crypto-config/${workDirName}`;
  fs.mkdirSync(workDirNode, { recursive: true });

  try {
    // 1. Récupérer le config block courant
    fabricRun(`peer channel fetch config "${workDirCont}/config_block.pb" -c ${CHANNEL} ${ORDERER_FLAGS}`);

    // 2. Décoder le block
    const decoded = fabricRun(
      `configtxlator proto_decode --input "${workDirCont}/config_block.pb" --type common.Block`,
    );
    const block  = JSON.parse(decoded.toString());
    const config = block.data.data[0].payload.data.config;

    // 3. Vérifier si l'orderer est déjà dans le groupe Orderer
    const ordererGroups = config.channel_group.groups.Orderer.groups || {};
    if (ordererGroups[mspKey]) {
      throw Object.assign(new Error(`${mspKey} déjà dans le cluster Raft`), { code: 'ALREADY_EXISTS' });
    }

    // 4. configtxlator décode automatiquement le metadata Raft en objet JS — on le modifie directement
    const raftMeta = config.channel_group.groups.Orderer.values.ConsensusType.value.metadata;

    // 5. Lire le cert TLS du nouvel orderer (PEM → base64, format attendu par configtxlator)
    const tlsCertPath = path.join(
      CRYPTO_DIR, 'ordererOrganizations', domain,
      'orderers', `orderer.${domain}`, 'tls', 'server.crt',
    );
    const tlsCertB64 = fs.readFileSync(tlsCertPath).toString('base64');

    // 6. Construire la config modifiée
    const modified = JSON.parse(JSON.stringify(config));

    // Ajouter le consenter Raft
    modified.channel_group.groups.Orderer.values.ConsensusType.value.metadata.consenters.push({
      host:            `orderer.${domain}`,
      port:            ports.orderer,
      client_tls_cert: tlsCertB64,
      server_tls_cert: tlsCertB64,
    });

    // Ajouter le MSP orderer dans /Channel/Orderer/groups (pour que les peers connaissent l'org)
    modified.channel_group.groups.Orderer.groups[mspKey] = generateOrdererOrgMspJson(orgNum);

    // 7. Encoder + compute_update
    fs.writeFileSync(path.join(workDirNode, 'config.json'),          JSON.stringify(config));
    fs.writeFileSync(path.join(workDirNode, 'modified_config.json'), JSON.stringify(modified));

    fabricRun(`configtxlator proto_encode --input "${workDirCont}/config.json" --type common.Config --output "${workDirCont}/original.pb"`);
    fabricRun(`configtxlator proto_encode --input "${workDirCont}/modified_config.json" --type common.Config --output "${workDirCont}/modified.pb"`);
    fabricRun(`configtxlator compute_update --channel_id ${CHANNEL} --original "${workDirCont}/original.pb" --updated "${workDirCont}/modified.pb" --output "${workDirCont}/config_update.pb"`);

    // 9. Enveloppe
    const updateDecoded = fabricRun(
      `configtxlator proto_decode --input "${workDirCont}/config_update.pb" --type common.ConfigUpdate`,
    );
    const envelope = {
      payload: {
        header: { channel_header: { channel_id: CHANNEL, type: 2 } },
        data:   { config_update: JSON.parse(updateDecoded.toString()) },
      },
    };
    fs.writeFileSync(path.join(workDirNode, 'update_envelope.json'), JSON.stringify(envelope));
    fabricRun(`configtxlator proto_encode --input "${workDirCont}/update_envelope.json" --type common.Envelope --output "${workDirCont}/update_envelope.pb"`);

    // 9b. Reconstruire le bundle TLS CA (monté dans tous les orderers via CLUSTER_ROOTCAS)
    rebuildOrdererClusterCaBundle();

    // 10. Signer avec TOUS les orgs orderer existants (MAJORITY), soumettre avec le dernier
    const existingOrdererNums = Object.keys(config.channel_group.groups.Orderer.groups || {})
      .map((k) => parseInt(k.replace('Org', '').replace('OrdererMSP', ''), 10))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);
    // Si /Channel/Orderer/groups est vide (Fabric n'y met pas Org1 par défaut), on signe avec Org1 seul
    const ordererSigners = existingOrdererNums.length > 0 ? existingOrdererNums : [1];

    for (const n of ordererSigners.slice(0, -1)) {
      logger.info(`[channel-updater] Raft signconfigtx Org${n}OrdererMSP`);
      fabricRunAsOrdererAdmin(`peer channel signconfigtx -f "${workDirCont}/update_envelope.pb"`, n);
    }
    const ordererSubmitter = ordererSigners[ordererSigners.length - 1];
    logger.info(`[channel-updater] Raft channel update (sign+submit) Org${ordererSubmitter}OrdererMSP`);
    fabricRunAsOrdererAdmin(`peer channel update -f "${workDirCont}/update_envelope.pb" -c ${CHANNEL} ${ORDERER_FLAGS}`, ordererSubmitter);

    return { success: true };
  } finally {
    fs.rmSync(workDirNode, { recursive: true, force: true });
  }
}

/**
 * Fait rejoindre l'orderer de l'OrgN au channel backupchannel via l'API de participation
 * (osnadmin channel join). L'orderer doit être démarré avec ORDERER_CHANNELPARTICIPATION_ENABLED=true
 * et ORDERER_ADMIN_TLS_CLIENTAUTHREQUIRED=false.
 */
async function joinOrdererToChannel(orgNum) {
  const domain    = `org${orgNum}.example.com`;
  // Admin port INSIDE le réseau Docker (toujours 9443 — la valeur hôte de ports.ordererAdmin
  // est le port exposé sur l'hôte, mais osnadmin tourne dans le réseau Docker et se connecte
  // directement au conteneur sur son port interne 9443).
  const adminPort = 9443;

  const workDirName = `orderjoin_org${orgNum}_${Date.now()}`;
  const workDirNode = path.join(CRYPTO_DIR, workDirName);
  const workDirCont = `/etc/hyperledger/crypto-config/${workDirName}`;
  fs.mkdirSync(workDirNode, { recursive: true });

  // Chemin du block de génèse du channel (toujours disponible localement)
  const genesisBlockNode = path.join(path.dirname(CRYPTO_DIR), 'channel-artifacts', `${CHANNEL}.block`);
  const genesisBlockCont = `/etc/hyperledger/channel-artifacts/${CHANNEL}.block`;

  try {
    // 1. Tenter de récupérer le dernier config block du channel (orderer en ligne)
    //    En cas d'échec (quorum perdu), utiliser le block de genèse local.
    let blockFileCont;
    try {
      fabricRun(
        `peer channel fetch config "${workDirCont}/config_block.pb" -c ${CHANNEL} ${ORDERER_FLAGS}`,
      );
      blockFileCont = `${workDirCont}/config_block.pb`;
      logger.info(`[channel-updater] joinOrdererToChannel: config block fetched depuis l'orderer`);
    } catch (_) {
      if (!fs.existsSync(genesisBlockNode)) throw new Error(`Orderer indisponible et ${CHANNEL}.block absent`);
      blockFileCont = genesisBlockCont;
      logger.warn(`[channel-updater] joinOrdererToChannel: orderer indisponible, utilisation du bloc génèse local`);
    }

    // 2. Appeler osnadmin channel join sur le port admin de l'orderer
    // Le mutual TLS admin utilise le cert TLS de l'orderer lui-même comme client cert
    const tlsBase       = `/etc/hyperledger/crypto-config/ordererOrganizations/${domain}/orderers/orderer.${domain}/tls`;
    const caCertCont    = `${tlsBase}/ca.crt`;
    const clientCertCont = `${tlsBase}/server.crt`;
    const clientKeyCont  = `${tlsBase}/server.key`;

    const HOST_ARTIFACTS_DIR = path.join(path.dirname(HOST_CRYPTO), 'channel-artifacts');
    const joinCmd = [
      'docker run --rm',
      `--network ${DOCKER_NETWORK}`,
      `-v "${HOST_CRYPTO}:/etc/hyperledger/crypto-config"`,
      `-v "${HOST_ARTIFACTS_DIR}:/etc/hyperledger/channel-artifacts"`,
      'hyperledger/fabric-tools:2.5.4',
      `osnadmin channel join`,
      `--channelID ${CHANNEL}`,
      `--config-block "${blockFileCont}"`,
      `-o orderer.${domain}:${adminPort}`,
      `--ca-file "${caCertCont}"`,
      `--client-cert "${clientCertCont}"`,
      `--client-key "${clientKeyCont}"`,
    ].join(' ');

    logger.info(`[channel-updater] osnadmin channel join Org${orgNum} sur port ${adminPort}`);
    execSync(joinCmd, { stdio: 'pipe' });

    return { success: true };
  } finally {
    fs.rmSync(workDirNode, { recursive: true, force: true });
  }
}

/**
 * Reconstruit le bundle PEM des TLS CA de tous les orderers déployés.
 * Monté dans les conteneurs orderer comme ORDERER_GENERAL_CLUSTER_ROOTCAS.
 * À appeler après chaque addOrdererToRaft pour que les futurs orderers puissent
 * vérifier les certs TLS de tous les orderers existants.
 */
function rebuildOrdererClusterCaBundle() {
  const ordererOrgsDir = path.join(CRYPTO_DIR, 'ordererOrganizations');
  if (!fs.existsSync(ordererOrgsDir)) return;

  const certs = fs.readdirSync(ordererOrgsDir)
    .sort()
    .map((domain) => {
      const caPath = path.join(ordererOrgsDir, domain, 'orderers', `orderer.${domain}`, 'tls', 'ca.crt');
      return fs.existsSync(caPath) ? fs.readFileSync(caPath, 'utf8') : null;
    })
    .filter(Boolean);

  const bundlePath = path.join(CRYPTO_DIR, 'orderer-cluster-tls-ca-bundle.crt');
  fs.writeFileSync(bundlePath, certs.join('\n'));
  logger.info(`[channel-updater] Bundle TLS CA orderer reconstruit (${certs.length} CA)`);
}

module.exports = { addOrgToChannel, addOrdererToRaft, joinOrdererToChannel, rebuildOrdererClusterCaBundle };
