#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NETWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$NETWORK_DIR"

ORDERER_CA="$NETWORK_DIR/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"
PEER_TLS_CA="$NETWORK_DIR/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
ADMIN_MSP="$NETWORK_DIR/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"

FABRIC_TOOLS_COMMON="\
  --network securebackup-fabric \
  -v $NETWORK_DIR/crypto-config:/etc/hyperledger/crypto-config \
  -v $NETWORK_DIR/channel-artifacts:/etc/hyperledger/channel-artifacts \
  -e CORE_PEER_LOCALMSPID=Org1MSP \
  -e CORE_PEER_TLS_ENABLED=true \
  -e CORE_PEER_ADDRESS=peer0.org1.example.com:7051 \
  -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp \
  -e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"

ORDERER_TLS="--tls --cafile /etc/hyperledger/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"

echo "→ Création du channel backupchannel..."
docker run --rm $FABRIC_TOOLS_COMMON \
  hyperledger/fabric-tools:2.5.4 \
  peer channel create \
    -o orderer.example.com:7050 \
    -c backupchannel \
    -f /etc/hyperledger/channel-artifacts/channel.tx \
    $ORDERER_TLS \
    --outputBlock /etc/hyperledger/channel-artifacts/backupchannel.block

echo "→ Jonction du peer au channel..."
docker run --rm $FABRIC_TOOLS_COMMON \
  hyperledger/fabric-tools:2.5.4 \
  peer channel join \
    -b /etc/hyperledger/channel-artifacts/backupchannel.block

echo "→ Mise à jour de l'anchor peer..."
docker run --rm $FABRIC_TOOLS_COMMON \
  hyperledger/fabric-tools:2.5.4 \
  peer channel update \
    -o orderer.example.com:7050 \
    -c backupchannel \
    -f /etc/hyperledger/channel-artifacts/Org1MSPanchors.tx \
    $ORDERER_TLS

echo "✓ Channel backupchannel créé et peer0 joint avec succès"
