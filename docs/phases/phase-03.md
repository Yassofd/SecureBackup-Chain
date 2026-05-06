# Phase 3 — IPFS local

**Objectif** : Avoir un nœud IPFS fonctionnel et accessible par API HTTP.

**Durée estimée** : 30 minutes.

**Prérequis** : Phase 2 complétée et validée.

---

## Étapes

### 1. Créer `ipfs/docker-compose-ipfs.yaml`

```yaml
version: '3.8'

networks:
  fabric:
    name: securebackup-fabric
    external: true

services:
  ipfs0:
    image: ipfs/kubo:latest
    container_name: ipfs0
    environment:
      - IPFS_PROFILE=server
    ports:
      - "4001:4001"          # Swarm
      - "5001:5001"          # API
      - "8080:8080"          # Gateway
    volumes:
      - ipfs0-data:/data/ipfs
      - ipfs0-staging:/export
    networks:
      - fabric

volumes:
  ipfs0-data:
  ipfs0-staging:
```

### 2. Démarrer le nœud

```bash
docker compose -f ipfs/docker-compose-ipfs.yaml up -d
docker logs ipfs0
```

### 3. Configurer l'API IPFS pour accepter les requêtes externes

```bash
docker exec ipfs0 ipfs config Addresses.API "/ip4/0.0.0.0/tcp/5001"
docker exec ipfs0 ipfs config --json API.HTTPHeaders.Access-Control-Allow-Origin '["*"]'
docker exec ipfs0 ipfs config --json API.HTTPHeaders.Access-Control-Allow-Methods '["PUT", "POST", "GET"]'
docker restart ipfs0
```

### 4. Tester l'API

```bash
# Vérifier la version
curl http://localhost:5001/api/v0/version

# Uploader un fichier
echo "Hello IPFS" > test.txt
curl -X POST -F file=@test.txt http://localhost:5001/api/v0/add

# Récupérer le fichier (utiliser le CID retourné)
curl http://localhost:8080/ipfs/<CID>
```

---

## Validation

- [ ] Le conteneur `ipfs0` tourne (`docker ps`)
- [ ] L'API répond sur `http://localhost:5001/api/v0/version`
- [ ] Un fichier uploadé peut être récupéré via la gateway
- [ ] Le CID retourné est stable (même contenu = même CID)

---

## Action de fin de phase

1. Cocher dans [docs/roadmap.md](../roadmap.md)
2. Mettre à jour CLAUDE.md
3. Commiter : `git commit -m "feat: phase 3 - IPFS local"`
4. Passer à la [Phase 4](phase-04.md)