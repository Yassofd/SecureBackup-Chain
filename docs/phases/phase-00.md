# Phase 0 — Préparation de l'environnement

**Objectif** : Disposer d'une machine de développement opérationnelle avec tous les outils nécessaires.

**Durée estimée** : 30 minutes

**Prérequis** : Système Linux (Ubuntu 22.04+ recommandé), macOS ou Windows avec WSL2.

---

## Étapes

### 1. Installer Docker Engine et Docker Compose

**Sur Ubuntu** :
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $USER
newgrp docker
```

### 2. Installer Node.js 18 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 3. Installer les outils complémentaires

```bash
sudo apt-get install -y git curl jq openssl build-essential
```

### 4. Vérifier les installations

```bash
docker --version          # Doit afficher 24.x ou +
docker compose version    # Doit afficher 2.x ou +
node --version            # Doit afficher v18.x ou +
npm --version             # Doit afficher 9.x ou +
git --version
```

### 5. Créer la structure du projet

```bash
mkdir securebackup-chain && cd securebackup-chain
git init

mkdir -p chaincode/lib
mkdir -p network/scripts
mkdir -p backend/src/{routes,services,middleware,models,utils} backend/config
mkdir -p frontend/src/{components,pages,services,hooks,context}
mkdir -p ipfs
mkdir -p scripts
mkdir -p docs/phases
```

### 6. Créer le `.gitignore` racine

```bash
cat > .gitignore <<'EOF'
# Dépendances
node_modules/
**/node_modules/

# Variables d'environnement
.env
.env.local
.env.*.local
**/.env
!.env.example

# Volumes Docker et données
volumes/
**/volumes/
data/

# Certificats Fabric (NE JAMAIS COMMITER)
crypto-config/
**/crypto-config/
wallet/
**/wallet/
channel-artifacts/
*.pb
*.block
genesis.block

# Builds et caches
dist/
build/
.cache/
.vite/

# Logs
*.log
logs/
npm-debug.log*

# IDE et OS
.DS_Store
.vscode/
.idea/
*.swp
EOF
```

### 7. Créer le `.env.example` racine

```bash
cat > .env.example <<'EOF'
# Environnement
NODE_ENV=development

# API Backend
API_PORT=3000
JWT_SECRET=changeme-generate-with-openssl-rand-hex-32
JWT_REFRESH_SECRET=changeme-different-secret
MASTER_KEY=changeme-32-bytes-hex-openssl-rand-hex-32

# Fabric
FABRIC_CONNECTION_PROFILE=./config/connection-org1.json
FABRIC_WALLET_PATH=./wallet
FABRIC_CHANNEL=backupchannel
FABRIC_CHAINCODE=backup-cc
FABRIC_ORG_MSP=Org1MSP
FABRIC_ADMIN_USER=admin
FABRIC_ADMIN_PASSWORD=adminpw

# IPFS
IPFS_API_URL=http://localhost:5001
IPFS_GATEWAY_URL=http://localhost:8080
IPFS_CLUSTER_URL=http://localhost:9094

# Base applicative
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/securebackup

# Email (notifications)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@example.com
EOF
```

### 8. Premier commit

```bash
git add .gitignore .env.example
git commit -m "chore: structure initiale du projet"
```

---

## Validation

Tous les points suivants doivent être vrais :

- [ ] `docker run --rm hello-world` fonctionne sans `sudo`
- [ ] `node --version` retourne `v18.x` ou supérieur
- [ ] `npm --version` retourne `9.x` ou supérieur
- [ ] La structure de dossiers est créée
- [ ] `.gitignore` et `.env.example` sont commités
- [ ] `git status` n'affiche rien d'anormal

---

## Erreurs courantes

### "permission denied" sur Docker

Après avoir ajouté l'utilisateur au groupe `docker`, il faut ouvrir une nouvelle session ou exécuter `newgrp docker`.

### Node.js déjà installé en version ancienne

Désinstaller l'ancienne version :
```bash
sudo apt-get remove nodejs npm
sudo apt-get autoremove
```
Puis suivre l'étape 2.

---

## Action de fin de phase

1. Cocher la case dans [docs/roadmap.md](../roadmap.md)
2. Mettre à jour la section "État actuel" dans [CLAUDE.md](../../CLAUDE.md)
3. Passer à la [Phase 1](phase-01.md)