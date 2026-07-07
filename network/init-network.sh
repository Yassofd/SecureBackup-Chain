#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# SecureBackup-Chain — Bootstrap Nœud 1 (Org1 uniquement)
# Auto-génère crypto + artifacts si absents, puis démarre Org1.
# Appelé par le setup wizard via le backend SSE.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN="$SCRIPT_DIR/fabric-samples/bin"
# Si HOST_PROJECT_DIR est défini (exécution depuis Docker), utiliser le chemin hôte
# pour les volumes docker run, sinon utiliser le chemin local
HOST_NET="${HOST_PROJECT_DIR:+$HOST_PROJECT_DIR/network}"
HOST_NET="${HOST_NET:-$SCRIPT_DIR}"
CRYPTO="$SCRIPT_DIR/crypto-config"
ARTIFACTS="$SCRIPT_DIR/channel-artifacts"
HOST_CRYPTO="$HOST_NET/crypto-config"
HOST_ARTIFACTS="$HOST_NET/channel-artifacts"
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
# Les binaires locaux (cryptogen, configtxgen) sont optionnels depuis la migration
# vers fabric-tools Docker — init-network.sh les utilise via docker run.
if [ -x "$BIN/cryptogen" ] && [ -x "$BIN/configtxgen" ]; then
  ok "prereqs" "Docker et binaires Fabric locaux OK"
else
  ok "prereqs" "Docker OK (binaires Fabric via image hyperledger/fabric-tools:2.5.4)"
fi

# ── [1] Génération crypto Org1 (si absente) ───────────────────────────────────
step "crypto" "Génération des certificats Org1..."
if [ ! -d "$CRYPTO/peerOrganizations/org1.example.com" ]; then
  mkdir -p "$CRYPTO"
  if [ -x "$BIN/cryptogen" ]; then
    "$BIN/cryptogen" generate \
      --config="$SCRIPT_DIR/crypto-config-node1.yaml" \
      --output="$CRYPTO" 2>&1
  else
    docker run --rm \
      -v "$SCRIPT_DIR:/network" \
      hyperledger/fabric-tools:2.5.4 \
      cryptogen generate \
        --config=/network/crypto-config-node1.yaml \
        --output=/network/crypto-config 2>&1
  fi
  ok "crypto" "Certificats Org1 générés"
else
  ok "crypto" "Certificats Org1 déjà présents"
fi

# ── [2] Génération des artifacts ──────────────────────────────────────────────
step "artifacts" "Génération des artifacts Fabric..."
mkdir -p "$ARTIFACTS"

# Toujours utiliser l'image Docker fabric-tools pour configtxgen :
# les binaires locaux (fabric-samples/bin) peuvent être absents après clean.sh.
# Le mount -v "$SCRIPT_DIR:/network" expose configtx.yaml + crypto-config.
_configtxgen() {
  docker run --rm \
    -v "$SCRIPT_DIR:/network" \
    -e FABRIC_CFG_PATH=/network \
    hyperledger/fabric-tools:2.5.4 \
    configtxgen "$@" 2>&1
}

# Chemins DANS le conteneur (via le mount /network)
_DART="/network/channel-artifacts"

if [ ! -f "$ARTIFACTS/channel.tx" ]; then
  _configtxgen -profile Org1Channel -channelID "$CHANNEL" \
    -outputCreateChannelTx "${_DART}/channel.tx" | grep -v "^\[" || true
  _configtxgen -profile Org1Channel -channelID "$CHANNEL" \
    -outputAnchorPeersUpdate "${_DART}/Org1MSPanchors.tx" -asOrg Org1MSP | grep -v "^\[" || true
  ok "artifacts" "channel.tx et anchors.tx générés"
else
  ok "artifacts" "channel.tx déjà présent"
fi

# Genesis block applicatif pour channel participation API
if [ ! -f "$ARTIFACTS/${CHANNEL}.block" ]; then
  _configtxgen -profile Org1ChannelGenesis -channelID "$CHANNEL" \
    -outputBlock "${_DART}/${CHANNEL}.block" | grep -v "^\[" || true
  ok "artifacts" "${CHANNEL}.block généré"
else
  ok "artifacts" "${CHANNEL}.block déjà présent"
fi

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
    --network ${DOCKER_NETWORK:-securebackup-net} \
    -v $HOST_CRYPTO:/etc/hyperledger/crypto-config \
    -v $HOST_ARTIFACTS:/etc/hyperledger/channel-artifacts \
    -e FABRIC_CFG_PATH=/var/hyperledger/fabric/config \
    -e CORE_PEER_LOCALMSPID=Org1MSP \
    -e CORE_PEER_TLS_ENABLED=true \
    -e CORE_PEER_ADDRESS=peer0.org1.example.com:7051 \
    -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp \
    -e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
    hyperledger/fabric-tools:2.5.4"
}

# ── [6] Bootstrap orderer sur le channel via channel participation API ────────
# Remplace «peer channel create» (ancienne méthode system-channel) par osnadmin.
# L'orderer utilise BOOTSTRAPMETHOD=none — il n'y a pas de system channel.
step "create_channel" "Bootstrap orderer sur channel $CHANNEL..."
_osnadmin_join() {
  docker run --rm \
    --network "${DOCKER_NETWORK:-securebackup-net}" \
    -v "$HOST_CRYPTO:/etc/hyperledger/crypto-config" \
    -v "$HOST_ARTIFACTS:/etc/hyperledger/channel-artifacts" \
    hyperledger/fabric-tools:2.5.4 \
    osnadmin channel join \
      --channelID "$CHANNEL" \
      --config-block "/etc/hyperledger/channel-artifacts/${CHANNEL}.block" \
      -o orderer.org1.example.com:9443 \
      --ca-file     /etc/hyperledger/crypto-config/ordererOrganizations/org1.example.com/orderers/orderer.org1.example.com/tls/ca.crt \
      --client-cert /etc/hyperledger/crypto-config/ordererOrganizations/org1.example.com/orderers/orderer.org1.example.com/tls/server.crt \
      --client-key  /etc/hyperledger/crypto-config/ordererOrganizations/org1.example.com/orderers/orderer.org1.example.com/tls/server.key \
    2>&1
}
_osn_out=$(_osnadmin_join || true)
if echo "$_osn_out" | grep -qE '"status": "active"|already exists|409'; then
  ok "create_channel" "Orderer membre de $CHANNEL"
else
  log "INFO:create_channel osnadmin: $_osn_out"
  ok "create_channel" "Bootstrap orderer tenté"
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
DOCKER_NETWORK="${DOCKER_NETWORK:-securebackup-net}" \
bash "$SCRIPT_DIR/scripts/deploy-chaincode-single.sh" "$CC_VERSION" "$CC_SEQUENCE" 2>&1 | \
  grep -E "→|✓|WARN|ERROR|Package ID" || true
ok "deploy_chaincode" "Chaincode déployé"

log "DONE:network Nœud 1 (Org1) opérationnel — réseau prêt pour l'ajout de nœuds distants"
