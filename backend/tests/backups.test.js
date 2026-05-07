'use strict';
const request = require('supertest');

jest.mock('../src/services/fabric', () => ({
  submitTransaction: jest.fn(),
  evaluateTransaction: jest.fn(),
  healthCheck: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
}));

jest.mock('../src/services/ipfs', () => ({
  version: jest.fn().mockResolvedValue({ Version: '0.41.0' }),
  add: jest.fn().mockResolvedValue('QmTestCid123'),
  cat: jest.fn(),
}));

const fabric = require('../src/services/fabric');
const ipfs = require('../src/services/ipfs');
const { encryptAES, sha256 } = require('../src/services/crypto');

process.env.MASTER_KEY = 'a839c23c58aa888b60e4aababa00746368205eae8c0ecb86917e3334a574deaf';

const app = require('../src/app');

describe('GET /api/health', () => {
  it('returns 200 when all services ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ fabric: 'ok', ipfs: 'ok' });
  });

  it('returns 503 when fabric fails', async () => {
    fabric.healthCheck.mockRejectedValueOnce(new Error('down'));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.fabric).toBe('error');
    expect(res.body.ipfs).toBe('ok');
  });
});

describe('POST /api/backups', () => {
  it('returns 400 when no file attached', async () => {
    const res = await request(app).post('/api/backups');
    expect(res.status).toBe(400);
  });

  it('uploads file and registers on Fabric', async () => {
    const fileContent = Buffer.from('hello world');
    const expectedEntry = {
      backupId: 'test-uuid',
      cid: 'QmTestCid123',
      txId: 'tx-abc',
    };
    fabric.submitTransaction.mockResolvedValueOnce(expectedEntry);

    const res = await request(app)
      .post('/api/backups')
      .attach('file', fileContent, 'hello.txt');

    expect(res.status).toBe(201);
    expect(res.body.cid).toBe('QmTestCid123');
    expect(ipfs.add).toHaveBeenCalled();
    expect(fabric.submitTransaction).toHaveBeenCalledWith(
      'registerBackup',
      expect.any(String),
      'QmTestCid123',
      'hello.txt',
      sha256(fileContent),
      String(fileContent.length),
      expect.any(String),
    );
  });
});

describe('GET /api/backups/:id', () => {
  it('returns backup from Fabric', async () => {
    const entry = { backupId: 'b001', cid: 'QmTestCid123', fileName: 'hello.txt' };
    fabric.evaluateTransaction.mockResolvedValueOnce(entry);

    const res = await request(app).get('/api/backups/b001');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(entry);
  });

  it('returns 404 when backup not found', async () => {
    fabric.evaluateTransaction.mockRejectedValueOnce(new Error('Sauvegarde b999 introuvable'));
    const res = await request(app).get('/api/backups/b999');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/backups/:id/download', () => {
  it('decrypts and returns original file', async () => {
    const original = Buffer.from('secret content');
    const encrypted = encryptAES(original, process.env.MASTER_KEY);

    fabric.evaluateTransaction.mockResolvedValueOnce({
      backupId: 'b001',
      cid: 'QmTestCid123',
      fileName: 'secret.txt',
      mimeType: 'text/plain',
    });
    ipfs.cat.mockResolvedValueOnce(encrypted);

    const res = await request(app).get('/api/backups/b001/download');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('secret.txt');
    expect(res.text).toBe(original.toString());
  });
});

describe('POST /api/backups/:id/verify', () => {
  it('verifies integrity with correct file', async () => {
    fabric.submitTransaction.mockResolvedValueOnce({ backupId: 'b001', valid: true });
    const res = await request(app)
      .post('/api/backups/b001/verify')
      .attach('file', Buffer.from('hello world'), 'hello.txt');
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
  });
});
