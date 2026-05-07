'use strict';
const env = require('../../config/env');

const API = env.IPFS.API_URL;

async function version() {
  const res = await fetch(`${API}/api/v0/version`, { method: 'POST' });
  if (!res.ok) throw new Error(`IPFS unreachable: ${res.status}`);
  return res.json();
}

async function add(buffer, filename = 'file') {
  const formData = new FormData();
  formData.append('file', new Blob([buffer]), filename);
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

module.exports = { version, add, cat };
