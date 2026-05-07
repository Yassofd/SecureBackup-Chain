'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { NodeSSH } = require('node-ssh');
const logger = require('../utils/logger');

const FORBIDDEN_PATHS = ['/etc', '/root', '/var/log/auth.log', '/proc', '/sys', '/dev'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024 * 1024; // 10 Go

function assertSafePath(remotePath) {
  const normalized = path.posix.normalize(remotePath);
  for (const forbidden of FORBIDDEN_PATHS) {
    if (normalized === forbidden || normalized.startsWith(forbidden + '/')) {
      throw Object.assign(new Error(`Chemin interdit : ${remotePath}`), { status: 403 });
    }
  }
  return normalized;
}

async function buildConnectConfig({ host, port = 22, username, auth_type, credentials }) {
  const base = { host, port: Number(port), username, readyTimeout: 20000 };
  if (auth_type === 'password') {
    return { ...base, password: credentials.password };
  }
  // clé privée : credentials.privateKey est le contenu PEM
  return { ...base, privateKey: credentials.privateKey };
}

async function testConnection(params) {
  const ssh = new NodeSSH();
  const config = await buildConnectConfig(params);
  await ssh.connect(config);
  await ssh.dispose();
  logger.info(`SSH test OK: ${params.username}@${params.host}`);
}

async function executeCommand(ssh, command) {
  const result = await ssh.execCommand(command);
  if (result.code !== 0) throw new Error(`SSH command failed: ${result.stderr}`);
  return result.stdout.trim();
}

async function fetchFile(ssh, remotePath, localPath) {
  await ssh.getFile(localPath, remotePath);
}

async function fetchDirectory(ssh, remotePath, localPath) {
  // Créer une archive tar.gz côté distant et la télécharger
  const remoteDir = path.posix.dirname(remotePath);
  const dirName = path.posix.basename(remotePath);
  const remoteTar = `/tmp/securebackup_${Date.now()}.tar.gz`;

  await executeCommand(ssh, `tar -czf ${remoteTar} -C ${remoteDir} ${dirName}`);
  await ssh.getFile(localPath, remoteTar);
  await executeCommand(ssh, `rm -f ${remoteTar}`);
}

async function pushFile(ssh, localPath, remotePath) {
  await ssh.putFile(localPath, remotePath);
}

async function connect(params) {
  const ssh = new NodeSSH();
  const config = await buildConnectConfig(params);
  await ssh.connect(config);
  return ssh;
}

async function closeConnection(ssh) {
  await ssh.dispose();
}

// Récupère un fichier ou dossier distant vers un fichier local temporaire
// Retourne { localPath, isDirectory, remoteSize }
async function fetchRemotePath(ssh, remotePath) {
  const safe = assertSafePath(remotePath);

  // Vérifier existence et type
  const statOut = await executeCommand(ssh, `stat --printf="%F\\n%s" ${safe} 2>/dev/null || echo "NOT_FOUND"`);
  if (statOut === 'NOT_FOUND' || statOut.trim() === '') {
    throw Object.assign(new Error(`Chemin distant introuvable : ${safe}`), { status: 404 });
  }

  const lines = statOut.split('\n');
  const fileType = lines[0].trim();
  const remoteSize = parseInt(lines[1] || '0', 10);

  if (remoteSize > MAX_SIZE_BYTES) {
    throw Object.assign(new Error(`Fichier trop volumineux (> 10 Go)`), { status: 413 });
  }

  const isDirectory = fileType.includes('directory');
  const tmpFile = path.join(os.tmpdir(), `ssh_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);

  if (isDirectory) {
    await fetchDirectory(ssh, safe, tmpFile);
  } else {
    await fetchFile(ssh, safe, tmpFile);
  }

  return { localPath: tmpFile, isDirectory, remoteSize };
}

// Calcule le hash SHA-256 d'un fichier distant
async function remoteHash(ssh, remotePath) {
  const safe = assertSafePath(remotePath);
  // Pour un dossier, on hash le tar à la volée (sans le stocker)
  const statOut = await executeCommand(ssh, `stat --printf="%F" ${safe} 2>/dev/null || echo "NOT_FOUND"`);
  if (statOut === 'NOT_FOUND') throw new Error(`Chemin distant introuvable : ${safe}`);

  let hashCmd;
  if (statOut.includes('directory')) {
    hashCmd = `tar -czO -C ${path.posix.dirname(safe)} ${path.posix.basename(safe)} | sha256sum | cut -d' ' -f1`;
  } else {
    hashCmd = `sha256sum ${safe} | cut -d' ' -f1`;
  }
  return executeCommand(ssh, hashCmd);
}

module.exports = {
  testConnection,
  connect,
  closeConnection,
  fetchRemotePath,
  remoteHash,
  executeCommand,
  fetchFile,
  fetchDirectory,
  pushFile,
};
