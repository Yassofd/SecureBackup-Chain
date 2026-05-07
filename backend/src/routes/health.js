'use strict';
const { Router } = require('express');
const fabric = require('../services/fabric');
const ipfs = require('../services/ipfs');

const router = Router();

router.get('/', async (req, res) => {
  const health = { fabric: 'error', ipfs: 'error' };

  await Promise.allSettled([
    ipfs.version().then(() => { health.ipfs = 'ok'; }),
    fabric.healthCheck().then(() => { health.fabric = 'ok'; }),
  ]);

  const status = health.fabric === 'ok' && health.ipfs === 'ok' ? 200 : 503;
  res.status(status).json(health);
});

module.exports = router;
