#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# SecureBackup-Chain — Setup Wizard
# Déploie un nœud complet (Org1, Org2 ou Org3) sur une nouvelle machine
# Usage : bash setup-wizard.sh [--node 1|2|3] [--org1-ip IP] [--org2-ip IP] [--org3-ip IP]
# ══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Couleurs ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }
info() { echo -e "${CYAN}→${NC} $*"; }
step() { echo -e "\n${BOLD}${BLUE}[$1]${NC} $2"; }

INSTALL_DIR="${INSTALL_DIR:-/opt/securebackup-chain}"

# ── Parsing des arguments ─────────────────────────────────────────────────────
NODE_NUM=""
ORG1_IP=""
ORG2_IP=""
ORG3_IP=""
MAIN_SERVER=""
SKIP_TRANSFER=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --node)     NODE_NUM="$2"; shift 2 ;;
    --org1-ip)  ORG1_IP="$2"; shift 2 ;;
    --org2-ip)  ORG2_IP="$2"; shift 2 ;;
    --org3-ip)  ORG3_IP="$2"; shift 2 ;;
    --main)     MAIN_SERVER="$2"; shift 2 ;;
    --skip-transfer) SKIP_TRANSFER=true; shift ;;
    *) shift ;;
  esac
done

# ── Banner ────────────────────────────────────────────────────────────────────
echo -e "${BOLD}"
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   SecureBackup-Chain — Setup Wizard v1.0    ║"
echo "  ║   Déploiement Hyperledger Fabric + IPFS     ║"
echo "  ╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# ── [1] Choix du nœud ─────────────────────────────────────────────────────────
step "1/7" "Sélection du nœud"

if [[ -z "$NODE_NUM" ]]; then
  echo "Quel nœud voulez-vous déployer sur cette machine ?"
  echo "  1) Nœud 1 — Org1 (orderer.org1 + peer0.org1 + ca.org1 + ipfs0)"
  echo "  2) Nœud 2 — Org2 (orderer.org2 + peer0.org2 + ca.org2 + ipfs1)"
  echo "  3) Nœud 3 — Org3 (orderer.org3 + peer0.org3 + ca.org3 + ipfs2)"
  read -rp "Votre choix [1/2/3] : " NODE_NUM
fi

case "$NODE_NUM" in
  1) ORG="Org1"; ORG_LOWER="org1"; COMPOSE_FILE="docker-compose-node1.yaml" ;;
  2) ORG="Org2"; ORG_LOWER="org2"; COMPOSE_FILE="docker-compose-node2.yaml" ;;
  3) ORG="Org3"; ORG_LOWER="org3"; COMPOSE_FILE="docker-compose-node3.yaml" ;;
  *) err "Choix invalide : $NODE_NUM"; exit 1 ;;
esac

ok "Nœud $NODE_NUM ($ORG) sélectionné"

# ── [2] Configuration réseau ──────────────────────────────────────────────────
step "2/7" "Configuration des adresses IP"

prompt_ip() {
  local var_name=$1; local label=$2; local current_val=${!var_name}
  if [[ -z "$current_val" ]]; then
    read -rp "$label : " current_val
  else
    echo "$label : $current_val (prédéfini)"
  fi
  eval "$var_name='$current_val'"
}

prompt_ip ORG1_IP "IP de la machine Nœud 1 (Org1)"
prompt_ip ORG2_IP "IP de la machine Nœud 2 (Org2)"
prompt_ip ORG3_IP "IP de la machine Nœud 3 (Org3)"

ok "IPs : Org1=$ORG1_IP  Org2=$ORG2_IP  Org3=$ORG3_IP"

# Déduire l'IP de ce nœud
case "$NODE_NUM" in
  1) THIS_IP="$ORG1_IP" ;;
  2) THIS_IP="$ORG2_IP" ;;
  3) THIS_IP="$ORG3_IP" ;;
esac

# ── [3] Prérequis ─────────────────────────────────────────────────────────────
step "3/7" "Vérification des prérequis"

MISSING=0

check_cmd() {
  if command -v "$1" &>/dev/null; then
    ok "$1 disponible ($(command -v "$1"))"
  else
    warn "$1 non trouvé"
    MISSING=$((MISSING + 1))
  fi
}

check_cmd docker
check_cmd git
check_cmd curl
check_cmd openssl

# Docker Compose (plugin v2)
if docker compose version &>/dev/null 2>&1; then
  ok "docker compose plugin disponible"
elif command -v docker-compose &>/dev/null; then
  ok "docker-compose disponible (v1 — v2 recommandé)"
