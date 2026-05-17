# Phase 25 — Conformité DORA — rétention, legal hold, rapports

**Objectif** : Implémenter les exigences réglementaires bancaires : politique de rétention automatique, legal hold (blocage de suppression sur ordre judiciaire), rapports d'audit exportables et tests de restauration obligatoires conformes au règlement DORA (Digital Operational Resilience Act, UE 2025).

**Durée estimée** : 1 semaine.

**Prérequis** : Phase 24 complétée.

**Textes applicables** :
- **DORA** (Règlement UE 2022/2554) : articles 9, 11, 12 — résilience opérationnelle numérique
- **Bâle III** : conservation des données transactionnelles 10 ans minimum
- **DSP2** : traçabilité complète des paiements 5 ans
- **RGPD** : droit à l'oubli (antagoniste avec l'immutabilité Fabric — gérer par anonymisation)

---

## Étapes

### 1. Politique de rétention — modèle Prisma

Ajouter dans `backend/prisma/schema.prisma` :

```prisma
model RetentionPolicy {
  id          Int      @id @default(autoincrement())
  name        String   @unique      // ex: "transactions-5ans", "logs-90j"
  pattern     String                // glob pattern des noms de fichiers : "*.csv", "logs/*"
  retainDays  Int                   // jours de conservation obligatoire
  autoDelete  Boolean  @default(false) // supprimer automatiquement à l'expiration
  createdAt   DateTime @default(now())
  createdBy   String
}

model LegalHold {
  id          Int      @id @default(autoincrement())
  backupId    String                // référence au backup concerné
  reason      String                // motif légal (ex: "Enquête AMF 2025-001")
  heldBy      String                // email de l'administrateur qui a posé le hold
  heldAt      DateTime @default(now())
  releasedAt  DateTime?             // null = hold actif
  releasedBy  String?

  @@index([backupId])
}

model RestoreTest {
  id          Int      @id @default(autoincrement())
  backupId    String
  testedAt    DateTime @default(now())
  success     Boolean
  durationMs  Int
  sizeBytes   BigInt
  hashMatch   Boolean              // SHA-256 original == SHA-256 restauré
  error       String?
  testedBy    String               // "system" pour les tests automatiques
}
```

Générer la migration : `npx prisma migrate dev --name add_compliance`

### 2. Routes DORA — `backend/src/routes/compliance.js`

```javascript
'use strict';
const { Router }  = require('express');
const db          = require('../services/db');
const requireRole = require('../middleware/role');
const authMiddleware = require('../middleware/auth');

const router = Router();
router.use(authMiddleware);

// ── Politiques de rétention ───────────────────────────────────────────────────

router.get('/retention', requireRole('admin'), async (req, res, next) => {
  try {
    const policies = await db.retentionPolicy.findMany({ orderBy: { name: 'asc' } });
    res.json(policies);
  } catch (err) { next(err); }
});

router.post('/retention', requireRole('admin'), async (req, res, next) => {
  try {
    const { name, pattern, retainDays, autoDelete } = req.body;
    if (!name || !pattern || !retainDays) return res.status(400).json({ error: 'Champs requis manquants' });
    const policy = await db.retentionPolicy.create({
      data: { name, pattern, retainDays: parseInt(retainDays), autoDelete: Boolean(autoDelete), createdBy: req.user.email },
    });
    res.status(201).json(policy);
  } catch (err) { next(err); }
});

// ── Legal hold ────────────────────────────────────────────────────────────────

router.post('/legal-hold/:backupId', requireRole('admin'), async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: 'Le motif est obligatoire' });
    const hold = await db.legalHold.create({
      data: { backupId: req.params.backupId, reason, heldBy: req.user.email },
    });
    res.status(201).json(hold);
  } catch (err) { next(err); }
});

router.delete('/legal-hold/:holdId', requireRole('admin'), async (req, res, next) => {
  try {
    await db.legalHold.update({
      where: { id: parseInt(req.params.holdId) },
      data: { releasedAt: new Date(), releasedBy: req.user.email },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Tests de restauration ─────────────────────────────────────────────────────

router.get('/restore-tests', requireRole('admin'), async (req, res, next) => {
  try {
    const tests = await db.restoreTest.findMany({
      orderBy: { testedAt: 'desc' },
      take: 100,
    });
    res.json(tests);
  } catch (err) { next(err); }
});

// ── Rapport DORA exportable ───────────────────────────────────────────────────

router.get('/report', requireRole('admin'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    const dateTo   = to   ? new Date(to)   : new Date();

    const [totalBackups, restoreTests, legalHolds, retentionPolicies] = await Promise.all([
      db.backupOwnership.count({ where: { createdAt: { gte: dateFrom, lte: dateTo } } }),
      db.restoreTest.findMany({ where: { testedAt: { gte: dateFrom, lte: dateTo } } }),
      db.legalHold.findMany({ where: { heldAt: { gte: dateFrom, lte: dateTo } } }),
      db.retentionPolicy.findMany(),
    ]);

    const successRate = restoreTests.length > 0
      ? (restoreTests.filter(t => t.success).length / restoreTests.length * 100).toFixed(1)
      : null;

    res.json({
      period: { from: dateFrom, to: dateTo },
      backups: { total: totalBackups },
      restoreTesting: {
        total: restoreTests.length,
        successRate: successRate ? `${successRate}%` : 'N/A',
        failures: restoreTests.filter(t => !t.success),
      },
      legalHolds: {
        total: legalHolds.length,
        active: legalHolds.filter(h => !h.releasedAt).length,
        items: legalHolds,
      },
      retentionPolicies,
      doraCompliance: {
        rto: '<4h',  // à mesurer depuis les tests de restauration
        rpo: '<1h',  // à mesurer depuis les intervalles de backup
        testingFrequency: 'hebdomadaire',
        lastTestDate: restoreTests[0]?.testedAt ?? null,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
```

