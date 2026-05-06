# Phase 16 — Cluster IPFS et réplication

**Objectif** : Garantir la persistance des fichiers via IPFS Cluster.

**Prérequis** : Phase 15 complétée.

---

## Étapes principales

### 1. Comprendre IPFS Cluster

IPFS Cluster est une couche au-dessus d'IPFS qui :
- Coordonne le pinning entre plusieurs nœuds
- Garantit qu'un fichier est répliqué sur N nœuds
- Expose une API unifiée (port 9094)

### 2. Mise à jour des docker-compose

Pour chaque nœud IPFS, ajouter un conteneur `ipfs-cluster-service` :

```yaml
services:
  ipfs0:
    image: ipfs/kubo:latest
    # ... (existant)

  cluster0:
    image: ipfs/ipfs-cluster:latest
    depends_on:
      - ipfs0
    environment:
      - CLUSTER_PEERNAME=cluster0
      - CLUSTER_SECRET=${CLUSTER_SECRET}
      - CLUSTER_IPFSHTTP_NODEMULTIADDRESS=/dns4/ipfs0/tcp/5001
      - CLUSTER_CRDT_TRUSTEDPEERS=*
      - CLUSTER_RESTAPI_HTTPLISTENMULTIADDRESS=/ip4/0.0.0.0/tcp/9094
    ports:
      - "9094:9094"
      - "9095:9095"
      - "9096:9096"
    volumes:
      - cluster0-data:/data/ipfs-cluster
```

### 3. Secret partagé

Générer une fois et partager sur tous les nœuds :
```bash
openssl rand -hex 32
```

Mettre dans `.env` : `CLUSTER_SECRET=<valeur>`.

### 4. Initialiser le cluster

Sur le premier nœud :
```bash
docker exec cluster0 ipfs-cluster-service init
```

Sur les autres nœuds, récupérer la peer ID du premier et démarrer en mode follower.

### 5. Adapter le service IPFS du backend

Au lieu d'appeler directement `ipfs-http-client` sur le port 5001, utiliser l'API cluster sur le port 9094 pour les opérations de pin :

```javascript
// Avant
ipfs.add(buffer)

// Après
ipfsCluster.pin.add(buffer, { replication_factor_min: 2, replication_factor_max: 3 })
```

### 6. Tester la réplication

```bash
# Upload sur le nœud 1
curl -X POST -F file=@test.pdf http://node1:9094/api/v0/add

# Vérifier sur le nœud 2
docker exec ipfs1 ipfs cat <CID>
```

---

## Validation

- [ ] Les nœuds IPFS sont coordonnés par le cluster
- [ ] Un upload est automatiquement répliqué
- [ ] Couper un nœud IPFS → le fichier reste accessible
- [ ] La réplication respecte le facteur configuré
- [ ] L'API backend utilise correctement l'API cluster

---

## Action de fin de phase

Cocher → CLAUDE.md → commit → [Phase 17](phase-17.md).