else
  warn "docker compose non trouvé"
  MISSING=$((MISSING + 1))
fi

# Installer Docker si absent
if ! command -v docker &>/dev/null; then
  echo ""
  read -rp "Docker absent. Installer automatiquement ? [o/N] " INSTALL_DOCKER
  if [[ "${INSTALL_DOCKER,,}" == "o" ]]; then
    info "Installation de Docker via get.docker.com..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker 2>/dev/null || true
    usermod -aG docker "$USER" 2>/dev/null || true
    ok "Docker installé"
    MISSING=$((MISSING - 1))
  else
    err "Docker requis. Installez-le manuellement : https://docs.docker.com/engine/install/"
    exit 1
  fi
fi

if [[ $MISSING -gt 0 ]]; then
  warn "$MISSING prérequis manquants. Certains sont optionnels."
fi

# ── [4] Vérification ports ────────────────────────────────────────────────────
step "4/7" "Vérification des ports"

declare -A NODE_PORTS
NODE_PORTS[1]="7050 7051 7054 5001 4001 8080"
NODE_PORTS[2]="8050 8051 8054 5002 4002 8081"
NODE_PORTS[3]="9050 9051 9054 5003 4003 8082"

PORTS="${NODE_PORTS[$NODE_NUM]}"
PORT_ISSUES=0

for PORT in $PORTS; do
  if ss -tlnp 2>/dev/null | grep -q ":$PORT " || netstat -tlnp 2>/dev/null | grep -q ":$PORT "; then
    warn "Port $PORT déjà utilisé"
    PORT_ISSUES=$((PORT_ISSUES + 1))
  else
    ok "Port $PORT libre"
  fi
done

if [[ $PORT_ISSUES -gt 0 ]]; then
  warn "$PORT_ISSUES ports occupés. Les conteneurs pourraient échouer au démarrage."
fi

# ── [5] Transfert des fichiers ────────────────────────────────────────────────
step "5/7" "Transfert des fichiers du réseau"

if [[ "$SKIP_TRANSFER" == "true" ]]; then
  info "Transfert ignoré (--skip-transfer)"
elif [[ -d "$INSTALL_DIR/network/crypto-config" ]]; then
  ok "Fichiers réseau déjà présents dans $INSTALL_DIR"
else
  echo "Les fichiers de configuration réseau (crypto-config, channel-artifacts) doivent"
  echo "être copiés depuis la machine Nœud 1 (IP: $ORG1_IP)."
  echo ""
  echo "Option A — Copie automatique via SSH :"
  read -rp "  Utilisateur SSH sur $ORG1_IP : " SSH_USER
  if [[ -n "$SSH_USER" ]]; then
    read -rp "  Chemin du projet sur $ORG1_IP [/opt/securebackup-chain] : " REMOTE_PATH
    REMOTE_PATH="${REMOTE_PATH:-/opt/securebackup-chain}"

    mkdir -p "$INSTALL_DIR/network"
    info "Copie crypto-config..."
    scp -r "${SSH_USER}@${ORG1_IP}:${REMOTE_PATH}/network/crypto-config" "$INSTALL_DIR/network/"
    info "Copie channel-artifacts..."
    scp -r "${SSH_USER}@${ORG1_IP}:${REMOTE_PATH}/network/channel-artifacts" "$INSTALL_DIR/network/"
    info "Copie chaincode..."
    scp -r "${SSH_USER}@${ORG1_IP}:${REMOTE_PATH}/chaincode" "$INSTALL_DIR/"
    ok "Fichiers transférés"
  else
    warn "Aucun utilisateur SSH fourni."
    echo ""
    echo "Option B — Commande rsync à exécuter DEPUIS $ORG1_IP :"
    echo -e "${CYAN}  rsync -avz /opt/securebackup-chain/network/crypto-config \\"
    echo "         /opt/securebackup-chain/network/channel-artifacts \\"
    echo "         /opt/securebackup-chain/chaincode \\"
    echo "         USER@${THIS_IP}:${INSTALL_DIR}/network/${NC}"
    echo ""
    read -rp "Appuyez sur Entrée une fois les fichiers copiés..."
  fi
fi

# Vérifier que les fichiers nécessaires sont présents
CRYPTO_DIR="${INSTALL_DIR}/network/crypto-config"
ARTIFACTS_DIR="${INSTALL_DIR}/network/channel-artifacts"

if [[ ! -d "$CRYPTO_DIR/ordererOrganizations/${ORG_LOWER}.example.com" ]]; then
  warn "crypto-config/${ORG_LOWER} introuvable dans $CRYPTO_DIR"
  warn "Assurez-vous que les certificats sont bien copiés."
