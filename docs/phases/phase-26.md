# Phase 26 — Monitoring SLA banking-grade (Prometheus + Grafana)

**Objectif** : Déployer un stack de monitoring complet avec Prometheus, Grafana et Alertmanager, exposant des métriques spécifiques aux SLA bancaires : débit d'ingestion, RPO/RTO en temps réel, taux de déduplication, statut des organisations Fabric, alertes sur les écarts de SLA.

**Durée estimée** : 1 semaine.

**Prérequis** : Phase 25 complétée.

**SLA bancaires visés** :
| Métrique | Objectif |
|----------|----------|
| RPO (Recovery Point Objective) | ≤ 1 heure |
| RTO (Recovery Time Objective) | ≤ 4 heures |
| Disponibilité du système | ≥ 99,9 % |
| Débit d'ingestion minimal | ≥ 100 Mo/s |
| Taux de succès backup | ≥ 99,5 % |
| Taux de succès restauration | 100 % |

---

## Étapes

### 1. Ajouter Prometheus, Grafana et Alertmanager au `docker-compose.yml`

```yaml
prometheus:
  image: prom/prometheus:latest
  volumes:
    - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    - ./monitoring/alerts.yml:/etc/prometheus/alerts.yml
    - prometheus-data:/prometheus
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
    - '--storage.tsdb.retention.time=90d'
  ports:
    - "9090:9090"

grafana:
  image: grafana/grafana:latest
  environment:
    GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
    GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH: /var/lib/grafana/dashboards/securebackup.json
  volumes:
    - ./monitoring/grafana/dashboards:/var/lib/grafana/dashboards
    - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
    - grafana-data:/var/lib/grafana
  ports:
    - "3001:3000"

alertmanager:
  image: prom/alertmanager:latest
  volumes:
    - ./monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml
  ports:
    - "9093:9093"

volumes:
  prometheus-data:
  grafana-data:
```

### 2. `monitoring/prometheus.yml`

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - /etc/prometheus/alerts.yml

scrape_configs:
  - job_name: 'securebackup-backend'
    static_configs:
      - targets: ['backend:3000']
    metrics_path: /api/metrics

  - job_name: 'ipfs'
    static_configs:
      - targets: ['ipfs0:5001']
    metrics_path: /debug/metrics/prometheus

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'fabric-peer'
    static_configs:
      - targets: ['peer0.org1.example.com:9443']
    metrics_path: /metrics
    scheme: https
    tls_config:
      insecure_skip_verify: true
```

### 3. Exposer les métriques Prometheus dans le backend

Installer `prom-client` :
```bash
cd backend
npm install prom-client
```

Créer `backend/src/services/metrics.js` :

```javascript
'use strict';
const client = require('prom-client');

// Activer les métriques Node.js par défaut (CPU, RAM, event loop lag)
client.collectDefaultMetrics({ prefix: 'sbc_' });

// ── Métriques métier SecureBackup ────────────────────────────────────────────

const backupIngestionTotal = new client.Counter({
  name: 'sbc_backup_ingestion_total',
  help: 'Nombre total de sauvegardes ingérées',
  labelNames: ['status', 'org'],
});

const backupIngestionBytes = new client.Counter({
  name: 'sbc_backup_ingestion_bytes_total',
  help: 'Volume total ingéré en octets',
  labelNames: ['org'],
});

const backupIngestionDuration = new client.Histogram({
  name: 'sbc_backup_ingestion_duration_seconds',
  help: 'Durée d\'ingestion d\'une sauvegarde',
  buckets: [1, 5, 30, 60, 300, 600, 3600],
});

const currentIngestRateBytesPerSec = new client.Gauge({
  name: 'sbc_ingest_rate_bytes_per_second',
  help: 'Débit d\'ingestion en temps réel (octets/s)',
});

const dedupRatio = new client.Gauge({
  name: 'sbc_dedup_ratio',
  help: 'Ratio de déduplication (0 à 1 — 1 = 100% dédupliqué)',
});

