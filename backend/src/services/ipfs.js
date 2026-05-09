'use strict';
const env = require('../../config/env');

const API         = env.IPFS.API_URL;
const CLUSTER_URL = env.IPFS.CLUSTER_URL;

async function version() {
  const res = await fetch(`${API}/api/v0/version`, { method: 'POST' });
  if (!res.ok) throw new Error(`IPFS unreachable: ${res.status}`);
  return res.json();
}

// Add via IPFS Cluster REST API — pins on all cluster peers automatically.
// Falls back to direct IPFS node when cluster is not configured.
async function add(buffer, filename = 'file') {
  const formData = new FormData();
  formData.append('file', new Blob([buffer]), filename);

  if (CLUSTER_URL) {
    const res = await fetch(`${CLUSTER_URL}/add`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error(`IPFS Cluster add failed: ${res.status}`);
    const data = await res.json();
    // Cluster returns { cid: { "/": "<CID>" }, ... }
    const cid = data.cid?.['/'] ?? data.cid ?? data.Hash;
    if (!cid) throw new Error('IPFS Cluster returned no CID');
    return cid;
  }

  const res = await fetch(`${API}/api/v0/add`, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`IPFS add failed: ${res.status}`);
  const data = await res.json();
  return data.Hash;
}

async function cat(cid) {
  const res = await fetch(`${API}/api/v0/cat?arg=${encodeURIComponent(cid)}`, { method: 'POST' });
  if (!res.ok) throw new Error(`IPFS cat failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Explicit pin via cluster (used if content was added outside cluster).
async function pin(cid) {
  if (!CLUSTER_URL) return;
  const res = await fetch(`${CLUSTER_URL}/pins/${encodeURIComponent(cid)}`, { method: 'POST' });
  if (!res.ok) throw new Error(`IPFS Cluster pin failed: ${res.status}`);
}

// Returns cluster health (peers list) or null when cluster not configured.
async function clusterPeers() {
  if (!CLUSTER_URL) return null;
  const res = await fetch(`${CLUSTER_URL}/peers`);
  if (!res.ok) throw new Error(`IPFS Cluster peers failed: ${res.status}`);
  return res.json();
}

module.exports = { version, add, cat, pin, clusterPeers };
