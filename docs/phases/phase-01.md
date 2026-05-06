# Phase 1 — Réseau Hyperledger Fabric local minimal

**Objectif** : Avoir un réseau Fabric fonctionnel sur une seule machine avec 1 orderer, 1 peer (Org1), 1 CA et 1 channel.

**Durée estimée** : 1 à 2 heures (selon la rapidité de téléchargement des images Docker).

**Prérequis** : Phase 0 complétée.

---

## Étapes

### 1. Télécharger les binaires Fabric et images Docker

```bash
cd securebackup-chain
mkdir -p network/bin
cd network
curl -sSL https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh | bash -s -- -f 2.5.4 -c 1.5.7
```

Cela télécharge :
- Les binaires `peer`, `orderer`, `cryptogen`, `configtxgen` dans `bin/`
- Les images Docker : `hyperledger/fabric-peer`, `fabric-orderer`, `fabric-ca`, `fabric-tools`, `fabric-ccenv`, `fabric-baseos`, `couchdb`

Vérifier :
```bash
ls bin/
docker images | grep hyperledger
```

Ajouter `bin/` au PATH temporairement :
```bash
export PATH=$PWD/bin:$PATH
```

### 2. Créer `network/crypto-config.yaml`

```yaml
OrdererOrgs:
  - Name: Orderer
    Domain: example.com
    EnableNodeOUs: true
    Specs:
      - Hostname: orderer

PeerOrgs:
  - Name: Org1
    Domain: org1.example.com
    EnableNodeOUs: true
    Template:
      Count: 1
      SANS:
        - localhost
    Users:
      Count: 1
```

### 3. Créer `network/configtx.yaml`

Voir le fichier complet en annexe à cette phase. Points clés :
- Définir `OrdererOrg` et `Org1` avec leurs MSP
- Profil `OrdererGenesis` pour le bloc de genèse
- Profil `BackupChannel` pour le channel applicatif
- Politiques d'endossement standards (`Readers`, `Writers`, `Admins`)

```bash
cat > configtx.yaml <<'EOF'
Organizations:
  - &OrdererOrg
    Name: OrdererOrg
    ID: OrdererMSP
    MSPDir: crypto-config/ordererOrganizations/example.com/msp
    Policies:
      Readers:
        Type: Signature
        Rule: "OR('OrdererMSP.member')"
      Writers:
        Type: Signature
        Rule: "OR('OrdererMSP.member')"
      Admins:
        Type: Signature
        Rule: "OR('OrdererMSP.admin')"
    OrdererEndpoints:
      - orderer.example.com:7050

  - &Org1
    Name: Org1MSP
    ID: Org1MSP
    MSPDir: crypto-config/peerOrganizations/org1.example.com/msp
    Policies:
      Readers:
        Type: Signature
        Rule: "OR('Org1MSP.admin', 'Org1MSP.peer', 'Org1MSP.client')"
      Writers:
        Type: Signature
        Rule: "OR('Org1MSP.admin', 'Org1MSP.client')"
      Admins:
        Type: Signature
        Rule: "OR('Org1MSP.admin')"
      Endorsement:
        Type: Signature
        Rule: "OR('Org1MSP.peer')"
    AnchorPeers:
      - Host: peer0.org1.example.com
        Port: 7051

Capabilities:
  Channel: &ChannelCapabilities
    V2_0: true
  Orderer: &OrdererCapabilities
    V2_0: true
  Application: &ApplicationCapabilities
    V2_5: true

Application: &ApplicationDefaults
  Organizations:
  Policies:
    Readers:
      Type: ImplicitMeta
      Rule: "ANY Readers"
    Writers:
      Type: ImplicitMeta
      Rule: "ANY Writers"
    Admins:
      Type: ImplicitMeta
      Rule: "MAJORITY Admins"
    LifecycleEndorsement:
      Type: ImplicitMeta
      Rule: "MAJORITY Endorsement"
    Endorsement:
      Type: ImplicitMeta
      Rule: "MAJORITY Endorsement"
  Capabilities:
    <<: *ApplicationCapabilities

Orderer: &OrdererDefaults
  OrdererType: etcdraft
  Addresses:
    - orderer.example.com:7050
  EtcdRaft:
    Consenters:
      - Host: orderer.example.com
        Port: 7050
        ClientTLSCert: crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/server.crt
        ServerTLSCert: crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/server.crt
  BatchTimeout: 2s
  BatchSize:
    MaxMessageCount: 10
    AbsoluteMaxBytes: 99 MB
    PreferredMaxBytes: 512 KB
  Organizations:
  Policies:
    Readers:
      Type: ImplicitMeta
      Rule: "ANY Readers"
    Writers:
      Type: ImplicitMeta
      Rule: "ANY Writers"
    Admins:
      Type: ImplicitMeta
      Rule: "MAJORITY Admins"
    BlockValidation:
      Type: ImplicitMeta
      Rule: "ANY Writers"

Channel: &ChannelDefaults
  Policies:
    Readers:
      Type: ImplicitMeta
      Rule: "ANY Readers"
    Writers:
      Type: ImplicitMeta
      Rule: "ANY Writers"
    Admins:
      Type: ImplicitMeta
      Rule: "MAJORITY Admins"
  Capabilities:
    <<: *ChannelCapabilities

Profiles:
  OrdererGenesis:
    <<: *ChannelDefaults
    Orderer:
      <<: *OrdererDefaults
      Organizations:
        - *OrdererOrg
      Capabilities:
        <<: *OrdererCapabilities
    Consortiums:
      BackupConsortium:
        Organizations:
          - *Org1

  BackupChannel:
    <<: *ChannelDefaults
    Consortium: BackupConsortium
    Application:
      <<: *ApplicationDefaults
      Organizations:
        - *Org1
      Capabilities:
        <<: *ApplicationCapabilities
EOF
```

