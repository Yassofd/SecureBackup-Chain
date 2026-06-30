'use strict';
const fs  = require('fs');
const env = require('../config/env');
const app = require('./app');
const logger = require('./utils/logger');
const { isInitialized, INIT_FILE } = require('./middleware/require-initialized');

const PORT = env.PORT;

async function syncInitState() {
  if (!isInitialized()) return;
  try {
    const db    = require('./services/db');
    const count = await db.user.count({ where: { role: 'admin' } });
    if (count === 0) {
      fs.truncateSync(INIT_FILE, 0);
      logger.warn('initialized.json réinitialisé — aucun admin trouvé en base (volumes recréés ?)');
    }
  } catch (_) {}
}

const server = app.listen(PORT, async () => {
  logger.info(`API démarrée sur le port ${PORT}`, { env: env.NODE_ENV });
  await syncInitState();
  const scheduler = require('./services/scheduler');
  await scheduler.loadAll();
  const monitoring = require('./services/monitoring');
  monitoring.start();
  const snapshot = require('./services/snapshot');
  snapshot.start();
});

// Node.js 18 default requestTimeout is 5 minutes — kills large file uploads.
// Disabled here; nginx proxy_read_timeout (3600s) is the effective limit.
server.requestTimeout = 0;
server.headersTimeout = 65000; // slightly above nginx keepalive_timeout (default 75s)

process.on('SIGTERM', () => {
  const fabric = require('./services/fabric');
  fabric.disconnect();
  const monitoring = require('./services/monitoring');
  monitoring.stop();
  const snapshot = require('./services/snapshot');
  snapshot.stop();
  server.close(() => process.exit(0));
});

module.exports = server;
