#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
#  SecureBackup-Chain — Script de nettoyage complet
#  Usage : ./clean.sh
#          ./clean.sh --force   (pas de confirmation)
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FORCE=false
[[ "${1:-}" == "--force" ]] && FORCE=true

log()  { echo -e "${GREEN}  ✔ $*${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $*${NC}"; }
info() { echo -e "${CYAN}  → $*${NC}"; }
err()  { echo -e "${RED}  ✖ $*${NC}"; }

echo -e "${RED}${BOLD}"
cat <<'BANNER'
  ____  _     _____    _    _   _
 / ___|| |   | ____|  / \  | \ | |
| |    | |   |  _|   / _ \ |  \| |
| |___ | |___| |___ / ___ \| |\  |
 \____||_____|_____/_/   \_\_| \_|

 SecureBackup-Chain — Nettoyage complet
BANNER
echo -e "${NC}"

if [ "$FORCE" = false ]; then
  echo -e "${RED}${BOLD}⚠  ATTENTION : cette opération est IRRÉVERSIBLE.${NC}"
  echo ""
  echo "  Seront supprimés :"
  echo "   • Tous les conteneurs Docker du projet"
  echo "   • Tous les volumes Docker (données DB, IPFS, Fabric, wallet)"
  echo "   • network/crypto-config/     (certificats Fabric)"
  echo "   • network/channel-artifacts/ (bloc genesis + channel block)"
  echo "   • network/fabric-samples/    (binaires cryptogen/configtxgen)"
  echo "   • backend/wallet/            (identités SDK Fabric)"
  echo "   • backend/config/initialized.json"
  echo "   • backend/logs/"
  echo "   • snapshots/"
  echo ""
  read -rp "  Confirmer ? [oui/N] : " CONFIRM
  if [[ "$CONFIRM" != "oui" ]]; then
    echo "Annulé."
    exit 0
  fi
  echo ""
fi

# ── 1. Arrêt des nœuds supplémentaires (org2, org3, …) ─────────────────────
info "Arrêt des nœuds additionnels (org2, org3, …)..."
for _n in 2 3 4 5; do
  _cf="$SCRIPT_DIR/network/docker-compose-node${_n}.yaml"
  _ef="$SCRIPT_DIR/network/.env.node${_n}"
  if [ -f "$_cf" ]; then
    docker compose -f "$_cf" $( [ -f "$_ef" ] && echo "--env-file $_ef" ) \
      down -v --remove-orphans 2>&1 \
      | grep -E "^( Container| Volume)" | sed 's/^/     /' || true
    rm -f "$_cf" "$_ef"
    log "Node${_n} arrêté et compose supprimé"
  fi
done

# ── 2. Arrêt des conteneurs + suppression des volumes ────────────────────────
info "Arrêt des conteneurs principaux et suppression des volumes Docker..."
if [ -f "$SCRIPT_DIR/docker-compose.yml" ]; then
  docker compose -f "$SCRIPT_DIR/docker-compose.yml" down -v --remove-orphans 2>&1 \
    | grep -E "^( Container| Volume| Network)" | sed 's/^/     /' || true
  log "Conteneurs et volumes supprimés"
else
  warn "docker-compose.yml introuvable — ignoré"
fi

# ── 3. Conteneurs résiduels liés au projet ───────────────────────────────────
info "Suppression des conteneurs résiduels (backup-cc, fabric-tools, org*)..."
RESIDUAL=$(docker ps -a --format "{{.Names}}" 2>/dev/null \
  | grep -E "securebackup|backup-cc|peer0\.|orderer\.|couchdb[0-9]|ipfs[0-9]|cluster[0-9]|ca\." || true)
if [ -n "$RESIDUAL" ]; then
  echo "$RESIDUAL" | xargs docker rm -f 2>/dev/null || true
  log "Conteneurs résiduels supprimés"
else
  log "Aucun conteneur résiduel"
fi

# ── 4. Artefacts générés ─────────────────────────────────────────────────────
info "Suppression des artefacts générés..."

TARGETS=(
  "$SCRIPT_DIR/network/crypto-config"
  "$SCRIPT_DIR/network/channel-artifacts"
  "$SCRIPT_DIR/network/fabric-samples"
  "$SCRIPT_DIR/network/.env.node1"
  "$SCRIPT_DIR/backend/wallet"
  "$SCRIPT_DIR/backend/config/initialized.json"
  "$SCRIPT_DIR/backend/logs"
  "$SCRIPT_DIR/snapshots"
)

for TARGET in "${TARGETS[@]}"; do
  if [ -e "$TARGET" ]; then
    sudo rm -rf "$TARGET" && log "Supprimé : ${TARGET#$SCRIPT_DIR/}"
  fi
done

# ── 5. Vérification finale ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  Nettoyage terminé.${NC}"
echo ""
echo "  État :"
REMAINING_CONTAINERS=$(docker ps -a --format "{{.Names}}" 2>/dev/null \
  | grep -E "securebackup|backup-cc|peer0|orderer|couchdb|ipfs|cluster" || true)
if [ -z "$REMAINING_CONTAINERS" ]; then
  log "Aucun conteneur du projet en cours"
else
  warn "Conteneurs encore présents : $REMAINING_CONTAINERS"
fi

REMAINING_VOLUMES=$(docker volume ls --format "{{.Name}}" 2>/dev/null \
  | grep "securebackup" || true)
if [ -z "$REMAINING_VOLUMES" ]; then
  log "Aucun volume Docker du projet"
else
  warn "Volumes encore présents : $REMAINING_VOLUMES"
fi

echo ""
echo -e "  Lance ${BOLD}./install.sh${NC} pour réinstaller depuis zéro."
echo ""
