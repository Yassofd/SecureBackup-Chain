'use strict';

const path = require('path');
const fs   = require('fs');
const { execSync } = require('child_process');

const { NETWORK_DIR, CRYPTO_DIR, generateOrgConfigtxJson } = require('./crypto-generator');
const { getPorts } = require('./port-allocator');

const CHANNEL          = 'backupchannel';
const DOCKER_NETWORK   = process.env.DOCKER_NETWORK || 'securebackup-net';
const HOST_PROJECT_DIR = process.env.HOST_PROJECT_DIR || path.resolve(NETWORK_DIR, '../..');
const HOST_CRYPTO      = path.join(HOST_PROJECT_DIR, 'network', 'crypto-config');
const HOST_ARTIFACTS   = path.join(HOST_PROJECT_DIR, 'network', 'channel-artifacts');

const ORG1_DOMAIN = 'org1.example.com';

/**
 * Lance une commande fabric-tools via docker run.
 * Les volumes montés :
 *   HOST_CRYPTO    → /etc/hyperledger/crypto-config
 *   HOST_ARTIFACTS → /etc/hyperledger/channel-artifacts
 *   HOST_TMP       → /tmp/fabric-work  (pour les fichiers temporaires)
 */
function fabricRun(cmd, hostTmpDir) {
  const mounts = [
    `-v "${HOST_CRYPTO}:/etc/hyperledger/crypto-config"`,
    `-v "${HOST_ARTIFACTS}:/etc/hyperledger/channel-artifacts"`,
  ];
  if (hostTmpDir) {
    mounts.push(`-v "${hostTmpDir}:/tmp/fabric-work"`);
  }
  const fullCmd = [
    'docker run --rm',
    `--network ${DOCKER_NETWORK}`,
    ...mounts,
    `-e CORE_PEER_TLS_ENABLED=true`,
    `-e CORE_PEER_LOCALMSPID=Org1MSP`,
    `-e CORE_PEER_ADDRESS=peer0.${ORG1_DOMAIN}:7051`,
    `-e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/peerOrganizations/${ORG1_DOMAIN}/users/Admin@${ORG1_DOMAIN}/msp`,
    `-e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/peerOrganizations/${ORG1_DOMAIN}/peers/peer0.${ORG1_DOMAIN}/tls/ca.crt`,
    'hyperledger/fabric-tools:2.5.4',
    cmd,
  ].join(' ');
  return execSync(fullCmd, { stdio: 'pipe' });
}

const ORDERER_FLAGS = [
  `-o orderer.${ORG1_DOMAIN}:7050 --tls`,
  `--cafile /etc/hyperledger/crypto-config/ordererOrganizations/${ORG1_DOMAIN}/orderers/orderer.${ORG1_DOMAIN}/tls/ca.crt`,
].join(' ');

function certB64(certPath) {
  return Buffer.from(fs.readFileSync(certPath, 'utf8')).toString('base64');
}

/**
 * Ajoute OrgN au channel backupchannel.
 * Utilise docker run fabric-tools — compatible Alpine/conteneur.
 */
async function addOrgToChannel(orgNum) {
  // Dossier de travail dans crypto-config (partagé via bind-mount hôte→conteneur)
  const workDirName = `ch_update_org${orgNum}_${Date.now()}`;
  const workDirHost = path.join(HOST_CRYPTO, workDirName);   // chemin hôte
  const workDirCont = `/etc/hyperledger/crypto-config/${workDirName}`; // dans fabric-tools
  fs.mkdirSync(workDirHost, { recursive: true });

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

    // 4b. Orderer TLS dans consenters Raft
    const ports   = getPorts(orgNum);
    const domain  = `org${orgNum}.example.com`;
    const ordererTlsCert = path.join(
      CRYPTO_DIR, 'ordererOrganizations', domain, 'orderers', `orderer.${domain}`, 'tls', 'server.crt',
    );
    if (fs.existsSync(ordererTlsCert)) {
      const tlsCertB64 = certB64(ordererTlsCert);
      const consenters  = modified.channel_group.groups.Orderer.values.ConsensusType.value.metadata.consenters;
      if (!consenters.some((c) => c.host === `orderer.${domain}`)) {
        consenters.push({
          client_tls_cert: tlsCertB64,
          host:            `orderer.${domain}`,
          port:            ports.orderer,
          server_tls_cert: tlsCertB64,
        });
      }
    }

    // 5. Écrire config.json et modified_config.json dans le workDir hôte
    fs.writeFileSync(path.join(workDirHost, 'config.json'),          JSON.stringify(config));
    fs.writeFileSync(path.join(workDirHost, 'modified_config.json'), JSON.stringify(modified));

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
    fs.writeFileSync(path.join(workDirHost, 'update_envelope.json'), JSON.stringify(envelope));
    fabricRun(`configtxlator proto_encode --input "${workDirCont}/update_envelope.json" --type common.Envelope --output "${workDirCont}/update_envelope.pb"`);

    // 8. Signer + soumettre
    fabricRun(`peer channel signconfigtx -f "${workDirCont}/update_envelope.pb"`);
    fabricRun(`peer channel update -f "${workDirCont}/update_envelope.pb" -c ${CHANNEL} ${ORDERER_FLAGS}`);

    return { success: true };
  } finally {
    fs.rmSync(workDirHost, { recursive: true, force: true });
  }
}

module.exports = { addOrgToChannel };
