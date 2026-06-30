#!/bin/bash
# Met à jour l'endorsement policy du chaincode backup-cc pour accepter
# n'importe quelle organisation membre (Org1 OU Org2 OU Org3...).
# Incrémente automatiquement le numéro de séquence.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NETWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$NETWORK_DIR/.." && pwd)"
CRYPTO="$NETWORK_DIR/crypto-config"
ARTIFACTS="$NETWORK_DIR/channel-artifacts"
NET="${DOCKER_NETWORK:-securebackup-net}"

if [ -n "${HOST_PROJECT_DIR:-}" ]; then
  HOST_CRYPTO="$HOST_PROJECT_DIR/network/crypto-config"
  HOST_ARTIFACTS="$HOST_PROJECT_DIR/network/channel-artifacts"
else
  HOST_CRYPTO="$CRYPTO"
  HOST_ARTIFACTS="$ARTIFACTS"
fi

CC_NAME="backup-cc"
CC_VERSION="${1:-1.0}"
CHANNEL="backupchannel"

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

# Trouver le Package ID installé
PACKAGE_ID=$($(peer1) peer lifecycle chaincode queryinstalled 2>&1 \
  | grep "${CC_NAME}_${CC_VERSION}" | tail -1 \
  | sed 's/.*Package ID: \([^,]*\),.*/\1/')
[ -z "$PACKAGE_ID" ] && echo "ERROR: Package ID introuvable" && exit 1
echo "Package ID : $PACKAGE_ID"

# Trouver la séquence actuelle et incrémenter
CURRENT_SEQ=$($(peer1) peer lifecycle chaincode querycommitted \
  --channelID $CHANNEL --name $CC_NAME 2>&1 \
  | grep "Sequence:" | sed 's/.*Sequence: \([0-9]*\).*/\1/' | head -1)
CURRENT_SEQ="${CURRENT_SEQ:-1}"
NEW_SEQ=$((CURRENT_SEQ + 1))
echo "Séquence actuelle : $CURRENT_SEQ → nouvelle : $NEW_SEQ"

# Construire la policy dynamiquement selon les orgs déployées
POLICY="OR('Org1MSP.member'"
for dir in "$CRYPTO/peerOrganizations"/*/; do
  DOMAIN=$(basename "$dir")
  ORG_NUM=$(echo "$DOMAIN" | sed 's/org\([0-9]*\).*/\1/')
  [ "$ORG_NUM" = "1" ] && continue
  POLICY="$POLICY,'Org${ORG_NUM}MSP.member'"
done
POLICY="$POLICY)"
echo "Nouvelle policy : $POLICY"

echo "→ [1/2] Approbation Org1MSP (séquence $NEW_SEQ)..."
$(peer1) peer lifecycle chaincode approveformyorg \
  $ORDERER_FLAGS \
  --channelID $CHANNEL --name $CC_NAME \
  --version $CC_VERSION --package-id "$PACKAGE_ID" \
  --sequence $NEW_SEQ \
  --signature-policy "$POLICY" 2>&1 | grep -v "^$" || true

echo "→ [2/2] Commit..."
$(peer1) peer lifecycle chaincode commit \
  $ORDERER_FLAGS \
  --channelID $CHANNEL --name $CC_NAME \
  --version $CC_VERSION --sequence $NEW_SEQ \
  --signature-policy "$POLICY" \
  --peerAddresses peer0.org1.example.com:7051 \
  --tlsRootCertFiles /etc/hyperledger/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  2>&1 | grep -v "^$" || true

echo "✓ Endorsement policy mise à jour : $POLICY (séquence $NEW_SEQ)"
