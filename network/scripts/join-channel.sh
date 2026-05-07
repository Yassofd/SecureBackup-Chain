#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NETWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CRYPTO="$NETWORK_DIR/crypto-config"
ARTIFACTS="$NETWORK_DIR/channel-artifacts"
CHANNEL="backupchannel"

# ── Helpers ──────────────────────────────────────────────────────────────────
peer_cli() {
  local ORG=$1; local PORT=$2; local COUCHPORT=$3
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

# ── Créer le channel (depuis Org1) ───────────────────────────────────────────
echo "→ [1] Création du channel $CHANNEL (Org1)..."
$(peer_cli Org1 7051) peer channel create \
  $ORDERER_ADDR -c $CHANNEL \
  -f /etc/hyperledger/channel-artifacts/channel.tx \
  $ORDERER_FLAGS \
  --outputBlock /etc/hyperledger/channel-artifacts/${CHANNEL}.block

# ── Jointure des 3 peers ──────────────────────────────────────────────────────
for ORG_PORT in "Org1:7051" "Org2:8051" "Org3:9051"; do
  ORG="${ORG_PORT%%:*}"
  PORT="${ORG_PORT##*:}"
  echo "→ [2] Jointure de peer0.${ORG,,}.example.com..."
  $(peer_cli $ORG $PORT) peer channel join \
    -b /etc/hyperledger/channel-artifacts/${CHANNEL}.block
done

# ── Anchor peers (un par org) ─────────────────────────────────────────────────
for ORG_PORT in "Org1:7051" "Org2:8051" "Org3:9051"; do
  ORG="${ORG_PORT%%:*}"
  PORT="${ORG_PORT##*:}"
  echo "→ [3] Anchor peer update pour ${ORG}MSP..."
  $(peer_cli $ORG $PORT) peer channel update \
    $ORDERER_ADDR -c $CHANNEL \
    -f /etc/hyperledger/channel-artifacts/${ORG}MSPanchors.tx \
    $ORDERER_FLAGS
done

echo "✓ Channel $CHANNEL créé — 3 peers joints (Org1, Org2, Org3)"
