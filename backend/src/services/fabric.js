'use strict';
const path = require('path');
const fs = require('fs');
const { Gateway, Wallets, DefaultQueryHandlerStrategies, DefaultEventHandlerStrategies } = require('fabric-network');
const env = require('../../config/env');
const logger = require('../utils/logger');
const { getPorts } = require('./port-allocator');

const CRYPTO_BASE  = process.env.FABRIC_CRYPTO_PATH  || path.resolve(__dirname, '../../../network/crypto-config');
const PEER_HOST    = process.env.FABRIC_PEER_HOST    || 'localhost';
const ORDERER_HOST = process.env.FABRIC_ORDERER_HOST || 'localhost';

let gateway = null;

function readCert(p) {
  return fs.readFileSync(path.join(CRYPTO_BASE, p), 'utf8');
}

function certExists(p) {
  return fs.existsSync(path.join(CRYPTO_BASE, p));
}

/**
 * Construit un connection profile incluant tous les nœuds actifs en base.
 * Si la DB est inaccessible ou vide, on se rabat sur Org1 seul.
 */
async function buildConnectionProfile() {
  // Org1 — toujours présent (nœud racine)
  const profile = {
    name: 'securebackup',
    version: '1.0.0',
    client: {
      organization: 'Org1',
      connection: { timeout: { peer: { endorser: '300' }, orderer: '300' } },
    },
    channels: {
      [env.FABRIC.CHANNEL]: {
        orderers: ['orderer.org1.example.com'],
        peers: {
          'peer0.org1.example.com': {
            endorsingPeer: true, chaincodeQuery: true, ledgerQuery: true, eventSource: true,
          },
        },
      },
    },
    organizations: {
      Org1: {
        mspid: 'Org1MSP',
        peers: ['peer0.org1.example.com'],
        certificateAuthorities: ['ca.org1.example.com'],
      },
    },
    orderers: {
      'orderer.org1.example.com': {
        url: `grpcs://${ORDERER_HOST}:7050`,
        tlsCACerts: { pem: readCert('ordererOrganizations/org1.example.com/orderers/orderer.org1.example.com/tls/ca.crt') },
        grpcOptions: { 'ssl-target-name-override': 'orderer.org1.example.com' },
      },
    },
    peers: {
      'peer0.org1.example.com': {
        url: `grpcs://${PEER_HOST}:7051`,
        tlsCACerts: { pem: readCert('peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt') },
        grpcOptions: { 'ssl-target-name-override': 'peer0.org1.example.com' },
      },
    },
    certificateAuthorities: {
      'ca.org1.example.com': {
        url: 'https://localhost:7054',
        caName: 'ca-org1',
        tlsCACerts: { pem: [readCert('peerOrganizations/org1.example.com/ca/ca.org1.example.com-cert.pem')] },
        httpOptions: { verify: false },
      },
    },
  };

  // Ajouter dynamiquement tous les autres nœuds actifs
  try {
    const db = require('./db');
    const nodes = await db.fabricNode.findMany({ where: { status: 'running' } });

    for (const node of nodes) {
      if (node.orgNum === 1) continue;
      const n      = node.orgNum;
      const domain = `org${n}.example.com`;
      const peer   = `peer0.${domain}`;
      const order  = `orderer.${domain}`;
      const ports  = getPorts(n);

      // Vérifie que les certs existent (nœud peut être en erreur partielle)
      const peerCertPath    = `peerOrganizations/${domain}/peers/${peer}/tls/ca.crt`;
      const ordererCertPath = `ordererOrganizations/${domain}/orderers/${order}/tls/ca.crt`;
      if (!certExists(peerCertPath)) continue;

      // Peer
      profile.channels[env.FABRIC.CHANNEL].peers[peer] = {
        endorsingPeer: true, chaincodeQuery: true, ledgerQuery: true, eventSource: true,
      };
      profile.organizations[`Org${n}`] = {
        mspid: `Org${n}MSP`,
        peers: [peer],
      };
      profile.peers[peer] = {
        url: `grpcs://${peer}:${ports.peer}`,
        tlsCACerts: { pem: readCert(peerCertPath) },
        grpcOptions: { 'ssl-target-name-override': peer },
      };

      // Orderer (optionnel — seulement si les certs existent)
      if (certExists(ordererCertPath)) {
        profile.channels[env.FABRIC.CHANNEL].orderers.push(order);
        profile.orderers[order] = {
          url: `grpcs://${order}:${ports.orderer}`,
          tlsCACerts: { pem: readCert(ordererCertPath) },
          grpcOptions: { 'ssl-target-name-override': order },
        };
      }

      logger.info(`[fabric] Org${n} ajouté au connection profile`);
    }
  } catch (e) {
    logger.warn(`[fabric] Impossible de lire les nœuds DB — profil Org1 seul : ${e.message}`);
  }

  return profile;
}

