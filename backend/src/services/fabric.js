'use strict';
const path = require('path');
const fs = require('fs');
const { Gateway, Wallets, DefaultQueryHandlerStrategies } = require('fabric-network');
const env = require('../../config/env');
const logger = require('../utils/logger');

const CRYPTO_BASE = path.resolve(__dirname, '../../../network/crypto-config');
let gateway = null;

function buildConnectionProfile() {
  const read = (p) => fs.readFileSync(path.join(CRYPTO_BASE, p), 'utf8');
  return {
    name: 'securebackup',
    version: '1.0.0',
    client: {
      organization: 'Org1',
      connection: { timeout: { peer: { endorser: '300' }, orderer: '300' } },
    },
    channels: {
      [env.FABRIC.CHANNEL]: {
        orderers: ['orderer.org1.example.com', 'orderer.org2.example.com', 'orderer.org3.example.com'],
        peers: {
          'peer0.org1.example.com': { endorsingPeer: true, chaincodeQuery: true, ledgerQuery: true, eventSource: true },
          'peer0.org2.example.com': { endorsingPeer: true, chaincodeQuery: true, ledgerQuery: true, eventSource: false },
          'peer0.org3.example.com': { endorsingPeer: true, chaincodeQuery: true, ledgerQuery: true, eventSource: false },
        },
      },
    },
    organizations: {
      Org1: {
        mspid: 'Org1MSP',
        peers: ['peer0.org1.example.com'],
        certificateAuthorities: ['ca.org1.example.com'],
      },
      Org2: {
        mspid: 'Org2MSP',
        peers: ['peer0.org2.example.com'],
        certificateAuthorities: ['ca.org2.example.com'],
      },
      Org3: {
        mspid: 'Org3MSP',
        peers: ['peer0.org3.example.com'],
        certificateAuthorities: ['ca.org3.example.com'],
      },
    },
    orderers: {
      'orderer.org1.example.com': {
        url: 'grpcs://localhost:7050',
        tlsCACerts: { pem: read('ordererOrganizations/org1.example.com/orderers/orderer.org1.example.com/tls/ca.crt') },
        grpcOptions: { 'ssl-target-name-override': 'orderer.org1.example.com' },
      },
      'orderer.org2.example.com': {
        url: 'grpcs://localhost:8050',
        tlsCACerts: { pem: read('ordererOrganizations/org2.example.com/orderers/orderer.org2.example.com/tls/ca.crt') },
        grpcOptions: { 'ssl-target-name-override': 'orderer.org2.example.com' },
      },
      'orderer.org3.example.com': {
        url: 'grpcs://localhost:9050',
        tlsCACerts: { pem: read('ordererOrganizations/org3.example.com/orderers/orderer.org3.example.com/tls/ca.crt') },
        grpcOptions: { 'ssl-target-name-override': 'orderer.org3.example.com' },
      },
    },
    peers: {
      'peer0.org1.example.com': {
        url: 'grpcs://localhost:7051',
        tlsCACerts: { pem: read('peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt') },
        grpcOptions: { 'ssl-target-name-override': 'peer0.org1.example.com' },
      },
      'peer0.org2.example.com': {
        url: 'grpcs://localhost:8051',
        tlsCACerts: { pem: read('peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt') },
        grpcOptions: { 'ssl-target-name-override': 'peer0.org2.example.com' },
      },
      'peer0.org3.example.com': {
        url: 'grpcs://localhost:9051',
        tlsCACerts: { pem: read('peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt') },
        grpcOptions: { 'ssl-target-name-override': 'peer0.org3.example.com' },
      },
    },
    certificateAuthorities: {
      'ca.org1.example.com': {
        url: 'https://localhost:7054',
        caName: 'ca-org1',
        tlsCACerts: { pem: [read('peerOrganizations/org1.example.com/ca/ca.org1.example.com-cert.pem')] },
        httpOptions: { verify: false },
      },
      'ca.org2.example.com': {
        url: 'https://localhost:8054',
        caName: 'ca-org2',
        tlsCACerts: { pem: [read('peerOrganizations/org2.example.com/ca/ca.org2.example.com-cert.pem')] },
        httpOptions: { verify: false },
      },
      'ca.org3.example.com': {
        url: 'https://localhost:9054',
        caName: 'ca-org3',
        tlsCACerts: { pem: [read('peerOrganizations/org3.example.com/ca/ca.org3.example.com-cert.pem')] },
        httpOptions: { verify: false },
      },
    },
  };
}

async function getWallet() {
  const walletPath = path.resolve(env.FABRIC.WALLET_PATH);
  const wallet = await Wallets.newFileSystemWallet(walletPath);

  if (await wallet.get(env.FABRIC.ADMIN_USER)) return wallet;

  const certPath = path.join(CRYPTO_BASE,
    'peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts/Admin@org1.example.com-cert.pem');
  const keyPath = path.join(CRYPTO_BASE,
    'peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/priv_sk');

  await wallet.put(env.FABRIC.ADMIN_USER, {
    credentials: {
      certificate: fs.readFileSync(certPath, 'utf8'),
      privateKey: fs.readFileSync(keyPath, 'utf8'),
    },
    mspId: env.FABRIC.ORG_MSP,
    type: 'X.509',
  });
  logger.info('Admin identity imported into wallet');
  return wallet;
}

async function getGateway() {
  if (gateway) return gateway;
  const wallet = await getWallet();
  gateway = new Gateway();
  await gateway.connect(buildConnectionProfile(), {
    wallet,
    identity: env.FABRIC.ADMIN_USER,
    discovery: { enabled: false },
    eventHandlerOptions: { commitTimeout: 300 },
    queryHandlerOptions: { timeout: 60, strategy: DefaultQueryHandlerStrategies.PREFER_MSPID_SCOPE_SINGLE },
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
      err.message.includes('No valid responses')
    );
    if (!isConnErr) throw err;
    logger.warn('Fabric connection lost, reconnecting...');
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

module.exports = { submitTransaction, evaluateTransaction, healthCheck, disconnect };
