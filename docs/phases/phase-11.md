# Phase 11 — Vue topologique et monitoring

**Objectif** : Superviser l'état du réseau en temps réel.

**Prérequis** : Phase 10 complétée.

---

## Étapes principales

### 1. Service `services/monitoring.js`

Collecte périodique (toutes les 30 secondes) :
- État des peers via `peer node status` (gRPC)
- État du cluster Raft : qui est leader (logs ou API admin)
- Nœuds IPFS : `ipfs swarm peers`, espace disque
- Métriques système des conteneurs : utiliser `dockerode` ou l'API Docker

### 2. Table `network_nodes`

```sql
CREATE TABLE network_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL,
  organization VARCHAR(100),
  host VARCHAR(255),
  port INT,
  status VARCHAR(20),
  is_leader BOOLEAN DEFAULT FALSE,
  last_seen TIMESTAMP,
  metrics JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Endpoints

- `GET /api/network/topology` — liste de tous les nœuds avec statut
- `GET /api/network/nodes/:id` — détail d'un nœud
- `GET /api/network/nodes/:id/logs` — logs récents
- `GET /api/network/health` — résumé global

### 4. Frontend — Page "Réseau"

- Vue topologique : utiliser `react-flow` pour afficher les nœuds et leurs liens
- Statut visuel : vert (actif), orange (dégradé), rouge (hors ligne)
- Étoile sur le leader Raft
- Clic sur un nœud → panneau latéral avec métriques et actions
- Auto-refresh toutes les 30 secondes

### 5. Alertes

Quand un nœud passe en `offline` ou `degraded` → notification automatique aux admins.

---

## Validation

- [ ] La vue topologique affiche tous les nœuds
- [ ] Couper un peer → marqué hors ligne en moins de 60 secondes
- [ ] Le leader Raft est identifié visuellement
- [ ] Les métriques système sont à jour
- [ ] Une notification est envoyée en cas de panne

---

## Action de fin de phase

Cocher → CLAUDE.md → commit → [Phase 12](phase-12.md).