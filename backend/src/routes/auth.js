'use strict';
const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { randomUUID } = require('crypto');
const db = require('../services/db');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/role');
const env = require('../../config/env');

const router = Router();

function signAccess(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.JWT.SECRET,
    { expiresIn: env.JWT.EXPIRY },
  );
}

async function issueRefresh(userId) {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.refreshToken.create({ data: { token, userId, expiresAt } });
  return token;
}

// POST /api/auth/register — admin only
router.post('/register', authMiddleware, requireRole('admin'), async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password || !role) return res.status(400).json({ error: 'email, password et role requis' });
    if (!['admin', 'responsable', 'auditeur'].includes(role)) return res.status(400).json({ error: 'Rôle invalide' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await db.user.create({ data: { email, passwordHash, role } });
    res.status(201).json({ id: user.id, email: user.email, role: user.role });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email déjà utilisé' });
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password, mfaToken } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email et password requis' });

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    if (user.mfaEnabled) {
      if (!mfaToken) return res.status(200).json({ mfaRequired: true });
      const valid = speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'base32',
        token: mfaToken,
        window: 1,
      });
      if (!valid) return res.status(401).json({ error: 'Code MFA invalide' });
    }

    await db.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
    const accessToken = signAccess(user);
    const refreshToken = await issueRefresh(user.id);
    res.json({ accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) { next(err); }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken requis' });

    const stored = await db.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Refresh token invalide ou expiré' });
    }

    await db.refreshToken.delete({ where: { id: stored.id } });
    const accessToken = signAccess(stored.user);
    const newRefreshToken = await issueRefresh(stored.user.id);
    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) { next(err); }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await db.refreshToken.deleteMany({ where: { token: refreshToken } });
    res.json({ message: 'Déconnecté' });
  } catch (err) { next(err); }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const user = await db.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, email: true, role: true, mfaEnabled: true, createdAt: true, lastLogin: true },
    });
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json(user);
  } catch (err) { next(err); }
});

// POST /api/auth/mfa/enable — génère le secret et le QR code
router.post('/mfa/enable', authMiddleware, async (req, res, next) => {
  try {
    const secret = speakeasy.generateSecret({ name: `SecureBackup (${req.user.email})`, length: 20 });
    await db.user.update({ where: { id: req.user.sub }, data: { mfaSecret: secret.base32 } });
    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
    res.json({ secret: secret.base32, qrCode: qrDataUrl });
  } catch (err) { next(err); }
});

// POST /api/auth/mfa/confirm — active le MFA après vérification du premier code
router.post('/mfa/confirm', authMiddleware, async (req, res, next) => {
  try {
    const { token } = req.body;
    const user = await db.user.findUnique({ where: { id: req.user.sub } });
    if (!user?.mfaSecret) return res.status(400).json({ error: 'MFA non initialisé' });

    const valid = speakeasy.totp.verify({
      secret: user.mfaSecret, encoding: 'base32', token, window: 1,
    });
    if (!valid) return res.status(400).json({ error: 'Code invalide' });

    await db.user.update({ where: { id: req.user.sub }, data: { mfaEnabled: true } });
    res.json({ message: 'MFA activé' });
  } catch (err) { next(err); }
});

// POST /api/auth/mfa/disable
router.post('/mfa/disable', authMiddleware, async (req, res, next) => {
  try {
    await db.user.update({
      where: { id: req.user.sub },
      data: { mfaEnabled: false, mfaSecret: null },
    });
    res.json({ message: 'MFA désactivé' });
  } catch (err) { next(err); }
});

module.exports = router;
