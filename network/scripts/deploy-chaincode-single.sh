#!/bin/bash
# Déploiement chaincode CCaaS — single node Org1 uniquement
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NETWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$NETWORK_DIR/.." && pwd)"
CCAAS_DIR="$NETWORK_DIR/chaincode-ccaas"
CRYPTO="$NETWORK_DIR/crypto-config"
ARTIFACTS="$NETWORK_DIR/channel-artifacts"
NET="${DOCKER_NETWORK:-securebackup-net}"

# When running inside a Docker container, use HOST_PROJECT_DIR for volume mounts
# so Docker daemon (on the host) can find the paths correctly.
if [ -n "${HOST_PROJECT_DIR:-}" ]; then
  HOST_CRYPTO="$HOST_PROJECT_DIR/network/crypto-config"
  HOST_ARTIFACTS="$HOST_PROJECT_DIR/network/channel-artifacts"
  HOST_ROOT="$HOST_PROJECT_DIR"
else
  HOST_CRYPTO="$CRYPTO"
  HOST_ARTIFACTS="$ARTIFACTS"
  HOST_ROOT="$ROOT_DIR"
fi

CC_NAME="backup-cc"
CC_VERSION="${1:-1.0}"
CC_SEQUENCE="${2:-1}"
CHANNEL="backupchannel"
PACKAGE_FILE="$ARTIFACTS/${CC_NAME}.tar.gz"

peer1() {
  echo "docker run --rm \
    --network $NET \
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

ORDERER_FLAGS="--orderer orderer.org1.example.com:7050 --tls \
  --cafile /etc/hyperledger/crypto-config/ordererOrganizations/org1.example.com/orderers/orderer.org1.example.com/tls/ca.crt"

echo "→ [1/5] Package CCaaS $CC_NAME v$CC_VERSION..."
if [ -d "$CCAAS_DIR" ]; then
  META_JSON='{"type":"ccaas","label":"'"${CC_NAME}_${CC_VERSION}"'"}'
  echo "$META_JSON" > /tmp/cc_metadata.json
  tar -czf /tmp/cc_code.tar.gz -C "$CCAAS_DIR" connection.json
  mkdir -p /tmp/cc_pkg
  cp /tmp/cc_metadata.json /tmp/cc_pkg/metadata.json
  cp /tmp/cc_code.tar.gz /tmp/cc_pkg/code.tar.gz
  tar -czf "$PACKAGE_FILE" -C /tmp/cc_pkg metadata.json code.tar.gz
  rm -rf /tmp/cc_pkg /tmp/cc_metadata.json /tmp/cc_code.tar.gz
else
  echo "   WARN: $CCAAS_DIR absent — package CCaaS ignoré"
fi

echo "→ [2/5] Installation sur peer0.org1..."
$(peer1) peer lifecycle chaincode install \
  /etc/hyperledger/channel-artifacts/${CC_NAME}.tar.gz 2>&1 | grep -v "^$" || true

echo "→ [3/5] Récupération Package ID..."
# Prend le dernier package installé portant ce label (évite les multi-lignes si plusieurs installs)
PACKAGE_ID=$($(peer1) peer lifecycle chaincode queryinstalled 2>&1 \
  | grep "${CC_NAME}_${CC_VERSION}" \
  | tail -1 \
  | sed 's/.*Package ID: \([^,]*\),.*/\1/')
echo "   Package ID : $PACKAGE_ID"

if [ -z "$PACKAGE_ID" ]; then
  echo "WARN: Package ID introuvable — tentative sur tous les packages installés"
  PACKAGE_ID=$($(peer1) peer lifecycle chaincode queryinstalled 2>&1 \
    | grep "Package ID:" | tail -1 | sed 's/.*Package ID: \([^,]*\),.*/\1/')
  echo "   Package ID détecté : $PACKAGE_ID"
fi

[ -z "$PACKAGE_ID" ] && echo "ERROR: Impossible de trouver le Package ID" && exit 1

# Écrire le package ID dans network/.chaincode-id (accessible depuis l'hôte car /network est monté)
echo "$PACKAGE_ID" > "$NETWORK_DIR/.chaincode-id"

# Mettre à jour CHAINCODE_ID dans le .env racine
if [ -f "$ROOT_DIR/.env" ]; then
  python3 -c "
import re, sys
content = open('$ROOT_DIR/.env').read()
content = re.sub(r'^CHAINCODE_ID=.*', 'CHAINCODE_ID=$PACKAGE_ID', content, flags=re.MULTILINE)
open('$ROOT_DIR/.env', 'w').write(content)
" 2>/dev/null || \
  awk -v id="$PACKAGE_ID" '/^CHAINCODE_ID=/{print "CHAINCODE_ID="id; next}1' \
    "$ROOT_DIR/.env" > "$ROOT_DIR/.env.tmp" && mv "$ROOT_DIR/.env.tmp" "$ROOT_DIR/.env"
  echo "   .env mis à jour : CHAINCODE_ID=$PACKAGE_ID"
fi

echo "→ [4/5] Approbation Org1MSP..."
$(peer1) peer lifecycle chaincode approveformyorg \
  $ORDERER_FLAGS \
  --channelID $CHANNEL --name $CC_NAME \
  --version $CC_VERSION --package-id "$PACKAGE_ID" \
  --sequence $CC_SEQUENCE \
  --signature-policy "OR('Org1MSP.member')" 2>&1 | grep -v "^$" || true

echo "→ [5/5] Commit sur le channel (Org1 uniquement)..."
$(peer1) peer lifecycle chaincode commit \
  $ORDERER_FLAGS \
  --channelID $CHANNEL --name $CC_NAME \
  --version $CC_VERSION --sequence $CC_SEQUENCE \
  --signature-policy "OR('Org1MSP.member')" \
  --peerAddresses peer0.org1.example.com:7051 \
  --tlsRootCertFiles /etc/hyperledger/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  2>&1 | grep -v "^$" || true

echo "✓ Chaincode $CC_NAME v$CC_VERSION déployé (Org1) — Package ID : $PACKAGE_ID"