fi

if [[ ! -f "$ARTIFACTS_DIR/genesis.block" ]]; then
  warn "genesis.block introuvable dans $ARTIFACTS_DIR"
fi

# ── [6] Création du .env ─────────────────────────────────────────────────────
step "6/7" "Génération de la configuration"

mkdir -p "$INSTALL_DIR/network"
cat > "$INSTALL_DIR/network/.env" << EOF
# SecureBackup-Chain — Nœud $NODE_NUM ($ORG) — généré par setup-wizard.sh
ORG1_IP=$ORG1_IP
ORG2_IP=$ORG2_IP
ORG3_IP=$ORG3_IP
NODE_NUM=$NODE_NUM
CHAINCODE_ID=${CHAINCODE_ID:-backup-cc_1.0:placeholder}
EOF

ok ".env créé dans $INSTALL_DIR/network/.env"

# Copier le docker-compose du nœud
if [[ -f "$INSTALL_DIR/network/$COMPOSE_FILE" ]]; then
  ok "$COMPOSE_FILE déjà présent"
else
  warn "$COMPOSE_FILE introuvable dans $INSTALL_DIR/network/"
  echo "Copiez manuellement : network/$COMPOSE_FILE → $INSTALL_DIR/network/"
fi

# ── [7] Démarrage des services ────────────────────────────────────────────────
step "7/7" "Démarrage des conteneurs"

cd "$INSTALL_DIR/network" 2>/dev/null || { err "Répertoire $INSTALL_DIR/network introuvable"; exit 1; }

if [[ ! -f "$COMPOSE_FILE" ]]; then
  err "Fichier $COMPOSE_FILE introuvable dans $(pwd)"
  echo "Copiez-y ce fichier depuis le projet principal et relancez."
  exit 1
fi

info "Récupération des images Docker (peut prendre quelques minutes)..."
docker compose -f "$COMPOSE_FILE" --env-file .env pull 2>&1 | grep -E "Pulling|Pull complete|Already exists|Error" || true

info "Démarrage des services..."
docker compose -f "$COMPOSE_FILE" --env-file .env up -d

echo ""
info "Attente de 10s pour l'initialisation..."
sleep 10

# Vérification
echo ""
echo -e "${BOLD}État des conteneurs :${NC}"
docker compose -f "$COMPOSE_FILE" --env-file .env ps

# Rapport de connectivité
echo ""
echo -e "${BOLD}Test de connectivité vers les autres nœuds :${NC}"

test_port() {
  local HOST=$1; local PORT=$2; local LABEL=$3
  if timeout 3 bash -c "echo >/dev/tcp/$HOST/$PORT" 2>/dev/null; then
    ok "$LABEL ($HOST:$PORT)"
  else
    warn "$LABEL ($HOST:$PORT) — inaccessible"
  fi
}

case "$NODE_NUM" in
  1)
    test_port "$ORG2_IP" 8050 "Orderer Org2"
    test_port "$ORG2_IP" 8051 "Peer Org2"
    test_port "$ORG3_IP" 9050 "Orderer Org3"
    test_port "$ORG3_IP" 9051 "Peer Org3"
    ;;
  2)
    test_port "$ORG1_IP" 7050 "Orderer Org1"
    test_port "$ORG1_IP" 7051 "Peer Org1"
    test_port "$ORG3_IP" 9050 "Orderer Org3"
    test_port "$ORG3_IP" 9051 "Peer Org3"
    ;;
  3)
    test_port "$ORG1_IP" 7050 "Orderer Org1"
    test_port "$ORG1_IP" 7051 "Peer Org1"
    test_port "$ORG2_IP" 8050 "Orderer Org2"
    test_port "$ORG2_IP" 8051 "Peer Org2"
    ;;
esac

# ── Résumé final ─────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════${NC}"
echo -e "${BOLD}${GREEN}  Nœud $NODE_NUM ($ORG) démarré avec succès !${NC}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}Prochaines étapes :${NC}"
echo "  1. Rejoindre le channel (depuis Nœud 1) :"
echo -e "     ${CYAN}./scripts/join-channel.sh${NC}"
echo "  2. Vérifier la connexion Raft :"
echo -e "     ${CYAN}docker logs orderer.${ORG_LOWER}.example.com 2>&1 | grep -E 'leader|raft'${NC}"
echo "  3. Surveiller la topologie depuis le dashboard admin"
echo ""
echo -e "Logs en temps réel : ${CYAN}docker compose -f $COMPOSE_FILE logs -f${NC}"
