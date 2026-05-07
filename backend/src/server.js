'use strict';
const env = require('../config/env');
const app = require('./app');
const logger = require('./utils/logger');

const PORT = env.PORT;

const server = app.listen(PORT, async () => {
  logger.info(`API démarrée sur le port ${PORT}`, { env: env.NODE_ENV });
  const scheduler = require('./services/scheduler');
  await scheduler.loadAll();
  const monitoring = require('./services/monitoring');
  monitoring.start();
});

process.on('SIGTERM', () => {
  const fabric = require('./services/fabric');
  fabric.disconnect();
  const monitoring = require('./services/monitoring');
  monitoring.stop();
  server.close(() => process.exit(0));
});

module.exports = server;
