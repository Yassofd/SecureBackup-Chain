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

// Upload depuis un Buffer (petits fichiers — backward compat)
async function add(buffer, filename = 'file') {
  const formData = new FormData();
  formData.append('file', new Blob([buffer]), filename);

  if (CLUSTER_URL) {
    const res = await fetch(`${CLUSTER_URL}/add`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`IPFS Cluster add failed: ${res.status}`);
    const data = await res.json();
    const cid = data.cid?.['/'] ?? data.cid ?? data.Hash;
    if (!cid) throw new Error('IPFS Cluster returned no CID');
    return cid;
  }

  const res = await fetch(`${API}/api/v0/add`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`IPFS add failed: ${res.status}`);
  const data = await res.json();
  return data.Hash;
}

// Upload en streaming depuis un fichier — ne charge jamais le fichier en RAM.
// Construit le multipart manuellement pour pouvoir streamer le corps.
async function addFromFile(filePath, filename = 'file') {
  const boundary = `SBCBoundary${crypto.randomBytes(8).toString('hex')}`;
  const safeName = filename.replace(/"/g, '_');
  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${safeName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`,
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

  // Flux multipart = header + contenu du fichier + footer, sans tout lire en mémoire
  const nodeStream = Readable.from((async function* () {
    yield header;
    for await (const chunk of fs.createReadStream(filePath)) yield chunk;
    yield footer;
  })());

  // Conversion en Web ReadableStream pour fetch (Node.js 18+)
  const webStream = Readable.toWeb(nodeStream);

  const url = CLUSTER_URL ? `${CLUSTER_URL}/add` : `${API}/api/v0/add`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: webStream,
    duplex: 'half', // requis pour les corps streaming avec fetch Node.js 18
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => res.status);
    throw new Error(`IPFS add failed: ${res.status} — ${txt}`);
  }
  const data = await res.json();
  const cid = data.cid?.['/'] ?? data.cid ?? data.Hash;
  if (!cid) throw new Error('IPFS returned no CID');
  return cid;
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

module.exports = { version, add, addFromFile, cat, pin, clusterPeers };