### 4. Générer les certificats et le genesis block

```bash
# Génération des certificats
cryptogen generate --config=./crypto-config.yaml

# Genesis block
mkdir -p channel-artifacts
configtxgen -profile OrdererGenesis -channelID system-channel -outputBlock ./channel-artifacts/genesis.block

# Configuration du channel
configtxgen -profile BackupChannel -outputCreateChannelTx ./channel-artifacts/channel.tx -channelID backupchannel

# Définition de l'anchor peer
configtxgen -profile BackupChannel -outputAnchorPeersUpdate ./channel-artifacts/Org1MSPanchors.tx -channelID backupchannel -asOrg Org1MSP
```

### 5. Créer `network/docker-compose.yaml`

```yaml
version: '3.8'

networks:
  fabric:
    name: securebackup-fabric

services:
  ca-org1:
    image: hyperledger/fabric-ca:1.5.7
    environment:
      - FABRIC_CA_HOME=/etc/hyperledger/fabric-ca-server
      - FABRIC_CA_SERVER_CA_NAME=ca-org1
      - FABRIC_CA_SERVER_TLS_ENABLED=true
      - FABRIC_CA_SERVER_PORT=7054
    ports:
      - "7054:7054"
    command: sh -c 'fabric-ca-server start -b admin:adminpw -d'
    volumes:
      - ./crypto-config/peerOrganizations/org1.example.com/ca/:/etc/hyperledger/fabric-ca-server-config
    container_name: ca.org1.example.com
    networks:
      - fabric

  orderer.example.com:
    image: hyperledger/fabric-orderer:2.5.4
    environment:
      - FABRIC_LOGGING_SPEC=INFO
      - ORDERER_GENERAL_LISTENADDRESS=0.0.0.0
      - ORDERER_GENERAL_LISTENPORT=7050
      - ORDERER_GENERAL_GENESISMETHOD=file
      - ORDERER_GENERAL_GENESISFILE=/var/hyperledger/orderer/orderer.genesis.block
      - ORDERER_GENERAL_LOCALMSPID=OrdererMSP
      - ORDERER_GENERAL_LOCALMSPDIR=/var/hyperledger/orderer/msp
      - ORDERER_GENERAL_TLS_ENABLED=true
      - ORDERER_GENERAL_TLS_PRIVATEKEY=/var/hyperledger/orderer/tls/server.key
      - ORDERER_GENERAL_TLS_CERTIFICATE=/var/hyperledger/orderer/tls/server.crt
      - ORDERER_GENERAL_TLS_ROOTCAS=[/var/hyperledger/orderer/tls/ca.crt]
    working_dir: /opt/gopath/src/github.com/hyperledger/fabric
    command: orderer
    volumes:
      - ./channel-artifacts/genesis.block:/var/hyperledger/orderer/orderer.genesis.block
      - ./crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/msp:/var/hyperledger/orderer/msp
      - ./crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/:/var/hyperledger/orderer/tls
      - orderer-data:/var/hyperledger/production/orderer
    ports:
      - 7050:7050
    container_name: orderer.example.com
    networks:
      - fabric

  couchdb0:
    image: couchdb:3.3
    environment:
      - COUCHDB_USER=admin
      - COUCHDB_PASSWORD=adminpw
    ports:
      - "5984:5984"
    container_name: couchdb0
    networks:
      - fabric

  peer0.org1.example.com:
    image: hyperledger/fabric-peer:2.5.4
    environment:
      - CORE_VM_ENDPOINT=unix:///host/var/run/docker.sock
      - CORE_VM_DOCKER_HOSTCONFIG_NETWORKMODE=securebackup-fabric
      - FABRIC_LOGGING_SPEC=INFO
      - CORE_PEER_TLS_ENABLED=true
      - CORE_PEER_PROFILE_ENABLED=false
      - CORE_PEER_TLS_CERT_FILE=/etc/hyperledger/fabric/tls/server.crt
      - CORE_PEER_TLS_KEY_FILE=/etc/hyperledger/fabric/tls/server.key
      - CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/fabric/tls/ca.crt
      - CORE_PEER_ID=peer0.org1.example.com
      - CORE_PEER_ADDRESS=peer0.org1.example.com:7051
      - CORE_PEER_LISTENADDRESS=0.0.0.0:7051
      - CORE_PEER_CHAINCODEADDRESS=peer0.org1.example.com:7052
      - CORE_PEER_CHAINCODELISTENADDRESS=0.0.0.0:7052
      - CORE_PEER_GOSSIP_BOOTSTRAP=peer0.org1.example.com:7051
      - CORE_PEER_GOSSIP_EXTERNALENDPOINT=peer0.org1.example.com:7051
      - CORE_PEER_LOCALMSPID=Org1MSP
      - CORE_LEDGER_STATE_STATEDATABASE=CouchDB
      - CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS=couchdb0:5984
      - CORE_LEDGER_STATE_COUCHDBCONFIG_USERNAME=admin
      - CORE_LEDGER_STATE_COUCHDBCONFIG_PASSWORD=adminpw
    volumes:
      - /var/run/docker.sock:/host/var/run/docker.sock
      - ./crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/msp:/etc/hyperledger/fabric/msp
      - ./crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls:/etc/hyperledger/fabric/tls
      - peer0-data:/var/hyperledger/production
    working_dir: /opt/gopath/src/github.com/hyperledger/fabric/peer
    command: peer node start
    ports:
      - 7051:7051
    depends_on:
      - orderer.example.com
      - couchdb0
    container_name: peer0.org1.example.com
    networks:
      - fabric

volumes:
  orderer-data:
  peer0-data:
```

