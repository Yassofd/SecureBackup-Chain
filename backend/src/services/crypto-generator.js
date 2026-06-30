'use strict';

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { execSync } = require('child_process');

const NETWORK_DIR = path.resolve(__dirname, '../../../network');
const CRYPTO_DIR  = path.join(NETWORK_DIR, 'crypto-config');

// Chemin hôte pour les volumes Docker (le backend tourne dans un conteneur,
// Docker daemon sur l'hôte a besoin du chemin hôte réel).
const HOST_PROJECT_DIR = process.env.HOST_PROJECT_DIR || path.resolve(NETWORK_DIR, '../..');
const HOST_CRYPTO      = path.join(HOST_PROJECT_DIR, 'network', 'crypto-config');

/**
 * Lance une commande fabric-tools via `docker run` en utilisant le socket Docker monté.
 * Compatible Alpine (pas besoin de binaires glibc locaux).
 */
function fabricTools(cmd) {
  const fullCmd = [
    'docker run --rm',
    `--network ${process.env.DOCKER_NETWORK || 'securebackup-net'}`,
    `-v "${HOST_CRYPTO}:/etc/hyperledger/crypto-config"`,
    '-e FABRIC_CFG_PATH=/etc/hyperledger',
    'hyperledger/fabric-tools:2.5.4',
    cmd,
  ].join(' ');
  return execSync(fullCmd, { stdio: 'pipe' }).toString();
}

/**
 * Génère les certificats pour un nouvel org via `cryptogen extend` (docker run).
 */
function generateOrgCrypto(orgNum) {
  const lower  = `org${orgNum}`;
  const domain = `${lower}.example.com`;

  const peerDir = path.join(CRYPTO_DIR, 'peerOrganizations', domain);
  if (fs.existsSync(peerDir)) {
    return { alreadyExists: true };
  }

  const cryptoYaml = `PeerOrgs:
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

  // Écrire le yaml dans crypto-config (accessible dans le conteneur fabric-tools)
  const tmpYaml = path.join(CRYPTO_DIR, `crypto-config-org${orgNum}-tmp.yaml`);
  fs.writeFileSync(tmpYaml, cryptoYaml);

  try {
    execSync(
      [
        'docker run --rm',
        `--network ${process.env.DOCKER_NETWORK || 'securebackup-net'}`,
        `-v "${HOST_CRYPTO}:/etc/hyperledger/crypto-config"`,
        'hyperledger/fabric-tools:2.5.4',
        `cryptogen extend --config="/etc/hyperledger/crypto-config/crypto-config-org${orgNum}-tmp.yaml" --input="/etc/hyperledger/crypto-config"`,
      ].join(' '),
      { stdio: 'pipe' },
    );
  } finally {
    fs.existsSync(tmpYaml) && fs.unlinkSync(tmpYaml);
  }

  return { alreadyExists: false };
}

/**
 * Génère le JSON de définition de l'org pour configtxlator (channel update).
 */
function generateOrgConfigtxJson(orgNum) {
  const lower  = `org${orgNum}`;
  const domain = `${lower}.example.com`;
  const { getPorts } = require('./port-allocator');

  const configtxYaml = `Organizations:
  - &Org${orgNum}
    Name: Org${orgNum}MSP
    ID: Org${orgNum}MSP
    MSPDir: /etc/hyperledger/crypto-config/peerOrganizations/${domain}/msp
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
        Port: ${getPorts(orgNum).peer}
`;

  // Écrire le configtx dans un dossier temporaire accessible par le conteneur
  const tmpName = `configtx_org${orgNum}_${Date.now()}`;
  const tmpDir  = path.join(CRYPTO_DIR, tmpName);
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'configtx.yaml'), configtxYaml);

  try {
    const out = execSync(
      [
        'docker run --rm',
        `--network ${process.env.DOCKER_NETWORK || 'securebackup-net'}`,
        `-v "${HOST_CRYPTO}:/etc/hyperledger/crypto-config"`,
        'hyperledger/fabric-tools:2.5.4',
        `configtxgen -configPath "/etc/hyperledger/crypto-config/${tmpName}" -printOrg Org${orgNum}MSP`,
      ].join(' '),
      { stdio: 'pipe' },
    );
    return JSON.parse(out.toString());
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { generateOrgCrypto, generateOrgConfigtxJson, CRYPTO_DIR, NETWORK_DIR };
