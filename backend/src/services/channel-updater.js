'use strict';

const path = require('path');
const fs   = require('fs');
const { execSync } = require('child_process');

const { CRYPTO_DIR, NETWORK_DIR, generateOrgConfigtxJson } = require('./crypto-generator');
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

module.exports = { addOrgToChannel };
