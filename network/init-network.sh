#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# SecureBackup-Chain — Bootstrap Nœud 1 (Org1 uniquement)
# Auto-génère crypto + artifacts si absents, puis démarre Org1.
# Appelé par le setup wizard via le backend SSE.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN="$SCRIPT_DIR/fabric-samples/bin"
CRYPTO="$SCRIPT_DIR/crypto-config"
ARTIFACTS="$SCRIPT_DIR/channel-artifacts"
CHANNEL="backupchannel"
CC_NAME="backup-cc"
CC_VERSION="${CC_VERSION:-1.0}"
CC_SEQUENCE="${CC_SEQUENCE:-1}"
COMPOSE="$SCRIPT_DIR/docker-compose-node1.yaml"
ENV_FILE="$SCRIPT_DIR/.env.node1"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
step() { log "STEP:$1 $2"; }
ok()   { log "OK:$1 $2"; }

# ── [0] Vérifications préalables ──────────────────────────────────────────────
step "prereqs" "Vérification des prérequis..."
command -v docker >/dev/null 2>&1 || { log "ERROR:prereqs Docker non installé"; exit 1; }
[ -x "$BIN/cryptogen" ]    || { log "ERROR:prereqs cryptogen introuvable dans $BIN"; exit 1; }
[ -x "$BIN/configtxgen" ]  || { log "ERROR:prereqs configtxgen introuvable dans $BIN"; exit 1; }
ok "prereqs" "Docker et binaires Fabric OK"

# ── [1] Génération crypto Org1 (si absente) ───────────────────────────────────
step "crypto" "Génération des certificats Org1..."
if [ ! -d "$CRYPTO/peerOrganizations/org1.example.com" ]; then
  mkdir -p "$CRYPTO"
  "$BIN/cryptogen" generate \
    --config="$SCRIPT_DIR/crypto-config-node1.yaml" \
    --output="$CRYPTO" 2>&1
  ok "crypto" "Certificats Org1 générés"
else
  ok "crypto" "Certificats Org1 déjà présents"
fi

# ── [2] Génération des artifacts (genesis + channel.tx) ───────────────────────
step "artifacts" "Génération genesis block et channel.tx..."
mkdir -p "$ARTIFACTS"
export FABRIC_CFG_PATH="$SCRIPT_DIR"

if [ ! -f "$ARTIFACTS/genesis.block" ]; then
  "$BIN/configtxgen" \
    -profile Org1Genesis \
    -channelID system-channel \
    -outputBlock "$ARTIFACTS/genesis.block" 2>&1
  ok "artifacts" "genesis.block généré"
else
  ok "artifacts" "genesis.block déjà présent"
fi

if [ ! -f "$ARTIFACTS/channel.tx" ]; then
  "$BIN/configtxgen" \
    -profile Org1Channel \
    -channelID "$CHANNEL" \
    -outputCreateChannelTx "$ARTIFACTS/channel.tx" 2>&1

  "$BIN/configtxgen" \
    -profile Org1Channel \
    -channelID "$CHANNEL" \
    -outputAnchorPeersUpdate "$ARTIFACTS/Org1MSPanchors.tx" \
    -asOrg Org1MSP 2>&1
  ok "artifacts" "channel.tx et anchors.tx générés"
else
  ok "artifacts" "channel.tx déjà présent"
fi

export FABRIC_CFG_PATH="$BIN/../config"

# ── [3] Fichier .env pour le compose ──────────────────────────────────────────
step "env" "Création du .env Node1..."
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
ORG1_IP=localhost
EOF
fi

# Lier .env dans le répertoire network pour docker compose
cp "$ENV_FILE" "$SCRIPT_DIR/.env" 2>/dev/null || true
ok "env" ".env prêt"

# ── [4] Démarrage des conteneurs Org1 ────────────────────────────────────────
step "start_containers" "Démarrage des conteneurs Org1..."
docker compose -f "$COMPOSE" --env-file "$SCRIPT_DIR/.env" up -d 2>&1 | \
  grep -E "Starting|Started|Running|Created|Error|already" || true
ok "start_containers" "Conteneurs Org1 démarrés"

# ── [5] Attente orderer Org1 ──────────────────────────────────────────────────
step "wait_orderers" "Attente de l'orderer Org1 (30s max)..."
for i in $(seq 1 30); do
  if docker ps --filter "name=orderer.org1.example.com" --filter "status=running" -q 2>/dev/null | grep -q .; then
    break
  fi
  sleep 1
done
sleep 8
ok "wait_orderers" "Orderer Org1 prêt"

# ── Helper peer CLI ────────────────────────────────────────────────────────────
ORDERER_FLAGS="--tls --cafile /etc/hyperledger/crypto-config/ordererOrganizations/org1.example.com/orderers/orderer.org1.example.com/tls/ca.crt"
ORDERER_ADDR="-o orderer.org1.example.com:7050"

peer1_cli() {
  echo "docker run --rm \
    --network securebackup-fabric \
    -v $CRYPTO:/etc/hyperledger/crypto-config \
    -v $ARTIFACTS:/etc/hyperledger/channel-artifacts \
    -e FABRIC_CFG_PATH=/var/hyperledger/fabric/config \
    -e CORE_PEER_LOCALMSPID=Org1MSP \
    -e CORE_PEER_TLS_ENABLED=true \
    -e CORE_PEER_ADDRESS=peer0.org1.example.com:7051 \
    -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp \
    -e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
    hyperledger/fabric-tools:2.5.4"
}

# ── [6] Créer le channel ──────────────────────────────────────────────────────
step "create_channel" "Création du channel $CHANNEL..."
if [ ! -f "$ARTIFACTS/${CHANNEL}.block" ]; then
  $(peer1_cli) peer channel create \
    $ORDERER_ADDR -c "$CHANNEL" \
    -f /etc/hyperledger/channel-artifacts/channel.tx \
    $ORDERER_FLAGS \
    --outputBlock /etc/hyperledger/channel-artifacts/${CHANNEL}.block 2>&1
  ok "create_channel" "Channel $CHANNEL créé"
else
  ok "create_channel" "Channel $CHANNEL déjà créé"
fi

# ── [7] Jointure du peer Org1 ────────────────────────────────────────────────
step "join_peers" "Jointure de peer0.org1 au channel..."
$(peer1_cli) peer channel join \
  -b /etc/hyperledger/channel-artifacts/${CHANNEL}.block 2>&1 | \
  grep -v "^$" || true
ok "join_peers" "peer0.org1 rejoint $CHANNEL"

# ── [8] Anchor peer Org1 ──────────────────────────────────────────────────────
step "anchor_peers" "Configuration anchor peer Org1..."
$(peer1_cli) peer channel update \
  $ORDERER_ADDR -c "$CHANNEL" \
  -f /etc/hyperledger/channel-artifacts/Org1MSPanchors.tx \
  $ORDERER_FLAGS 2>&1 | grep -v "^$" || true
ok "anchor_peers" "Anchor peer Org1 configuré"

# ── [9] Déploiement chaincode ─────────────────────────────────────────────────
step "deploy_chaincode" "Déploiement chaincode $CC_NAME v$CC_VERSION..."
bash "$SCRIPT_DIR/scripts/deploy-chaincode.sh" "$CC_VERSION" "$CC_SEQUENCE" 2>&1 | \
  grep -E "^\[|→|✓|Erreur|Error|Package ID" || true
ok "deploy_chaincode" "Chaincode déployé"

log "DONE:network Nœud 1 (Org1) opérationnel — réseau prêt pour l'ajout de nœuds distants"
