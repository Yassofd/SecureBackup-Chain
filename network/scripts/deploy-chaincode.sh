#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NETWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CCAAS_DIR="$NETWORK_DIR/chaincode-ccaas"
CRYPTO="$NETWORK_DIR/crypto-config"
ARTIFACTS="$NETWORK_DIR/channel-artifacts"

CC_NAME="backup-cc"
CC_VERSION="${1:-1.0}"
CC_SEQUENCE="${2:-1}"
CHANNEL="backupchannel"
PACKAGE_FILE="$ARTIFACTS/${CC_NAME}.tar.gz"

# ── Helper : peer CLI par org ─────────────────────────────────────────────────
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

ORDERER_FLAGS="--orderer orderer.org1.example.com:7050 --tls \
  --cafile /etc/hyperledger/crypto-config/ordererOrganizations/org1.example.com/orderers/orderer.org1.example.com/tls/ca.crt"

# ── [1] Package CCaaS ─────────────────────────────────────────────────────────
echo "→ [1/6] Création du package CCaaS $CC_NAME v$CC_VERSION..."
META_JSON='{"type":"ccaas","label":"'"${CC_NAME}_${CC_VERSION}"'"}'
echo "$META_JSON" > /tmp/cc_metadata.json
tar -czf /tmp/cc_code.tar.gz -C "$CCAAS_DIR" connection.json
mkdir -p /tmp/cc_pkg
mv /tmp/cc_metadata.json /tmp/cc_pkg/metadata.json
mv /tmp/cc_code.tar.gz /tmp/cc_pkg/code.tar.gz
tar -czf "$PACKAGE_FILE" -C /tmp/cc_pkg metadata.json code.tar.gz
rm -rf /tmp/cc_pkg
echo "   Package : $PACKAGE_FILE ($(du -h "$PACKAGE_FILE" | cut -f1))"

# ── [2] Install sur les 3 peers ───────────────────────────────────────────────
echo "→ [2/6] Installation sur les 3 peers..."
for ORG_PORT in "Org1:7051" "Org2:8051" "Org3:9051"; do
  ORG="${ORG_PORT%%:*}"; PORT="${ORG_PORT##*:}"
  echo "   → peer0.${ORG,,}.example.com"
  $(peer_cli $ORG $PORT) peer lifecycle chaincode install \
    /etc/hyperledger/channel-artifacts/${CC_NAME}.tar.gz
done

# ── [3] Package ID (depuis Org1) ──────────────────────────────────────────────
echo "→ [3/6] Récupération du Package ID..."
PACKAGE_ID=$($(peer_cli Org1 7051) peer lifecycle chaincode queryinstalled 2>&1 \
  | grep "${CC_NAME}_${CC_VERSION}" \
  | sed 's/.*Package ID: \([^,]*\),.*/\1/')
echo "   Package ID : $PACKAGE_ID"
[ -z "$PACKAGE_ID" ] && echo "Erreur : Package ID introuvable" && exit 1

# ── [4] Démarrage CCaaS ───────────────────────────────────────────────────────
echo "→ [4/6] Démarrage du service chaincode..."
echo "CHAINCODE_ID=$PACKAGE_ID" > "$NETWORK_DIR/.env"
docker compose -f "$NETWORK_DIR/docker-compose.yaml" --env-file "$NETWORK_DIR/.env" \
  up -d backup-cc 2>&1 | grep -E "Started|Running|Created|Error" || true
echo "   Attente (8s)..."; sleep 8

# ── [5] Approbation des 3 orgs ────────────────────────────────────────────────
echo "→ [5/6] Approbation des 3 orgs..."
for ORG_PORT in "Org1:7051" "Org2:8051" "Org3:9051"; do
  ORG="${ORG_PORT%%:*}"; PORT="${ORG_PORT##*:}"
  echo "   → ${ORG}MSP"
  $(peer_cli $ORG $PORT) peer lifecycle chaincode approveformyorg \
    $ORDERER_FLAGS \
    --channelID $CHANNEL --name $CC_NAME \
    --version $CC_VERSION --package-id "$PACKAGE_ID" \
    --sequence $CC_SEQUENCE
done

# ── [6] Commit ────────────────────────────────────────────────────────────────
echo "→ [6/6] Commit sur le channel..."
$(peer_cli Org1 7051) peer lifecycle chaincode commit \
  $ORDERER_FLAGS \
  --channelID $CHANNEL --name $CC_NAME \
  --version $CC_VERSION --sequence $CC_SEQUENCE \
  --peerAddresses peer0.org1.example.com:7051 \
  --tlsRootCertFiles /etc/hyperledger/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses peer0.org2.example.com:8051 \
  --tlsRootCertFiles /etc/hyperledger/crypto-config/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
  --peerAddresses peer0.org3.example.com:9051 \
  --tlsRootCertFiles /etc/hyperledger/crypto-config/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt

echo ""
echo "✓ Chaincode $CC_NAME v$CC_VERSION déployé sur $CHANNEL"
echo "  Package ID : $PACKAGE_ID"