const rpoSeconds = new client.Gauge({
  name: 'sbc_rpo_seconds',
  help: 'RPO actuel : temps depuis la dernière sauvegarde réussie',
  labelNames: ['source'],
});

const fabricPeerStatus = new client.Gauge({
  name: 'sbc_fabric_peer_up',
  help: '1 si le peer Fabric répond, 0 sinon',
  labelNames: ['org', 'peer'],
});

const restoreTestSuccess = new client.Gauge({
  name: 'sbc_restore_test_last_success',
  help: '1 si le dernier test de restauration a réussi, 0 sinon',
});

const legalHoldsActive = new client.Gauge({
  name: 'sbc_legal_holds_active',
  help: 'Nombre de legal holds actifs',
});

const chunkUploadErrors = new client.Counter({
  name: 'sbc_chunk_upload_errors_total',
  help: 'Nombre d\'erreurs d\'upload de chunk',
  labelNames: ['error_type'],
});

module.exports = {
  client,
  backupIngestionTotal,
  backupIngestionBytes,
  backupIngestionDuration,
  currentIngestRateBytesPerSec,
  dedupRatio,
  rpoSeconds,
  fabricPeerStatus,
  restoreTestSuccess,
  legalHoldsActive,
  chunkUploadErrors,
};
```

### 4. Endpoint `/api/metrics`

Dans `backend/src/app.js`, ajouter **avant** le middleware d'authentification :

```javascript
const { client } = require('./services/metrics');

