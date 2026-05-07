'use strict';
const db = require('./db');
const logger = require('../utils/logger');

// Optional nodemailer — only active if SMTP_HOST is set
let transporter = null;
try {
  if (process.env.SMTP_HOST) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
} catch (_) { /* nodemailer optionnel */ }

async function notify(userId, type, title, message) {
  try {
    await db.notification.create({ data: { userId, type, title, message } });
  } catch (err) {
    logger.warn('[notifications] Impossible de créer la notification', { err: err.message });
  }
}

async function notifyAdmins(type, title, message) {
  try {
    const admins = await db.user.findMany({ where: { role: 'admin' }, select: { id: true } });
    await Promise.all(admins.map((a) => notify(a.id, type, title, message)));
  } catch (err) {
    logger.warn('[notifications] notifyAdmins error', { err: err.message });
  }
}

async function notifyByEmail(to, subject, text) {
  if (!transporter) return;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@securebackup',
      to,
      subject,
      text,
    });
  } catch (err) {
    logger.warn('[notifications] Email non envoyé', { err: err.message });
  }
}

module.exports = { notify, notifyAdmins, notifyByEmail };
