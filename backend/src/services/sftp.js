'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const SftpClient = require('ssh2-sftp-client');
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

function buildConnectConfig({ host, port = 22, username, auth_type, credentials }) {
  const base = { host, port: Number(port), username, readyTimeout: 20000 };
  if (auth_type === 'password') return { ...base, password: credentials.password };
  return { ...base, privateKey: credentials.privateKey };
}

async function testConnection(params) {
  const sftp = new SftpClient();
  await sftp.connect(buildConnectConfig(params));
  await sftp.end();
  logger.info(`SFTP test OK: ${params.username}@${params.host}`);
}

async function connect(params) {
  const sftp = new SftpClient();
  await sftp.connect(buildConnectConfig(params));
  return sftp;
}

async function closeConnection(sftp) {
  try { await sftp.end(); } catch (_) {}
}

async function remoteFileExists(sftp, remotePath) {
  const result = await sftp.exists(remotePath);
  return result !== false;
}

async function mkdirRemote(sftp, remotePath) {
  await sftp.mkdir(remotePath, true);
}

// Télécharge un fichier ou dossier distant vers un fichier local temporaire.
// Retourne { localPath, isDirectory, remoteSize }
async function fetchRemotePath(sftp, remotePath) {
  const safe = assertSafePath(remotePath);

  const typeResult = await sftp.exists(safe);
  if (!typeResult) {
    throw Object.assign(new Error(`Chemin distant introuvable : ${safe}`), { status: 404 });
  }

  const isDirectory = typeResult === 'd';

  if (!isDirectory) {
    const stat = await sftp.stat(safe);
    if (stat.size > MAX_SIZE_BYTES) {
      throw Object.assign(new Error('Fichier trop volumineux (> 10 Go)'), { status: 413 });
    }
  }

  const tmpBase = path.join(os.tmpdir(), `sftp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const tmpFile = tmpBase + '.tmp';

  if (isDirectory) {
    const tmpDir = tmpBase + '_dir';
    fs.mkdirSync(tmpDir, { recursive: true });
    await sftp.downloadDir(safe, tmpDir);
    execSync(`tar -czf "${tmpFile}" -C "${path.dirname(tmpDir)}" "${path.basename(tmpDir)}"`);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } else {
    await sftp.get(safe, tmpFile);
  }

  const remoteSize = fs.statSync(tmpFile).size;
  return { localPath: tmpFile, isDirectory, remoteSize };
}

async function pushFile(sftp, localPath, remotePath) {
  await sftp.put(localPath, remotePath);
}

module.exports = {
  testConnection,
  connect,
  closeConnection,
  fetchRemotePath,
  pushFile,
  mkdirRemote,
  remoteFileExists,
};
