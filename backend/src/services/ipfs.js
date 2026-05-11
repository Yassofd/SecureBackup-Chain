'use strict';
const crypto = require('crypto');
const fs = require('fs');
const { Readable } = require('stream');
const env = require('../../config/env');

const API         = env.IPFS.API_URL;
const CLUSTER_URL = env.IPFS.CLUSTER_URL;

async function version() {
  const res = await fetch(`${API}/api/v0/version`, { method: 'POST' });
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
  const url = CLUSTER_URL ? `${CLUSTER_URL}/add` : `${API}/api/v0/add`;

  const res = await fetch(url, {
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
  const res = await fetch(`${API}/api/v0/cat?arg=${encodeURIComponent(cid)}`, { method: 'POST' });
  if (!res.ok) throw new Error(`IPFS cat failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function pin(cid) {
  if (!CLUSTER_URL) return;
  const res = await fetch(`${CLUSTER_URL}/pins/${encodeURIComponent(cid)}`, { method: 'POST' });
  if (!res.ok) throw new Error(`IPFS Cluster pin failed: ${res.status}`);
}

async function clusterPeers() {
  if (!CLUSTER_URL) return null;
  const res = await fetch(`${CLUSTER_URL}/peers`);
  if (!res.ok) throw new Error(`IPFS Cluster peers failed: ${res.status}`);
  return res.json();
}

module.exports = { version, add, addFromFile, addFromAsyncIterable, cat, pin, clusterPeers };
