'use strict';
const crypto = require('crypto');
const fs = require('fs');
const { pipeline } = require('stream/promises');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// Streaming version — ne charge jamais le fichier entier en RAM
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

// Streaming version — lit inputPath, écrit IV + chiffré dans outputPath
async function encryptFileToFile(inputPath, outputPath, hexKey) {
  const key = Buffer.from(hexKey, 'hex');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const ws = fs.createWriteStream(outputPath);
  ws.write(iv); // IV en tête (16 octets)
  await pipeline(fs.createReadStream(inputPath), cipher, ws);
}

function decryptAES(buffer, hexKey) {
  const key = Buffer.from(hexKey, 'hex');
  const iv = buffer.subarray(0, 16);
  const ciphertext = buffer.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = { sha256, sha256File, encryptAES, encryptFileToFile, decryptAES };