### 6. Créer `network/scripts/start-network.sh`

```bash
#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "→ Démarrage du réseau Fabric..."
docker compose -f docker-compose.yaml up -d

echo "→ Attente du démarrage des conteneurs (10s)..."
sleep 10

echo "→ Création du channel backupchannel..."
docker exec peer0.org1.example.com peer channel create \
  -o orderer.example.com:7050 \
  -c backupchannel \
  -f /etc/hyperledger/fabric/channel-artifacts/channel.tx \
  --tls --cafile /etc/hyperledger/fabric/orderer-tls/ca.crt

# (Note: nécessite de monter channel-artifacts dans le peer ou utiliser fabric-tools)

echo "✓ Réseau démarré"
```

Rendre exécutable :
```bash
chmod +x scripts/start-network.sh
```

### 7. Démarrer le réseau

```bash
./scripts/start-network.sh
docker ps
```

Vérifier que les 4 conteneurs tournent : `orderer.example.com`, `peer0.org1.example.com`, `ca.org1.example.com`, `couchdb0`.

### 8. Créer le channel et y joindre le peer

Utiliser `fabric-tools` pour exécuter les commandes peer :

```bash
docker run --rm -it --network securebackup-fabric \
  -v $PWD/crypto-config:/etc/hyperledger/crypto-config \
  -v $PWD/channel-artifacts:/etc/hyperledger/channel-artifacts \
  -e CORE_PEER_LOCALMSPID=Org1MSP \
  -e CORE_PEER_TLS_ENABLED=true \
  -e CORE_PEER_ADDRESS=peer0.org1.example.com:7051 \
  -e CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp \
  -e CORE_PEER_TLS_ROOTCERT_FILE=/etc/hyperledger/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  hyperledger/fabric-tools:2.5.4 \
  peer channel create -o orderer.example.com:7050 -c backupchannel \
  -f /etc/hyperledger/channel-artifacts/channel.tx \
  --tls --cafile /etc/hyperledger/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt
```

Puis joindre le peer :
```bash
# Copier le block résultant et lancer peer channel join
```

> 💡 **Astuce** : Pour simplifier, encapsuler ces commandes dans un script `scripts/join-channel.sh`.

---

## Validation

```bash
# Le peer doit avoir rejoint le channel
docker logs peer0.org1.example.com 2>&1 | grep -i "joined channel"

# Doit afficher : "Joined channel [backupchannel]"
```

Tous les conteneurs doivent être en `Up` :
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

---

## Erreurs possibles

Voir [troubleshooting.md](../troubleshooting.md) section "Réseau Hyperledger Fabric".

---

## Action de fin de phase

1. Cocher la case dans [docs/roadmap.md](../roadmap.md)
2. Mettre à jour CLAUDE.md ("État actuel" + "Prochaine action")
3. Commiter : `git commit -m "feat: phase 1 - réseau Fabric local minimal"`
4. Passer à la [Phase 2](phase-02.md)