#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  SecureBackup-Chain — Installateur automatique
#  Usage : sudo ./install.sh
#          ./install.sh --non-interactive (valeurs par défaut + variables env)
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NON_INTERACTIVE=false
[[ "${1:-}" == "--non-interactive" ]] && NON_INTERACTIVE=true

# ── Bannière ─────────────────────────────────────────────────────────────────
clear
echo -e "${CYAN}"
cat <<'BANNER'
  ____                          ____             _
 / ___|  ___  ___ _   _ _ __ __|  _ \  __ _  ___| | ___   _ _ __
 \___ \ / _ \/ __| | | | '__/ _ \ |_) |/ _` |/ __| |/ / | | | '_ \
  ___) |  __/ (__| |_| | | |  __/  _ <| (_| | (__|   <| |_| | |_) |
 |____/ \___|\___|\__,_|_|  \___|_| \_\\__,_|\___|_|\_\\__,_| .__/
   ____  _           _                                        |_|
  / ___|| |__   __ _(_)_ __
  \___ \| '_ \ / _` | | '_ \
   ___) | | | | (_| | | | | |
  |____/|_| |_|\__,_|_|_| |_|

BANNER
echo -e "${NC}"
echo -e "${BOLD}  Système de sauvegarde décentralisée sur Hyperledger Fabric${NC}"
echo -e "  ──────────────────────────────────────────────────────────"
echo ""

log()    { echo -e "  ${GREEN}✓${NC}  $*"; }
warn()   { echo -e "  ${YELLOW}⚠${NC}  $*"; }
info()   { echo -e "  ${CYAN}→${NC}  $*"; }
error()  { echo -e "  ${RED}✗${NC}  $*" >&2; }
step()   { echo -e "\n${BOLD}  [$1] $2${NC}"; }
abort()  { error "$*"; exit 1; }

# ── [0] Vérification des prérequis ──────────────────────────────────────────
step "0/7" "Vérification des prérequis"

command -v docker >/dev/null 2>&1 || abort "Docker n'est pas installé. Installez-le depuis https://docs.docker.com/engine/install/"

DOCKER_VERSION=$(docker --version | grep -oP '\d+\.\d+' | head -1)
info "Docker $DOCKER_VERSION détecté"

if ! docker compose version >/dev/null 2>&1; then
  abort "Docker Compose v2 requis. Mettez à jour Docker ou installez le plugin : https://docs.docker.com/compose/install/"
fi
COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "2.x")
info "Docker Compose $COMPOSE_VERSION détecté"

command -v openssl >/dev/null 2>&1 || abort "openssl requis (apt install openssl / brew install openssl)"
command -v curl    >/dev/null 2>&1 || abort "curl requis"

# Vérification que Docker fonctionne
docker info >/dev/null 2>&1 || abort "Docker ne répond pas. Démarrez le service Docker (sudo systemctl start docker)"

log "Prérequis OK"

# ── [1] Configuration interactive ───────────────────────────────────────────
step "1/7" "Configuration"

if $NON_INTERACTIVE; then
  ORG_NAME="${SBC_ORG:-MonOrganisation}"
  ADMIN_EMAIL="${SBC_ADMIN_EMAIL:-admin@securebackup.local}"
  ADMIN_PASSWORD="${SBC_ADMIN_PASSWORD:-$(openssl rand -base64 16)}"
  HTTP_PORT="${SBC_PORT:-80}"
  DB_PASSWORD="${SBC_DB_PASSWORD:-$(openssl rand -base64 24)}"
else
  echo ""
  read -rp "  Nom de votre organisation [MonOrganisation] : " ORG_NAME
  ORG_NAME="${ORG_NAME:-MonOrganisation}"

  read -rp "  Email administrateur [admin@securebackup.local] : " ADMIN_EMAIL
  ADMIN_EMAIL="${ADMIN_EMAIL:-admin@securebackup.local}"

  while true; do
    read -rsp "  Mot de passe administrateur (8 car. min) : " ADMIN_PASSWORD
    echo ""
    [[ ${#ADMIN_PASSWORD} -ge 8 ]] && break
    warn "Le mot de passe doit contenir au moins 8 caractères"
  done

  read -rp "  Port HTTP [80] : " HTTP_PORT
  HTTP_PORT="${HTTP_PORT:-80}"

  DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
fi

log "Organisation : $ORG_NAME"
log "Admin : $ADMIN_EMAIL"
log "Port : $HTTP_PORT"

# ── [2] Génération des secrets ───────────────────────────────────────────────
step "2/7" "Génération des clés de sécurité"

JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
MASTER_KEY=$(openssl rand -hex 32)
CLUSTER_SECRET=$(openssl rand -hex 32)

# Écriture du fichier .env
cat > "$SCRIPT_DIR/.env" <<EOF
# ── SecureBackup-Chain — Généré automatiquement par install.sh ──────────────
# NE PAS MODIFIER MANUELLEMENT sauf si vous savez ce que vous faites.
# CONSERVER CE FICHIER EN LIEU SÛR — perte = données irrécupérables.

HTTP_PORT=${HTTP_PORT}
DB_USER=securebackup
DB_PASSWORD=${DB_PASSWORD}
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
MASTER_KEY=${MASTER_KEY}
CLUSTER_SECRET=${CLUSTER_SECRET}

# CHAINCODE_ID sera mis à jour automatiquement après le déploiement
CHAINCODE_ID=backup-cc_1.0:PENDING

# Email (optionnel — pour les notifications)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@securebackup.local

# Méta
INSTALLED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
ORG_NAME=${ORG_NAME}
ADMIN_EMAIL=${ADMIN_EMAIL}
EOF

log ".env créé avec les secrets générés"

# ── [3] Initialisation du réseau Fabric ─────────────────────────────────────
step "3/7" "Génération des certificats et de la blockchain"
info "Cette étape prend 1-2 minutes..."

NETWORK_DIR="$SCRIPT_DIR/network"
CRYPTO_DIR="$NETWORK_DIR/crypto-config"
ARTIFACTS_DIR="$NETWORK_DIR/channel-artifacts"
mkdir -p "$ARTIFACTS_DIR"

# Utilise l'image fabric-tools — aucun binaire local requis
FABRIC_TOOLS="docker run --rm \
  -v $NETWORK_DIR:/network \
  -e FABRIC_CFG_PATH=/network \
  hyperledger/fabric-tools:2.5.4"

# 3a. Génération des certificats (si absents)
if [ ! -d "$CRYPTO_DIR/peerOrganizations/org1.example.com" ]; then
  info "Génération des certificats Org1..."
  $FABRIC_TOOLS cryptogen generate \
    --config=/network/crypto-config-node1.yaml \
    --output=/network/crypto-config 2>&1 | grep -v "^$" | sed 's/^/     /'
  log "Certificats générés"
else
  log "Certificats déjà présents"
fi

# 3b. Genesis block
if [ ! -f "$ARTIFACTS_DIR/genesis.block" ]; then
  info "Génération du genesis block..."
  $FABRIC_TOOLS configtxgen \
    -profile Org1Genesis \
    -channelID system-channel \
    -outputBlock /network/channel-artifacts/genesis.block 2>&1 | grep -v "^$" | grep -v "^\[" | sed 's/^/     /' || true
  log "Genesis block généré"
else
  log "Genesis block déjà présent"
fi

# 3c. Channel transaction
if [ ! -f "$ARTIFACTS_DIR/channel.tx" ]; then
  info "Génération du channel.tx..."
  $FABRIC_TOOLS configtxgen \
    -profile Org1Channel \
    -channelID backupchannel \
    -outputCreateChannelTx /network/channel-artifacts/channel.tx 2>&1 | grep -v "^$" | grep -v "^\[" | sed 's/^/     /' || true
  $FABRIC_TOOLS configtxgen \
    -profile Org1Channel \
    -channelID backupchannel \
    -outputAnchorPeersUpdate /network/channel-artifacts/Org1MSPanchors.tx \
    -asOrg Org1MSP 2>&1 | grep -v "^$" | grep -v "^\[" | sed 's/^/     /' || true
  log "Channel artifacts générés"
else
  log "Channel artifacts déjà présents"
fi

# ── [4] Démarrage des services ───────────────────────────────────────────────
step "4/7" "Démarrage des services"
info "Construction et démarrage des conteneurs (2-5 min à la première installation)..."

cd "$SCRIPT_DIR"

# S'assurer que initialized.json existe (vide = non initialisé)
mkdir -p "$SCRIPT_DIR/backend/config"
touch "$SCRIPT_DIR/backend/config/initialized.json"

docker compose pull --ignore-pull-failures 2>&1 | sed 's/^/     /' || true

info "Construction des images Docker..."
if ! docker compose build 2>&1 | sed 's/^/     /'; then
  error "La construction des images a échoué — voir les erreurs ci-dessus"
  exit 1
fi

info "Démarrage des conteneurs..."
docker compose up -d --remove-orphans 2>&1 | sed 's/^/     /' || true

log "Conteneurs démarrés"

# ── [5] Attente de la disponibilité ─────────────────────────────────────────
step "5/7" "Attente de la disponibilité des services"
info "Patientez pendant le démarrage de la blockchain (30-60 secondes)..."

MAX_WAIT=120
ELAPSED=0
API_BASE="http://localhost:${HTTP_PORT:-80}/api"

while [ $ELAPSED -lt $MAX_WAIT ]; do
  STATUS=$(curl -s "$API_BASE/health" 2>/dev/null || echo "")
  if echo "$STATUS" | grep -q '"fabric":"ok"'; then
    break
  fi
  printf "\r  ${CYAN}→${NC}  Démarrage en cours... ${ELAPSED}s"
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done
echo ""

if ! echo "$STATUS" | grep -q '"fabric":"ok"'; then
  warn "La blockchain n'est pas encore prête — poursuite de l'installation..."
  warn "Relancez 'make init-network' si la connexion échoue après le premier login"
fi

# ── [6] Création du canal et déploiement du chaincode ───────────────────────
step "6/7" "Initialisation du réseau Fabric"
info "Création du canal et déploiement du contrat intelligent..."

BACKEND_READY=false
for i in $(seq 1 30); do
  if curl -s "$API_BASE/health" >/dev/null 2>&1; then
    BACKEND_READY=true
    break
  fi
  sleep 2
done

if $BACKEND_READY; then
  # Créer le compte admin (POST /api/setup/initialize via nginx)
  INIT_RESPONSE=$(curl -s -X POST "$API_BASE/setup/initialize" \
    -H "Content-Type: application/json" \
    -d "{
      \"organization\": {\"name\": \"$ORG_NAME\", \"domain\": \"securebackup.local\"},
      \"server\": {\"host\": \"localhost\", \"port\": ${HTTP_PORT:-80}},
      \"admin\": {\"email\": \"$ADMIN_EMAIL\", \"password\": \"$ADMIN_PASSWORD\"}
    }" 2>/dev/null)

  if echo "$INIT_RESPONSE" | grep -q '"initialized":true'; then
    log "Compte administrateur créé"
  elif echo "$INIT_RESPONSE" | grep -q "déjà initialisé"; then
    log "Système déjà initialisé — compte admin préservé"
  else
    warn "Initialisation via API: $INIT_RESPONSE"
    warn "Vous pourrez créer votre compte via l'interface web"
  fi

  # Lancer init-network via le backend SSE (si pas encore fait)
  STATUS_HEALTH=$(curl -s "$API_BASE/health" 2>/dev/null || echo "")
  if ! echo "$STATUS_HEALTH" | grep -q '"fabric":"ok"'; then
    info "Lancement de l'initialisation Fabric (cela prend 2-3 minutes)..."
    LOGIN_RESP=$(curl -s -X POST "$API_BASE/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" 2>/dev/null)
    TOKEN=$(echo "$LOGIN_RESP" | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

    if [ -n "$TOKEN" ]; then
      curl -s -N "$API_BASE/deployment/init-network/stream" \
        -H "Authorization: Bearer $TOKEN" \
        --max-time 300 2>/dev/null | \
        grep -E "STEP:|OK:|DONE:|ERROR:" | sed 's/^data://; s/^/     /' &
      CURL_PID=$!
      wait $CURL_PID 2>/dev/null || true
    fi
  fi
fi

log "Initialisation Fabric terminée"

# ── [7] Récapitulatif ────────────────────────────────────────────────────────
step "7/7" "Installation terminée"

echo ""
echo -e "  ${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "  ${GREEN}║         SecureBackup-Chain est opérationnel !            ║${NC}"
echo -e "  ${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Accès :${NC}        http://localhost:${HTTP_PORT}"
echo -e "  ${BOLD}Login :${NC}        $ADMIN_EMAIL"
echo -e "  ${BOLD}Mot de passe :${NC} $ADMIN_PASSWORD"
echo ""
echo -e "  ${YELLOW}⚠  Conservez ces identifiants — ils ne seront plus affichés.${NC}"
echo -e "  ${YELLOW}⚠  Sauvegardez le fichier .env — il contient la clé MASTER_KEY.${NC}"
echo ""
echo -e "  ${BOLD}Commandes utiles :${NC}"
echo -e "    make start    — Démarrer les services"
echo -e "    make stop     — Arrêter les services"
echo -e "    make logs     — Voir les logs en temps réel"
echo -e "    make backup   — Exporter la configuration"
echo -e "    make status   — État des services"
echo ""
