'use strict';
const express = require('express');
const cors = require('cors');
const errorHandler = require('./middleware/error-handler');
const healthRouter = require('./routes/health');
const backupsRouter = require('./routes/backups');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/health', healthRouter);
app.use('/api/backups', backupsRouter);

app.use(errorHandler);

module.exports = app;
