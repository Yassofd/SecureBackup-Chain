'use strict';
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const compression = require('compression');
const { requireInitialized } = require('./middleware/require-initialized');
const errorHandler = require('./middleware/error-handler');
const healthRouter      = require('./routes/health');
const setupRouter       = require('./routes/setup');
const authRouter        = require('./routes/auth');
const backupsRouter     = require('./routes/backups');
const sshServersRouter  = require('./routes/ssh-servers');
const schedulesRouter   = require('./routes/schedules');
const auditRouter       = require('./routes/audit');
const notificationsRouter = require('./routes/notifications');
const networkRouter     = require('./routes/network');
const deploymentRouter  = require('./routes/deployment');
const adminRouter       = require('./routes/admin');

const app = express();

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,  // handled by frontend
}));

// Gzip compression
app.use(compression());

// CORS
app.use(cors({ origin: process.env.FRONTEND_URL || true, credentials: true }));

// Global rate limit (500 req/15min par IP)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez dans 15 minutes.' },
});
app.use(globalLimiter);

// Strict rate limit sur auth (20 req/15min par IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion, réessayez dans 15 minutes.' },
});

app.use(express.json({ limit: '50mb' }));

// Setup routes (toujours disponibles)
app.use('/api/setup', setupRouter);
app.use('/api/health', healthRouter);

// Toutes les autres routes nécessitent que le système soit initialisé
app.use(requireInitialized);

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/backups', backupsRouter);
app.use('/api/ssh-servers', sshServersRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/audit', auditRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/network', networkRouter);
app.use('/api/deployment', deploymentRouter);
app.use('/api/admin', adminRouter);

app.use(errorHandler);

module.exports = app;
