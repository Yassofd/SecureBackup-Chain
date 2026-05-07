'use strict';
const express = require('express');
const cors = require('cors');
const { requireInitialized } = require('./middleware/require-initialized');
const errorHandler = require('./middleware/error-handler');
const healthRouter = require('./routes/health');
const setupRouter = require('./routes/setup');
const authRouter = require('./routes/auth');
const backupsRouter = require('./routes/backups');
const sshServersRouter = require('./routes/ssh-servers');
const schedulesRouter = require('./routes/schedules');
const auditRouter = require('./routes/audit');
const notificationsRouter = require('./routes/notifications');

const app = express();

app.use(cors());
app.use(express.json());

// Setup routes (toujours disponibles)
app.use('/api/setup', setupRouter);
app.use('/api/health', healthRouter);

// Toutes les autres routes nécessitent que le système soit initialisé
app.use(requireInitialized);

app.use('/api/auth', authRouter);
app.use('/api/backups', backupsRouter);
app.use('/api/ssh-servers', sshServersRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/audit', auditRouter);
app.use('/api/notifications', notificationsRouter);

app.use(errorHandler);

module.exports = app;
