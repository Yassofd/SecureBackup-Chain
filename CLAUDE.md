# CLAUDE.md

Guide opérationnel pour Claude Code sur le projet **SecureBackup-Chain**.

## Projet en bref

Système de sauvegarde décentralisée combinant **Hyperledger Fabric** (blockchain permissionnée pour les métadonnées) et **IPFS** (stockage distribué des fichiers chiffrés). Application web React + API Node.js + déploiement Docker multi-machines avec cluster Raft.

## État actuel

> ⚠️ **À mettre à jour à chaque fin de phase.**

- **Phase en cours** : Phase 16
- **Dernière phase complétée** : Phase 15 — Restauration vers serveur distant (endpoint restore-remote, modal BackupDetail, vérification espace disque, décompression tar.gz, audit Fabric)
- **Prochaine action** : voir docs/phases/phase-16.md

Voir la liste complète des phases dans [docs/roadmap.md](docs/roadmap.md).

## Commandes courantes

```bash
# Réseau Fabric (depuis ./network)
./scripts/start-network.sh           # Démarre le réseau Fabric local
./scripts/stop-network.sh            # Arrête le réseau et nettoie
./scripts/deploy-chaincode.sh        # Déploie/met à jour le chaincode
docker ps                            # Vérifie les conteneurs actifs

# Backend (depuis ./backend)
npm run dev                          # Lance l'API en mode développement (port 3000)
npm test                             # Tests unitaires Jest
npm run lint                         # Vérification ESLint

# Frontend (depuis ./frontend)
npm run dev                          # Lance le serveur Vite (port 5173)
npm run build                        # Build de production
npm run preview                      # Aperçu du build

# Lancement complet local (depuis la racine)
docker compose up -d                 # Tout l'écosystème en local
docker compose logs -f <service>     # Logs d'un service
docker compose down -v               # Arrêt + suppression des volumes
```

## Stack et versions

| Composant | Version | Notes |
|-----------|---------|-------|
| Hyperledger Fabric | 2.5.4 | Binaires + images Docker |
| Fabric CA | 1.5.7 | |
| Node.js | 18+ LTS | |
| IPFS (Kubo) | latest | Image `ipfs/kubo` |
| IPFS Cluster | latest | Image `ipfs/ipfs-cluster` |
| CouchDB | 3.3 | State database Fabric |
| React | 18 | Avec Vite |
| TailwindCSS | 3 | |
| Express | 4 | |

## Ports utilisés

| Service | Port | Protocole |
|---------|------|-----------|
| Orderer | 7050 | gRPC/TLS |
| Peer | 7051 | gRPC/TLS |
| Fabric CA | 7054 | HTTPS |
| CouchDB | 5984 | HTTP (interne) |
| IPFS API | 5001 | HTTP |
| IPFS Gateway | 8080 | HTTP |
| IPFS Swarm | 4001 | TCP/UDP |
| IPFS Cluster | 9094 | HTTP API |
| API backend | 3000 | HTTP |
| Frontend dev | 5173 | HTTP |

## Règles strictes (Do / Don't)

### ✅ À faire
- **Toujours** lire l'état actuel avant de coder. Travailler uniquement sur la phase en cours.
- **Toujours** valider une phase avec ses tests avant de passer à la suivante.
- **Toujours** utiliser `await` avec les appels Fabric SDK et IPFS.
- **Toujours** valider les inputs API avec Zod ou Joi.
- **Toujours** chiffrer les identifiants SSH au repos avec la clé maître `MASTER_KEY`.
- **Toujours** logger les opérations sensibles (sauvegardes, vérifications, partages, accès).
- **Toujours** mettre à jour la section "État actuel" à la fin d'une phase.

### ❌ À ne pas faire
- **Ne jamais** commiter `crypto-config/`, `wallet/`, `.env`, `volumes/`, `node_modules/`.
- **Ne jamais** hardcoder de mots de passe, clés ou certificats dans le code.
- **Ne jamais** régénérer les certificats Fabric en cours de projet (perte de données).
- **Ne jamais** désactiver TLS, même en développement multi-machines.
- **Ne jamais** sauter une phase ou faire plusieurs phases en parallèle.
- **Ne jamais** stocker un fichier non chiffré sur IPFS.
- **Ne jamais** exposer l'API sans authentification JWT (sauf endpoints publics explicites).
- **Ne jamais** modifier le chaincode sans incrémenter sa version (`--version` et `--sequence`).

## Conventions de code

- **Commits** : préfixés par `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- **Branches** : `main` (stable), `develop` (en cours), `feature/<nom>` (nouveautés)
- **JavaScript** : camelCase pour variables et fonctions, PascalCase pour composants React, UPPER_SNAKE_CASE pour constantes
- **Fichiers** : kebab-case pour les fichiers (sauf composants React en PascalCase)
- **Lint** : ESLint + Prettier configurés ; lancer `npm run lint` avant chaque commit
- **Tests** : Jest pour le backend, Playwright pour les tests end-to-end

## Variables d'environnement

Voir [.env.example](.env.example) pour la liste complète. Les principales :

```
NODE_ENV=development
API_PORT=3000
JWT_SECRET=<généré>
MASTER_KEY=<32 octets hex>
FABRIC_CONNECTION_PROFILE=./config/connection-org1.json
FABRIC_WALLET_PATH=./wallet
FABRIC_CHANNEL=backupchannel
FABRIC_CHAINCODE=backup-cc
IPFS_API_URL=http://localhost:5001
IPFS_CLUSTER_URL=http://localhost:9094
DATABASE_URL=postgresql://...
SMTP_HOST=...
```

## Documentation détaillée

| Fichier | Contenu |
|---------|---------|
| [docs/roadmap.md](docs/roadmap.md) | Liste des 17 phases avec leur état |
| [docs/phases/](docs/phases/) | Détails complets de chaque phase |
| [docs/architecture.md](docs/architecture.md) | Vision technique d'ensemble |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Solutions aux erreurs courantes |
| [docs/api-reference.md](docs/api-reference.md) | Référence des endpoints API |

## Code clé du projet

> Cette section sera enrichie au fil du développement.

- `chaincode/lib/backup-contract.js` — logique métier sur le ledger
- `backend/src/services/fabric.js` — wrapper Fabric SDK
- `backend/src/services/ipfs.js` — wrapper IPFS / IPFS Cluster
- `backend/src/services/ssh.js` — opérations SSH/SFTP distantes
- `backend/src/services/scheduler.js` — planificateur de sauvegardes
- `backend/src/services/node-deployer.js` — déploiement de nœuds distants
- `backend/src/services/crypto.js` — chiffrement AES-256, dérivation, hash

## Workflow recommandé pour Claude Code

1. **Lire** la phase en cours dans `docs/phases/phase-XX.md`
2. **Vérifier** les prérequis listés dans la phase
3. **Coder** strictement les éléments de la phase, sans déborder
4. **Tester** avec les commandes de validation fournies
5. **Mettre à jour** la section "État actuel" du présent fichier
6. **Commiter** avec un message clair selon les conventions

---

**Une étape à la fois. Validation systématique. Pas d'over-engineering.**