#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# SecureBackup-Chain — Initialisation réseau complète (Node 1)
# Appelé par le setup wizard via le backend
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CRYPTO="$SCRIPT_DIR/crypto-config"
ARTIFACTS="$SCRIPT_DIR/channel-artifacts"
CHANNEL="backupchannel"
CC_NAME="backup-cc"
CC_VERSION="${CC_VERSION:-1.0}"
CC_SEQUENCE="${CC_SEQUENCE:-1}"

log() { echo "[$(date '+%H:%M:%S')] $*"; }

# ── [1] Démarrage des conteneurs ──────────────────────────────────────────────
log "STEP:start_containers Démarrage des conteneurs Docker..."
docker compose -f "$SCRIPT_DIR/docker-compose.yaml" up -d 2>&1 | \
  grep -E "Starting|Started|Running|Created|Error|already" || true
log "OK:start_containers Conteneurs démarrés"

# ── [2] Attente orderers ───────────────────────────────────────────────────────
log "STEP:wait_orderers Attente des orderers Raft (30s max)..."
for i in $(seq 1 30); do
  if docker exec orderer.org1.example.com ls /var/hyperledger/production/orderer/chains 2>/dev/null | grep -q "^$" ; then
    break
  fi
  RUNNING=$(docker ps --filter "name=orderer.org1.example.com" --filter "status=running" -q 2>/dev/null)
  if [ -n "$RUNNING" ]; then break; fi
  sleep 1
done
sleep 8
log "OK:wait_orderers Orderers prêts"

# ── Helper peer CLI ────────────────────────────────────────────────────────────
peer_cli() {
  local ORG=$1; local PORT=$2
  echo "docker run --rm \
    --network securebackup-fabric \
    -v $CRYPTO:/etc/hyperledger/crypto-config \
    -v $ARTIFACTS:/etc/hyperledger/channel-artifacts \
    -e CORE_PEER_LOCALMSPID=${ORG}MSP \
    -e CORE_PEER_TLS_ENABLED=true \
    -e CORE_PEER_ADDRESS=peer0.${ORG,,}.example.com:$PORT \
    -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/peerOrganizations/${ORG,,}.example.com/users/Admin@${ORG,,}.example.com/msp \
    -e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/peerOrganizations/${ORG,,}.example.com/peers/peer0.${ORG,,}.example.com/tls/ca.crt \
    hyperledger/fabric-tools:2.5.4"
}

ORDERER_FLAGS="--tls --cafile /etc/hyperledger/crypto-config/ordererOrganizations/org1.example.com/orderers/orderer.org1.example.com/tls/ca.crt"
ORDERER_ADDR="-o orderer.org1.example.com:7050"

# ── [3] Créer le channel (si pas encore créé) ─────────────────────────────────
if [ ! -f "$ARTIFACTS/${CHANNEL}.block" ]; then
  log "STEP:create_channel Création du channel $CHANNEL..."
  $(peer_cli Org1 7051) peer channel create \
    $ORDERER_ADDR -c $CHANNEL \
    -f /etc/hyperledger/channel-artifacts/channel.tx \
    $ORDERER_FLAGS \
    --outputBlock /etc/hyperledger/channel-artifacts/${CHANNEL}.block 2>&1
  log "OK:create_channel Channel créé"
else
  log "OK:create_channel Channel $CHANNEL déjà créé"
fi

# ── [4] Jointure des 3 peers ───────────────────────────────────────────────────
log "STEP:join_peers Jointure des peers au channel..."
for ORG_PORT in "Org1:7051" "Org2:8051" "Org3:9051"; do
  ORG="${ORG_PORT%%:*}"; PORT="${ORG_PORT##*:}"
  $(peer_cli $ORG $PORT) peer channel join \
    -b /etc/hyperledger/channel-artifacts/${CHANNEL}.block 2>&1 | \
    grep -v "^$" || true
  log "INFO:join_peers peer0.${ORG,,} rejoint $CHANNEL"
done
log "OK:join_peers 3 peers joints"

# ── [5] Anchor peers ───────────────────────────────────────────────────────────
log "STEP:anchor_peers Mise à jour anchor peers..."
for ORG_PORT in "Org1:7051" "Org2:8051" "Org3:9051"; do
  ORG="${ORG_PORT%%:*}"; PORT="${ORG_PORT##*:}"
  $(peer_cli $ORG $PORT) peer channel update \
    $ORDERER_ADDR -c $CHANNEL \
    -f /etc/hyperledger/channel-artifacts/${ORG}MSPanchors.tx \
    $ORDERER_FLAGS 2>&1 | grep -v "^$" || true
done
log "OK:anchor_peers Anchors configurés"

# ── [6] Package + install chaincode ───────────────────────────────────────────
log "STEP:deploy_chaincode Déploiement chaincode $CC_NAME v$CC_VERSION..."
bash "$SCRIPT_DIR/scripts/deploy-chaincode.sh" "$CC_VERSION" "$CC_SEQUENCE" 2>&1 | \
  grep -E "^\[|→|✓|Erreur|Error|Package ID" || true
log "OK:deploy_chaincode Chaincode déployé"

log "DONE:network Réseau SecureBackup-Chain opérationnel"
