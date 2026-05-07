'use strict';
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { Wallets } = require('fabric-network');

const CRYPTO_BASE = path.resolve(__dirname, '../../../network/crypto-config');
const WALLET_PATH = path.resolve(process.env.FABRIC_WALLET_PATH || './wallet');
const ADMIN_USER = process.env.FABRIC_ADMIN_USER || 'admin';
const ORG_MSP = process.env.FABRIC_ORG_MSP || 'Org1MSP';

async function main() {
  const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);

  if (await wallet.get(ADMIN_USER)) {
    console.log(`✓ L'identité '${ADMIN_USER}' est déjà dans le wallet.`);
    return;
  }

  const certPath = path.join(
    CRYPTO_BASE,
    'peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts/Admin@org1.example.com-cert.pem',
  );
  const keyPath = path.join(
    CRYPTO_BASE,
    'peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/priv_sk',
  );

  await wallet.put(ADMIN_USER, {
    credentials: {
      certificate: fs.readFileSync(certPath, 'utf8'),
      privateKey: fs.readFileSync(keyPath, 'utf8'),
    },
    mspId: ORG_MSP,
    type: 'X.509',
  });

  console.log(`✓ Identité '${ADMIN_USER}' importée dans ${WALLET_PATH}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