app.get('/api/metrics', async (req, res) => {
  // Endpoint protégé par un token Prometheus (pas JWT)
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token !== process.env.PROMETHEUS_SCRAPE_TOKEN) {
    return res.status(401).end();
  }
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
```

### 5. Instrumenter les routes critiques

Dans `backend/src/routes/backups.js`, enregistrer les métriques après chaque ingestion :

```javascript
const metrics = require('../services/metrics');

// Après ingestion réussie (route POST / et route /chunks/:uploadId) :
const durationSec = (Date.now() - startTime) / 1000;
metrics.backupIngestionTotal.inc({ status: 'success', org: 'Org1MSP' });
metrics.backupIngestionBytes.inc({ org: 'Org1MSP' }, size);
metrics.backupIngestionDuration.observe(durationSec);
metrics.currentIngestRateBytesPerSec.set(size / durationSec);

// En cas d'erreur :
metrics.backupIngestionTotal.inc({ status: 'error', org: 'Org1MSP' });
metrics.chunkUploadErrors.inc({ error_type: err.code || 'unknown' });
```

### 6. Cron de mise à jour des métriques RPO et statut

Dans `backend/src/services/monitoring.js`, ajouter :

```javascript
const metrics = require('./metrics');
const fabric  = require('./fabric');
const db      = require('./db');

// Toutes les 30 secondes : mettre à jour les métriques de santé
setInterval(async () => {
  try {
    // RPO : temps depuis la dernière sauvegarde
    const lastBackup = await db.backupOwnership.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (lastBackup) {
      const rpoSec = (Date.now() - new Date(lastBackup.createdAt).getTime()) / 1000;
      metrics.rpoSeconds.set({ source: 'all' }, rpoSec);
    }

    // Statut Fabric peers
    for (const [org, peer] of [['Org1MSP', 'peer0.org1.example.com'], ['Org2MSP', 'peer0.org2.example.com']]) {
      try {
        await fabric.evaluateTransaction('getHealth');
        metrics.fabricPeerStatus.set({ org, peer }, 1);
      } catch {
        metrics.fabricPeerStatus.set({ org, peer }, 0);
      }
    }

    // Dernier test de restauration
    const lastTest = await db.restoreTest.findFirst({ orderBy: { testedAt: 'desc' } });
    metrics.restoreTestSuccess.set(lastTest?.success ? 1 : 0);

    // Legal holds actifs
    const holds = await db.legalHold.count({ where: { releasedAt: null } });
    metrics.legalHoldsActive.set(holds);

  } catch (err) {
    // Ne pas crasher le process si le monitoring échoue
  }
}, 30000);
```

### 7. `monitoring/alerts.yml` — règles d'alerte DORA

```yaml
groups:
  - name: securebackup-sla
    rules:
      - alert: RPOBreached
        expr: sbc_rpo_seconds{source="all"} > 3600
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "RPO dépassé — aucun backup depuis plus d'1 heure"
          description: "Dernière sauvegarde il y a {{ $value | humanizeDuration }}"

      - alert: LowIngestRate
        expr: sbc_ingest_rate_bytes_per_second < 10485760  # 10 Mo/s
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Débit d'ingestion trop faible (< 10 Mo/s)"

      - alert: FabricPeerDown
        expr: sbc_fabric_peer_up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Peer Fabric {{ $labels.peer }} hors ligne"

      - alert: RestoreTestFailed
        expr: sbc_restore_test_last_success == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Le dernier test de restauration automatique a ÉCHOUÉ"

      - alert: BackupIngestionErrors
        expr: increase(sbc_chunk_upload_errors_total[1h]) > 10
        labels:
          severity: warning
        annotations:
          summary: "Plus de 10 erreurs d'upload dans la dernière heure"
```

### 8. `monitoring/alertmanager.yml` — envoi des alertes

```yaml
global:
  smtp_smarthost: '${SMTP_HOST}:587'
  smtp_from: 'alerting@securebackup.local'
  smtp_auth_username: '${SMTP_USER}'
  smtp_auth_password: '${SMTP_PASS}'

route:
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  receiver: 'ops-team'
  routes:
    - match:
        severity: critical
      receiver: 'ops-team-critical'

receivers:
  - name: 'ops-team'
    email_configs:
      - to: 'ops@banque.example.com'
  - name: 'ops-team-critical'
    email_configs:
      - to: 'oncall@banque.example.com'
    # Optionnel : webhook vers PagerDuty / Opsgenie
```

### 9. Dashboard Grafana — importer le JSON

Créer `monitoring/grafana/dashboards/securebackup.json` avec les panneaux :

- **Row 1 — SLA en temps réel** : RPO actuel, RTO dernier test, uptime 30j, taux succès backup
- **Row 2 — Performance** : débit d'ingestion (Go/h graphe temporel), ratio déduplication, volume stocké IPFS
- **Row 3 — Infrastructure** : statut Fabric peers (Org1 + Org2), latence transactions Fabric, event loop lag Node.js
- **Row 4 — Conformité** : legal holds actifs, résultats tests de restauration (tableau), violations de politique de rétention
- **Row 5 — Alertes actives** : panel Alertmanager intégré

### 10. Page Monitoring dans le frontend

Créer `frontend/src/pages/Monitoring.jsx` avec un iframe Grafana embarqué (en production, Grafana est accessible via SSO) ou des widgets React qui appellent l'API Prometheus directement via `GET /api/admin/metrics-summary`.

---

## Validation

- [ ] `http://localhost:9090` → Prometheus scrape backend toutes les 15s sans erreur
- [ ] `http://localhost:3001` → Grafana connecté à Prometheus, dashboard SecureBackup chargé
- [ ] Simuler RPO breach (arrêter les uploads 1h) → alerte `RPOBreached` envoyée par email
- [ ] Arrêter le peer Org2 → alerte `FabricPeerDown` dans Alertmanager en < 5min
- [ ] Upload d'un fichier 1 Go → métriques `sbc_backup_ingestion_bytes_total` et `sbc_ingest_rate_bytes_per_second` visibles dans Prometheus
- [ ] `sbc_rpo_seconds` se remet à 0 après chaque backup réussi
- [ ] Dashboard Grafana : graphe de débit temps réel montre la progression d'un upload en cours

---

## Action de fin de phase

1. Cocher dans [docs/Roadmap.md](../Roadmap.md)
2. Mettre à jour CLAUDE.md → "Niveau bancaire atteint — toutes les phases complétées"
3. `git commit -m "feat: phase 26 - monitoring SLA banking-grade Prometheus Grafana"`
4. Tag : `git tag v2.0.0-banking && git push --tags`
5. 🎉 Le système est prêt pour un déploiement en environnement bancaire national.
