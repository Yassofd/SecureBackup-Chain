'use strict';
const logger = require('../utils/logger');

module.exports = (err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';
  if (status >= 500) logger.error(message, { stack: err.stack });
  res.status(status).json({ error: message });
};
