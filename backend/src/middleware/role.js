'use strict';

module.exports = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès refusé — rôle insuffisant' });
  }
  next();
};
