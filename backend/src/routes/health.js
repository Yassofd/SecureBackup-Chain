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

  // Always 200 so install.sh can detect the backend is up before Fabric is initialized.
  // Callers check the JSON body for individual component status.
  res.status(200).json(health);
});

module.exports = router;