### 3. Cron — tests de restauration automatiques hebdomadaires

Dans `backend/src/services/scheduler.js`, ajouter une tâche :

```javascript
// Chaque lundi à 03:00 : tester la restauration du backup le plus récent
cron.schedule('0 3 * * 1', async () => {
  logger.info('[compliance] Test de restauration automatique démarré');
  try {
    const backups = await fabric.evaluateTransaction('getAllBackups');
    if (!backups.length) return;

    const latest   = backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    const start    = Date.now();
    const tmpPath  = `/tmp/restore-test-${latest.backupId}`;

    // Restaurer le fichier dans /tmp
    const ipfsStream = await ipfs.getStream(latest.cid);
    const decStream  = createDecryptStream(ipfsStream, env.MASTER_KEY);
    const writeStream = require('fs').createWriteStream(tmpPath);
    await pipeline(decStream, writeStream);

    // Vérifier le hash SHA-256
    const restoredHash = await sha256File(tmpPath);
    const hashMatch    = restoredHash === latest.fileHash;
    const durationMs   = Date.now() - start;
    const stat         = require('fs').statSync(tmpPath);

    await db.restoreTest.create({
      data: {
        backupId:  latest.backupId,
        success:   hashMatch,
        durationMs,
        sizeBytes: stat.size,
        hashMatch,
        testedBy:  'system',
      },
    });

    require('fs').unlinkSync(tmpPath);

    if (!hashMatch) {
      logger.error(`[compliance] ⚠️ Test de restauration ÉCHOUÉ pour ${latest.backupId} — hash mismatch`);
      // Alerte critique
    } else {
      logger.info(`[compliance] ✓ Test de restauration OK — ${(durationMs/1000).toFixed(1)}s`);
    }
  } catch (err) {
    logger.error(`[compliance] Test de restauration exception : ${err.message}`);
  }
});
```

### 4. Bloquer la suppression si legal hold actif

Dans la route `DELETE /api/backups/:id` (à créer si elle n'existe pas) :

```javascript
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const hold = await db.legalHold.findFirst({
      where: { backupId: req.params.id, releasedAt: null },
    });
    if (hold) {
      return res.status(403).json({
        error: `Suppression bloquée — legal hold actif : "${hold.reason}" (posé par ${hold.heldBy})`,
      });
    }
    // ... procéder à la suppression ...
  } catch (err) { next(err); }
});
```

### 5. Vérification de la politique de rétention avant suppression

```javascript
function isRetentionExpired(backup, policies) {
  const { filename, createdAt } = backup;
  for (const policy of policies) {
    const matches = require('micromatch').isMatch(filename, policy.pattern);
    if (matches) {
      const expiresAt = new Date(new Date(createdAt).getTime() + policy.retainDays * 86400000);
      if (new Date() < expiresAt) return { blocked: true, policy, expiresAt };
    }
  }
  return { blocked: false };
}
```

### 6. Page Conformité dans le frontend

Créer `frontend/src/pages/Compliance.jsx` avec :
- Tableau des politiques de rétention (CRUD)
- Liste des legal holds actifs
- Historique des tests de restauration avec indicateur vert/rouge
- Bouton "Télécharger rapport DORA (JSON)" appelant `GET /api/compliance/report`
- Indicateurs : RPO, RTO, taux de succès restauration

Ajouter la route dans `App.jsx` et un lien dans la navigation latérale.

---

## Validation

- [ ] Créer une politique de rétention "transactions-5ans" → upload d'un fichier `transactions.csv` → tentative de suppression → erreur "période de rétention non expirée"
- [ ] Poser un legal hold sur un backup → tentative de suppression → erreur "legal hold actif"
- [ ] Lever le legal hold → suppression possible
- [ ] Cron hebdomadaire exécuté manuellement → `RestoreTest` créé en base → hash match = true
- [ ] `GET /api/compliance/report` retourne un JSON complet avec toutes les métriques
- [ ] Test de restauration échoué (simuler un fichier corrompu) → log ERREUR + entrée `success: false` en base

---

## Action de fin de phase

1. Cocher dans [docs/Roadmap.md](../Roadmap.md)
2. Mettre à jour CLAUDE.md
3. `git commit -m "feat: phase 25 - conformité DORA rétention legal hold rapports"`
4. Passer à la [Phase 26](phase-26.md)
