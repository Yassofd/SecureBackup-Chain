# Phase 17 — Finitions et durcissement production

**Objectif** : Préparer le passage en production.

**Prérequis** : Phase 16 complétée.

---

## Étapes principales

### 1. Sécurité applicative

- HTTPS sur l'API : nginx en reverse proxy avec Let's Encrypt
- Headers HTTP : `helmet` pour Express
- Rate limiting : `express-rate-limit` (par IP et par utilisateur)
- Validation stricte : Zod sur tous les inputs
- CSP (Content Security Policy) côté frontend
- Audit npm : `npm audit fix`

### 2. Logs centralisés

- Winston ou Pino côté backend avec rotation
- Format JSON structuré
- Niveaux : debug, info, warn, error
- Optionnel : Loki + Grafana pour la centralisation

### 3. Monitoring avancé

- Prometheus avec exporters pour Fabric, IPFS, Node.js
- Grafana avec dashboards pré-configurés :
  - État du réseau Fabric
  - Performance API
  - Espace disque
  - Latence des transactions
- Alertmanager avec règles d'alerte

### 4. Backup de configuration

Endpoint `POST /api/admin/export-config` qui produit un fichier `.tar.gz.enc` contenant :
- Certificats Fabric
- Identifiants chiffrés (déchiffrables avec `MASTER_KEY`)
- Configuration des nœuds
- Snapshot de la base PostgreSQL
- État du ledger (genesis + blocs récents)

Endpoint `POST /api/admin/import-config` pour la restauration.

### 5. Snapshots automatiques

Cron quotidien :
- Snapshot PostgreSQL : `pg_dump`
- Snapshot du ledger : `peer channel fetch`
- Stockage redondant (peut être sur IPFS lui-même !)

### 6. Tests automatisés

- Tests unitaires backend (Jest) — couverture > 70%
- Tests d'intégration (Supertest) — endpoints critiques
- Tests end-to-end (Playwright) — flux utilisateur complets
- CI : GitHub Actions ou GitLab CI

### 7. Documentation utilisateur

Dans `docs/` :
- `user-guide.md` — pour les responsables et auditeurs
- `admin-guide.md` — gestion du réseau, ajout de nœuds
- `disaster-recovery.md` — procédure de reprise après sinistre
- `api-reference.md` — documentation de l'API REST

### 8. Optimisations

- Compression gzip sur l'API
- Cache HTTP pour les ressources statiques
- Lazy loading côté frontend
- Pagination obligatoire sur les listes
- Index PostgreSQL sur les colonnes filtrées

### 9. Conformité

- RGPD : consentement, droit à l'oubli (anonymisation)
- Politique de rétention des logs
- Politique d'audit

---

## Validation

- [ ] HTTPS fonctionnel avec certificat valide
- [ ] Rate limiting empêche les abus
- [ ] Tests automatisés passent en CI
- [ ] Dashboards Grafana opérationnels
- [ ] Backup de configuration testé
- [ ] Restauration testée sur infrastructure neuve
- [ ] Documentation à jour

---

## Action de fin de phase

🎉 **Projet en production !**

1. Cocher dans [docs/roadmap.md](../roadmap.md)
2. Mettre à jour CLAUDE.md → "Projet stable, en maintenance"
3. Tag git : `git tag v1.0.0 && git push --tags`
4. Célébrer 🥂