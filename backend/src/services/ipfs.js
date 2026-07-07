'use strict';
const crypto = require('crypto');
const fs = require('fs');
const { Readable } = require('stream');
const env = require('../../config/env');

const { getPorts } = require('./port-allocator');

const API         = env.IPFS.API_URL;
const CLUSTER_URL = env.IPFS.CLUSTER_URL;

// Endpoints de fallback pour org2, org3, org4, org5 (conteneurs ipfsN / clusterN).
// Le port IPFS interne est toujours 5001.
// Le port cluster REST = 9094 + (orgNum-1)*1000 (configuré via CLUSTER_RESTAPI_HTTPLISTENMULTIADDRESS).
const FALLBACK_CLUSTER_URLS = [2, 3, 4, 5].map(n => `http://cluster${n - 1}:${getPorts(n).clusterApi}`);
const FALLBACK_IPFS_URLS    = [2, 3, 4, 5].map(n => `http://ipfs${n - 1}:5001`);

/** Retourne le premier URL cluster joignable (timeout 2 s par tentative). */
async function getWorkingClusterUrl() {
  const candidates = [CLUSTER_URL, ...FALLBACK_CLUSTER_URLS].filter(Boolean);
  for (const url of candidates) {
    try {
      const res = await fetch(`${url}/peers`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return url;
    } catch (_) {}
  }
  throw new Error('Aucun nœud IPFS Cluster disponible — vérifiez que au moins un nœud est démarré');
}

/** Retourne le premier URL IPFS API joignable (timeout 2 s par tentative). */
async function getWorkingIpfsUrl() {
  const candidates = [API, ...FALLBACK_IPFS_URLS].filter(Boolean);
  for (const url of candidates) {
    try {
      const res = await fetch(`${url}/api/v0/version`, { method: 'POST', signal: AbortSignal.timeout(2000) });
      if (res.ok) return url;
    } catch (_) {}
  }
  throw new Error('Aucun daemon IPFS disponible — vérifiez que au moins un nœud est démarré');
}

async function version() {
  const url = await getWorkingIpfsUrl();
  const res = await fetch(`${url}/api/v0/version`, { method: 'POST' });
  if (!res.ok) throw new Error(`IPFS unreachable: ${res.status}`);
  return res.json();
}

// Construit un corps multipart streamé à partir de n'importe quel async iterable.
// Ne charge jamais les données en mémoire — supporte des fichiers de taille quelconque.
async function _fetchMultipart(asyncIterable, filename) {
  const boundary = `SBCBoundary${crypto.randomBytes(8).toString('hex')}`;
  const safeName = filename.replace(/["\\]/g, '_');
  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${safeName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`,
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

  async function* multipart() {
    yield header;
    for await (const chunk of asyncIterable) yield chunk;
    yield footer;
  }

  const webStream = Readable.toWeb(Readable.from(multipart()));
  // Sonder les endpoints disponibles AVANT de streamer (le body ne peut pas être relu)
  const activeCluster = await getWorkingClusterUrl().catch(() => null);
  const activeIpfs    = activeCluster ? null : await getWorkingIpfsUrl();
  const uploadUrl     = activeCluster ? `${activeCluster}/add` : `${activeIpfs}/api/v0/add`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: webStream,
    duplex: 'half', // requis pour les corps streaming (Node.js 18+)
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => String(res.status));
    throw new Error(`IPFS add failed: ${res.status} — ${txt}`);
  }
  const data = await res.json();
  const cid = data.cid?.['/'] ?? data.cid ?? data.Hash;
  if (!cid) throw new Error('IPFS returned no CID');
  return cid;
}

// Depuis un Buffer (petits fichiers — backward compat)
async function add(buffer, filename = 'file') {
  async function* gen() { yield buffer; }
  return _fetchMultipart(gen(), filename);
}

// Depuis un fichier sur disque — streaming sans RAM
async function addFromFile(filePath, filename = 'file') {
  return _fetchMultipart(fs.createReadStream(filePath), filename);
}

// Depuis n'importe quel async iterable (résultat de createEncryptStream par ex.)
async function addFromAsyncIterable(asyncIterable, filename = 'file') {
  return _fetchMultipart(asyncIterable, filename);
}

async function cat(cid) {
  const url = await getWorkingIpfsUrl();
  const res = await fetch(`${url}/api/v0/cat?arg=${encodeURIComponent(cid)}`, { method: 'POST' });
  if (!res.ok) throw new Error(`IPFS cat failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function pin(cid) {
  const url = await getWorkingClusterUrl().catch(() => null);
  if (!url) return;
  const res = await fetch(`${url}/pins/${encodeURIComponent(cid)}`, { method: 'POST' });
  if (!res.ok) throw new Error(`IPFS Cluster pin failed: ${res.status}`);
}

async function clusterPeers() {
  const url = await getWorkingClusterUrl().catch(() => null);
  if (!url) return null;
  const res = await fetch(`${url}/peers`);
  if (!res.ok) throw new Error(`IPFS Cluster peers failed: ${res.status}`);
  return res.json();
}

module.exports = { version, add, addFromFile, addFromAsyncIterable, cat, pin, clusterPeers };
