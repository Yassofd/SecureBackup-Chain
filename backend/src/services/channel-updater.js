'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync } = require('child_process');

const { NETWORK_DIR, BIN_DIR, generateOrgConfigtxJson } = require('./crypto-generator');
const { getPorts } = require('./port-allocator');

const CONFIGTXLATOR = path.join(BIN_DIR, 'configtxlator');
const PEER_BIN      = path.join(BIN_DIR, 'peer');
const CRYPTO_DIR    = path.join(NETWORK_DIR, 'crypto-config');
const CHANNEL       = 'backupchannel';

// Org1 est joignable via localhost (ports mappés)
const ORG1_ORDERER   = 'localhost:7050';
const ORG1_DOMAIN    = 'org1.example.com';
const ORG1_ADMIN_MSP = path.join(CRYPTO_DIR, 'peerOrganizations', ORG1_DOMAIN, 'users', `Admin@${ORG1_DOMAIN}`, 'msp');
const ORG1_TLS_CA    = path.join(CRYPTO_DIR, 'ordererOrganizations', ORG1_DOMAIN, 'tlsca', `tlsca.${ORG1_DOMAIN}-cert.pem`);
const ORG1_PEER_TLS  = path.join(CRYPTO_DIR, 'peerOrganizations', ORG1_DOMAIN, 'peers', `peer0.${ORG1_DOMAIN}`, 'tls', 'ca.crt');

function env1() {
  return {
    FABRIC_CFG_PATH:          path.join(BIN_DIR, '..', 'config'),
    CORE_PEER_TLS_ENABLED:    'true',
    CORE_PEER_LOCALMSPID:     'Org1MSP',
    CORE_PEER_MSPCONFIGPATH:  ORG1_ADMIN_MSP,
    CORE_PEER_ADDRESS:        'localhost:7051',
    CORE_PEER_TLS_ROOTCERT_FILE: ORG1_PEER_TLS,
  };
}

function run(cmd, extraEnv = {}) {
  return execSync(cmd, {
    stdio: 'pipe',
    env:   { ...process.env, ...env1(), ...extraEnv },
  });
}

function certB64(certPath) {
  const pem = fs.readFileSync(certPath, 'utf8');
  return Buffer.from(pem).toString('base64');
}

/**
 * Ajoute OrgN au channel :
 *  - MSP dans Application.groups
 *  - Orderer TLS cert dans Orderer.ConsensusType.metadata.consenters (Raft)
 * Les deux modifications sont soumises en une seule transaction.
 */
async function addOrgToChannel(orgNum) {
  const tmpDir = path.join(os.tmpdir(), `ch_update_org${orgNum}_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 1. Récupérer le config block courant
    const configPb = path.join(tmpDir, 'config_block.pb');
    run(`"${PEER_BIN}" channel fetch config "${configPb}" -c ${CHANNEL} -o ${ORG1_ORDERER} --tls --cafile "${ORG1_TLS_CA}"`);

    // 2. Décoder en JSON
    const decoded = run(`"${CONFIGTXLATOR}" proto_decode --input "${configPb}" --type common.Block`);
    const block   = JSON.parse(decoded.toString());
    const config  = block.data.data[0].payload.data.config;

    // 3. Générer le JSON MSP du nouvel org
    const orgMspJson = generateOrgConfigtxJson(orgNum);

    // 4. Construire la config modifiée
    const modified = JSON.parse(JSON.stringify(config));

    // 4a. Ajouter le MSP dans Application
    const appGroups = modified.channel_group.groups.Application.groups;
    if (appGroups[`Org${orgNum}MSP`]) {
      throw Object.assign(new Error(`Org${orgNum}MSP already exists in channel`), { code: 'ALREADY_EXISTS' });
    }
    appGroups[`Org${orgNum}MSP`] = orgMspJson;

    // 4b. Ajouter l'orderer aux consenters Raft
    const ports      = getPorts(orgNum);
    const lower      = `org${orgNum}`;
    const domain     = `${lower}.example.com`;
    const ordererTlsCert = path.join(
      CRYPTO_DIR, 'ordererOrganizations', domain, 'orderers', `orderer.${domain}`, 'tls', 'server.crt',
    );

    if (fs.existsSync(ordererTlsCert)) {
      const tlsCertB64 = certB64(ordererTlsCert);
      const consenters = modified.channel_group.groups.Orderer.values.ConsensusType.value.metadata.consenters;
      const alreadyIn  = consenters.some((c) => c.host === `orderer.${domain}`);
      if (!alreadyIn) {
        consenters.push({
          client_tls_cert: tlsCertB64,
          host:            `orderer.${domain}`,
          port:            ports.orderer,
          server_tls_cert: tlsCertB64,
        });
      }
    }

    // 5. Encoder original + modified
    const configJsonPath   = path.join(tmpDir, 'config.json');
    const modifiedJsonPath = path.join(tmpDir, 'modified_config.json');
    fs.writeFileSync(configJsonPath,   JSON.stringify(config));
    fs.writeFileSync(modifiedJsonPath, JSON.stringify(modified));

    const origPb = path.join(tmpDir, 'original.pb');
    const modPb  = path.join(tmpDir, 'modified.pb');
    run(`"${CONFIGTXLATOR}" proto_encode --input "${configJsonPath}"   --type common.Config --output "${origPb}"`);
    run(`"${CONFIGTXLATOR}" proto_encode --input "${modifiedJsonPath}" --type common.Config --output "${modPb}"`);

    // 6. Delta
    const updatePb = path.join(tmpDir, 'config_update.pb');
    run(`"${CONFIGTXLATOR}" compute_update --channel_id ${CHANNEL} --original "${origPb}" --updated "${modPb}" --output "${updatePb}"`);

    // 7. Enveloppe
    const updateDecoded   = run(`"${CONFIGTXLATOR}" proto_decode --input "${updatePb}" --type common.ConfigUpdate`);
    const envelope        = {
      payload: {
        header: { channel_header: { channel_id: CHANNEL, type: 2 } },
        data:   { config_update: JSON.parse(updateDecoded.toString()) },
      },
    };
    const envelopeJsonPath = path.join(tmpDir, 'update_envelope.json');
    const envelopePb       = path.join(tmpDir, 'update_envelope.pb');
    fs.writeFileSync(envelopeJsonPath, JSON.stringify(envelope));
    run(`"${CONFIGTXLATOR}" proto_encode --input "${envelopeJsonPath}" --type common.Envelope --output "${envelopePb}"`);

    // 8. Signer + soumettre
    run(`"${PEER_BIN}" channel signconfigtx -f "${envelopePb}"`);
    run(`"${PEER_BIN}" channel update -f "${envelopePb}" -c ${CHANNEL} -o ${ORG1_ORDERER} --tls --cafile "${ORG1_TLS_CA}"`);

    return { success: true };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { addOrgToChannel };
