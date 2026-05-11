'use strict';
const crypto = require('crypto');
const fs = require('fs');
const { pipeline } = require('stream/promises');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function encryptAES(buffer, hexKey) {
  const key = Buffer.from(hexKey, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([iv, encrypted]);
}

async function encryptFileToFile(inputPath, outputPath, hexKey) {
  const key = Buffer.from(hexKey, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const ws = fs.createWriteStream(outputPath);
  ws.write(iv);
  await pipeline(fs.createReadStream(inputPath), cipher, ws);
}

function decryptAES(buffer, hexKey) {
  const key = Buffer.from(hexKey, 'hex');
  const iv = buffer.subarray(0, 16);
  const ciphertext = buffer.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// Génère un flux chiffré (AES-256-CBC) en streaming pur depuis un async iterable.
// Calcule simultanément le hash SHA-256 du clair et le nombre d'octets.
// Aucune donnée complète n'est jamais chargée en mémoire.
//
// Usage :
//   const { stream, getHash, getSize } = createEncryptStream(fileStream, MASTER_KEY);
//   const cid = await ipfs.addFromAsyncIterable(stream, filename);
//   const hash = getHash();   // disponible APRÈS que stream soit entièrement consommé
//   const size = getSize();
function createEncryptStream(inputAsyncIterable, hexKey) {
  const key = Buffer.from(hexKey, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const hasher = crypto.createHash('sha256');
  let size = 0;

  async function* gen() {
    yield iv; // IV en tête (16 octets)
    for await (const chunk of inputAsyncIterable) {
      hasher.update(chunk);
      size += chunk.length;
      const encrypted = cipher.update(chunk);
      if (encrypted.length > 0) yield encrypted;
    }
    const final = cipher.final(); // padding PKCS7 final
    if (final.length > 0) yield final;
  }

  return {
    stream:  gen(),
    getHash: () => hasher.digest('hex'),
    getSize: () => size,
  };
}

module.exports = { sha256, sha256File, encryptAES, encryptFileToFile, decryptAES, createEncryptStream };
