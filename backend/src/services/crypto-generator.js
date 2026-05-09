'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync } = require('child_process');

const NETWORK_DIR  = path.resolve(__dirname, '../../../network');
const CRYPTO_DIR   = path.join(NETWORK_DIR, 'crypto-config');
const BIN_DIR      = path.join(NETWORK_DIR, 'fabric-samples', 'bin');
const CRYPTOGEN    = path.join(BIN_DIR, 'cryptogen');
const CONFIGTXGEN  = path.join(BIN_DIR, 'configtxgen');

/**
 * Génère les certificats pour un nouvel org via `cryptogen extend`.
 * Crée les dossiers dans crypto-config/ordererOrganizations et peerOrganizations.
 * @param {number} orgNum
 */
function generateOrgCrypto(orgNum) {
  const lower  = `org${orgNum}`;
  const domain = `${lower}.example.com`;

  // Vérifier si les certs existent déjà
  const peerDir = path.join(CRYPTO_DIR, 'peerOrganizations', domain);
  if (fs.existsSync(peerDir)) {
    return { alreadyExists: true };
  }

  const cryptoYaml = `
PeerOrgs:
  - Name: Org${orgNum}
    Domain: ${domain}
    EnableNodeOUs: true
    Template:
      Count: 1
    Users:
      Count: 1

OrdererOrgs:
  - Name: Org${orgNum}
    Domain: ${domain}
    Specs:
      - Hostname: orderer
`;

  const tmpYaml = path.join(os.tmpdir(), `crypto-config-org${orgNum}-${Date.now()}.yaml`);
  fs.writeFileSync(tmpYaml, cryptoYaml);

  try {
    execSync(
      `"${CRYPTOGEN}" extend --config="${tmpYaml}" --input="${CRYPTO_DIR}"`,
      { stdio: 'pipe' },
    );
  } finally {
    fs.unlinkSync(tmpYaml);
  }

  return { alreadyExists: false };
}

/**
 * Génère le JSON de définition de l'org pour configtxlator (channel update).
 * Nécessite un configtx.yaml minimal présent dans le réseau.
 * @param {number} orgNum
 * @returns {object} parsed JSON du bloc configtx pour l'org
 */
function generateOrgConfigtxJson(orgNum) {
  const lower  = `org${orgNum}`;
  const domain = `${lower}.example.com`;

  // configtx minimal pour l'org
  const configtxYaml = `
Organizations:
  - &Org${orgNum}
    Name: Org${orgNum}MSP
    ID: Org${orgNum}MSP
    MSPDir: ${CRYPTO_DIR}/peerOrganizations/${domain}/msp
    Policies:
      Readers:
        Type: Signature
        Rule: "OR('Org${orgNum}MSP.admin', 'Org${orgNum}MSP.peer', 'Org${orgNum}MSP.client')"
      Writers:
        Type: Signature
        Rule: "OR('Org${orgNum}MSP.admin', 'Org${orgNum}MSP.client')"
      Admins:
        Type: Signature
        Rule: "OR('Org${orgNum}MSP.admin')"
      Endorsement:
        Type: Signature
        Rule: "OR('Org${orgNum}MSP.peer')"
    AnchorPeers:
      - Host: peer0.${domain}
        Port: ${require('./port-allocator').getPorts(orgNum).peer}
`;

  const tmpDir  = path.join(os.tmpdir(), `configtx_org${orgNum}_${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const tmpYaml = path.join(tmpDir, 'configtx.yaml');
  fs.writeFileSync(tmpYaml, configtxYaml);

  try {
    const out = execSync(
      `"${CONFIGTXGEN}" -configPath "${tmpDir}" -printOrg Org${orgNum}MSP`,
      { stdio: 'pipe' },
    );
    return JSON.parse(out.toString());
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { generateOrgCrypto, generateOrgConfigtxJson, CRYPTO_DIR, NETWORK_DIR, BIN_DIR };
