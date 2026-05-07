'use strict';
const jwt = require('jsonwebtoken');
const env = require('../../config/env');

module.exports = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  try {
    req.user = jwt.verify(header.slice(7), env.JWT.SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide ou expiré' });
  }
};
