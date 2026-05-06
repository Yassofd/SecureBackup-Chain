# Phase 9 — Sauvegardes planifiées

**Objectif** : Planifier des sauvegardes récurrentes via cron-like.

**Prérequis** : Phase 8 complétée.

---

## Étapes principales

### 1. Installer node-cron

```bash
cd backend && npm install node-cron
```

### 2. Table `scheduled_backups`

```sql
CREATE TABLE scheduled_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  ssh_server_id UUID REFERENCES ssh_servers(id),
  remote_path TEXT NOT NULL,
  cron_expression VARCHAR(100) NOT NULL,
  retention_days INT DEFAULT 30,
  retention_count INT,
  status VARCHAR(20) DEFAULT 'active',
  last_run TIMESTAMP,
  next_run TIMESTAMP,
  last_status VARCHAR(20),
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE scheduled_backup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES scheduled_backups(id),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  status VARCHAR(20),
  backup_id VARCHAR(100),
  error_message TEXT
);
```

### 3. Service `services/scheduler.js`

- Au démarrage : charger toutes les tâches `active` et les enregistrer dans node-cron
- À l'exécution : lancer la sauvegarde distante (réutiliser le code de la phase 8)
- Mettre à jour `last_run`, `last_status`, `next_run`
- Logger dans `scheduled_backup_runs`
- Appliquer la politique de rétention (supprimer/archiver les anciens)

### 4. Endpoints

- `GET/POST/PUT/DELETE /api/schedules`
- `POST /api/schedules/:id/pause` et `/resume`
- `POST /api/schedules/:id/run-now` — exécution immédiate
- `GET /api/schedules/:id/history`

### 5. Frontend

Page "Planifications" avec :
- Liste des tâches actives
- Création avec assistant cron-friendly (tous les jours à 2h, toutes les semaines, etc.)
- Historique d'exécution par tâche
- Boutons pause/reprise/exécuter maintenant

---

## Validation

- [ ] Une tâche planifiée toutes les 5 minutes s'exécute correctement
- [ ] L'historique est tracé
- [ ] La pause/reprise fonctionne
- [ ] La rétention supprime les anciens fichiers
- [ ] Au redémarrage du backend, les tâches sont restaurées

---

## Action de fin de phase

Cocher → CLAUDE.md → commit → [Phase 10](phase-10.md).