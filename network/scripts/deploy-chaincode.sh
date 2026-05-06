#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NETWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CCAAS_DIR="$NETWORK_DIR/chaincode-ccaas"

CC_NAME="backup-cc"
CC_VERSION="${1:-1.0}"
CC_SEQUENCE="${2:-1}"
CHANNEL="backupchannel"
ARTIFACTS="$NETWORK_DIR/channel-artifacts"
CRYPTO="$NETWORK_DIR/crypto-config"
PACKAGE_FILE="$ARTIFACTS/${CC_NAME}.tar.gz"

PEER_CLI="docker run --rm \
  --network securebackup-fabric \
  -v $CRYPTO:/etc/hyperledger/crypto-config \
  -v $ARTIFACTS:/etc/hyperledger/channel-artifacts \
  -e CORE_PEER_LOCALMSPID=Org1MSP \
  -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp \
  -e CORE_PEER_TLS_ENABLED=true \
  -e CORE_PEER_ADDRESS=peer0.org1.example.com:7051 \
  -e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  hyperledger/fabric-tools:2.5.4"

ORDERER_FLAGS="--orderer orderer.example.com:7050 --tls \
  --cafile /etc/hyperledger/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"

echo "→ [1/6] Création du package CCaaS $CC_NAME v$CC_VERSION..."
# Le package CCaaS est créé manuellement (fabric-tools ne supporte pas --lang ccaas)
META_JSON='{"type":"ccaas","label":"'"${CC_NAME}_${CC_VERSION}"'"}'
echo "$META_JSON" > /tmp/cc_metadata.json
tar -czf /tmp/cc_code.tar.gz -C "$CCAAS_DIR" connection.json
mkdir -p /tmp/cc_pkg
mv /tmp/cc_metadata.json /tmp/cc_pkg/metadata.json
mv /tmp/cc_code.tar.gz /tmp/cc_pkg/code.tar.gz
tar -czf "$PACKAGE_FILE" -C /tmp/cc_pkg metadata.json code.tar.gz
rm -rf /tmp/cc_pkg
echo "   Package : $PACKAGE_FILE ($(du -h "$PACKAGE_FILE" | cut -f1))"

echo "→ [2/6] Installation sur peer0..."
$PEER_CLI peer lifecycle chaincode install \
  /etc/hyperledger/channel-artifacts/${CC_NAME}.tar.gz

echo "→ [3/6] Récupération du Package ID..."
PACKAGE_ID=$($PEER_CLI peer lifecycle chaincode queryinstalled 2>&1 \
  | grep "${CC_NAME}_${CC_VERSION}" \
  | sed 's/.*Package ID: \([^,]*\),.*/\1/')
echo "   Package ID : $PACKAGE_ID"

if [ -z "$PACKAGE_ID" ]; then
  echo "Erreur : Package ID introuvable" && exit 1
fi

echo "→ [4/6] Démarrage du service chaincode (CHAINCODE_ID=$PACKAGE_ID)..."
echo "CHAINCODE_ID=$PACKAGE_ID" > "$NETWORK_DIR/.env"
docker compose -f "$NETWORK_DIR/docker-compose.yaml" \
  --env-file "$NETWORK_DIR/.env" \
  up -d backup-cc 2>&1 | grep -E "Started|Running|Created|Error" || true
echo "   Attente du démarrage (8s)..."
sleep 8

echo "→ [5/6] Approbation pour Org1MSP..."
$PEER_CLI peer lifecycle chaincode approveformyorg \
  $ORDERER_FLAGS \
  --channelID $CHANNEL \
  --name $CC_NAME \
  --version $CC_VERSION \
  --package-id "$PACKAGE_ID" \
  --sequence $CC_SEQUENCE

echo "→ [6/6] Commit sur le channel..."
$PEER_CLI peer lifecycle chaincode commit \
  $ORDERER_FLAGS \
  --channelID $CHANNEL \
  --name $CC_NAME \
  --version $CC_VERSION \
  --sequence $CC_SEQUENCE \
  --peerAddresses peer0.org1.example.com:7051 \
  --tlsRootCertFiles /etc/hyperledger/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt

echo ""
echo "✓ Chaincode $CC_NAME v$CC_VERSION déployé sur $CHANNEL (CCaaS)"
echo "  Package ID : $PACKAGE_ID"
echo "  Pour mettre à jour : $0 <nouvelle-version> <séquence+1>"
