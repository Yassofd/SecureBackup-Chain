'use strict';
const env = require('../config/env');
const app = require('./app');
const logger = require('./utils/logger');

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  logger.info(`API démarrée sur le port ${PORT}`, { env: env.NODE_ENV });
});

process.on('SIGTERM', () => {
  const fabric = require('./services/fabric');
  fabric.disconnect();
  server.close(() => process.exit(0));
});

module.exports = server;
