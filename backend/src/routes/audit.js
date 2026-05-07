'use strict';
const { Router } = require('express');
const crypto = require('crypto');
const fabric = require('../services/fabric');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');

const router = Router();
router.use(authMiddleware);

// GET /api/audit — audit trail depuis le ledger Fabric
router.get('/', async (req, res, next) => {
  try {
    const { action, target, actor, dateFrom, dateTo, page = 1, limit = 50 } = req.query;
    const filters = {};
    if (action) filters.action = action;
    if (target) filters.target = target;
    if (actor)  filters.actor  = actor;
    if (dateFrom) filters.dateFrom = new Date(dateFrom).toISOString();
    if (dateTo)   filters.dateTo   = new Date(dateTo).toISOString();

    let entries = await fabric.evaluateTransaction('getAuditHistory', JSON.stringify(filters));
    const total = entries.length;
    const skip  = (Number(page) - 1) * Number(limit);
    entries = entries.slice(skip, skip + Number(limit));

    res.json({ total, page: Number(page), limit: Number(limit), entries });
  } catch (err) {
    next(err);
  }
});

// GET /api/audit/export?format=csv|pdf
router.get('/export', async (req, res, next) => {
  try {
    const format = req.query.format === 'pdf' ? 'pdf' : 'csv';
    const { action, actor, dateFrom, dateTo } = req.query;
    const filters = {};
    if (action)   filters.action   = action;
    if (actor)    filters.actor    = actor;
    if (dateFrom) filters.dateFrom = new Date(dateFrom).toISOString();
    if (dateTo)   filters.dateTo   = new Date(dateTo).toISOString();

    const entries = await fabric.evaluateTransaction('getAuditHistory', JSON.stringify(filters));
    const reportHash = crypto.createHash('sha256')
      .update(JSON.stringify(entries))
      .digest('hex');
    const generatedAt = new Date().toISOString();
    const generatedBy = req.user.email;

    if (format === 'csv') {
      const lines = [
        'timestamp,action,target,actor,txId',
        ...entries.map((e) =>
          [e.timestamp, e.action, e.target, e.actor, e.txId]
            .map((v) => `"${String(v || '').replace(/"/g, '""')}"`)
            .join(',')
        ),
        '',
        `"# Généré le: ${generatedAt}"`,
        `"# Par: ${generatedBy}"`,
        `"# Hash du rapport: ${reportHash}"`,
      ];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="audit_${Date.now()}.csv"`);
      return res.send(lines.join('\r\n'));
    }

    // PDF
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit_${Date.now()}.pdf"`);
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text('SecureBackup — Audit Trail', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica').fillColor('#555')
      .text(`Généré le : ${generatedAt}   |   Par : ${generatedBy}   |   Entrées : ${entries.length}`, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(7).fillColor('#888').text(`Hash du rapport : ${reportHash}`, { align: 'center' });
    doc.moveDown(1).fillColor('#000');

    // Table header
    const colX = [40, 130, 220, 310, 450];
    const headers = ['Horodatage', 'Action', 'Cible', 'Acteur (tronqué)', 'TxID (tronqué)'];
    doc.fontSize(8).font('Helvetica-Bold');
    headers.forEach((h, i) => doc.text(h, colX[i], doc.y, { width: colX[i + 1] ? colX[i + 1] - colX[i] - 4 : 100, continued: i < headers.length - 1 }));
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#333').stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(7);
    for (const e of entries) {
      const y = doc.y;
      if (y > 760) { doc.addPage(); }
      const cols = [
        e.timestamp ? e.timestamp.replace('T', ' ').slice(0, 19) : '',
        e.action || '',
        (e.target || '').slice(0, 20),
        (e.actor || '').slice(-30),
        (e.txId || '').slice(0, 16) + '…',
      ];
      cols.forEach((v, i) => {
        doc.text(v, colX[i], doc.y, {
          width: colX[i + 1] ? colX[i + 1] - colX[i] - 4 : 100,
          continued: i < cols.length - 1,
        });
      });
      doc.moveDown(0.4);
    }

    doc.end();

    logger.info('[audit] Export généré', { format, count: entries.length, by: req.user.email });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