async function getWallet() {
  const walletPath = process.env.FABRIC_WALLET_ABS_PATH || path.resolve(env.FABRIC.WALLET_PATH);
  const wallet = await Wallets.newFileSystemWallet(walletPath);

  if (await wallet.get(env.FABRIC.ADMIN_USER)) return wallet;

  const certPath = path.join(CRYPTO_BASE,
    'peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts/Admin@org1.example.com-cert.pem');
  const keyPath = path.join(CRYPTO_BASE,
    'peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/priv_sk');

  await wallet.put(env.FABRIC.ADMIN_USER, {
    credentials: {
      certificate: fs.readFileSync(certPath, 'utf8'),
      privateKey:  fs.readFileSync(keyPath, 'utf8'),
    },
    mspId: env.FABRIC.ORG_MSP,
    type: 'X.509',
  });
  logger.info('Admin identity imported into wallet');
  return wallet;
}

async function getGateway() {
  if (gateway) return gateway;
  const [wallet, profile] = await Promise.all([getWallet(), buildConnectionProfile()]);
  gateway = new Gateway();
  await gateway.connect(profile, {
    wallet,
    identity: env.FABRIC.ADMIN_USER,
    discovery: { enabled: false, asLocalhost: false },
    eventHandlerOptions: {
      commitTimeout: 300,
      // Un seul peer parmi tous les orgs doit confirmer → résistant aux pannes
      strategy: DefaultEventHandlerStrategies.PREFER_MSPID_SCOPE_ANYFORTX,
    },
    queryHandlerOptions: {
      timeout: 60,
      // Round-robin sur tous les peers disponibles (toutes orgs)
      strategy: DefaultQueryHandlerStrategies.ROUND_ROBIN_SCOPE,
    },
  });
  logger.info('Fabric gateway connected');
  return gateway;
}

async function getContract() {
  const gw = await getGateway();
  const network = await gw.getNetwork(env.FABRIC.CHANNEL);
  return network.getContract(env.FABRIC.CHAINCODE);
}

async function withRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    const isConnErr = err.message && (
      err.message.includes('is not connected') ||
      err.message.includes('Query failed. Errors: []') ||
      err.message.includes('No valid responses') ||
      err.message.includes('REQUEST TIMEOUT') ||
      err.message.includes('UNAVAILABLE') ||
      err.message.includes('14 UNAVAILABLE')
    );
    if (!isConnErr) throw err;
    logger.warn('Fabric connection lost, reconnecting with fresh profile...');
    disconnect();
    return await fn();
  }
}

async function submitTransaction(fn, ...args) {
  return withRetry(async () => {
    const contract = await getContract();
    const result = await contract.submitTransaction(fn, ...args);
    return JSON.parse(result.toString());
  });
}

async function evaluateTransaction(fn, ...args) {
  return withRetry(async () => {
    const contract = await getContract();
    const result = await contract.evaluateTransaction(fn, ...args);
    return JSON.parse(result.toString());
  });
}

async function healthCheck() {
  await getContract();
}

function disconnect() {
  if (gateway) { gateway.disconnect(); gateway = null; }
}

/**
 * Force la reconnexion avec un profil rechargé depuis la DB.
 * À appeler après déploiement d'un nouveau nœud.
 */
async function reconnect() {
  disconnect();
  await getGateway();
}

module.exports = { submitTransaction, evaluateTransaction, healthCheck, disconnect, reconnect };
