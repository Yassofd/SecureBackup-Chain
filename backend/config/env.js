'use strict';
require('dotenv').config();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.API_PORT || '3000', 10),
  MASTER_KEY: process.env.MASTER_KEY,
  FABRIC: {
    WALLET_PATH: process.env.FABRIC_WALLET_PATH || './wallet',
    CHANNEL: process.env.FABRIC_CHANNEL || 'backupchannel',
    CHAINCODE: process.env.FABRIC_CHAINCODE || 'backup-cc',
    ORG_MSP: process.env.FABRIC_ORG_MSP || 'Org1MSP',
    ADMIN_USER: process.env.FABRIC_ADMIN_USER || 'admin',
  },
  IPFS: {
    API_URL: process.env.IPFS_API_URL || 'http://localhost:5001',
    GATEWAY_URL: process.env.IPFS_GATEWAY_URL || 'http://localhost:8080',
  },
};
