'use strict';
const fs = require('fs');
const path = require('path');

const INIT_FILE = path.resolve(__dirname, '../../config/initialized.json');

function isInitialized() {
  if (!fs.existsSync(INIT_FILE)) return false;
  const stat = fs.statSync(INIT_FILE);
  return stat.isFile() && stat.size > 0;
}

function getConfig() {
  if (!isInitialized()) return null;
  return JSON.parse(fs.readFileSync(INIT_FILE, 'utf8'));
}

// Bloque toutes les routes non-setup tant que le système n'est pas initialisé
function requireInitialized(req, res, next) {
  if (isInitialized()) return next();
  if (req.path.startsWith('/api/setup') || req.path.startsWith('/api/health')) return next();
  res.status(503).json({ initialized: false, error: 'Système non initialisé — lancez le wizard /setup' });
}

module.exports = { requireInitialized, isInitialized, getConfig, INIT_FILE };
