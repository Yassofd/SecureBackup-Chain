# Phase 24 — Multi-organisation Fabric (banque + auditeur)

**Objectif** : Ajouter une deuxième organisation Hyperledger Fabric représentant l'auditeur externe ou le régulateur. Toute opération critique (enregistrement de backup, suppression) doit être co-signée par les deux organisations — ni la banque ni l'auditeur ne peut agir seul.

**Durée estimée** : 1 à 2 semaines.

**Prérequis** : Phase 23 complétée.

**Pourquoi c'est requis pour une banque** :
- Bâle III / DORA : séparation des pouvoirs entre l'opérateur du système et l'auditeur
- Preuve d'intégrité opposable : l'auditeur co-signe chaque backup → la banque ne peut pas modifier le ledger sans l'accord de l'auditeur
- Politique d'endorsement `AND('BanqueMSP.peer', 'AuditeurMSP.peer')` : les deux doivent valider chaque transaction

---

## Architecture cible

```
Org1 (Banque)                Org2 (Auditeur/Régulateur)
──────────────               ──────────────────────────
peer0.banque.com:7051        peer0.auditeur.com:7151
CA banque:7054               CA auditeur:7154

                 Orderer (Raft, partagé)
                 orderer.example.com:7050

Channel : backupchannel
Policy : AND('Org1MSP.peer', 'Org2MSP.peer')
```

---

## Étapes

### 1. Modifier `network/crypto-config.yaml`

Ajouter Org2 :

```yaml
PeerOrgs:
  - Name: Org1
    Domain: org1.example.com
    # ... inchangé ...

  - Name: Org2
    Domain: org2.example.com
    EnableNodeOUs: true
    Template:
      Count: 1
      SANS:
        - localhost
    Users:
      Count: 1
```

Régénérer les certificats :
```bash
cd network
cryptogen generate --config=./crypto-config.yaml
```

**⚠️ Attention** : régénérer les certificats invalide tous les certificats existants. À faire uniquement sur un environnement de développement ou lors d'une installation fraîche en production.

### 2. Modifier `network/configtx.yaml`

Ajouter la définition d'Org2 et mettre à jour la politique d'endorsement :

```yaml
  - &Org2
    Name: Org2MSP
    ID: Org2MSP
    MSPDir: crypto-config/peerOrganizations/org2.example.com/msp
    Policies:
      Readers:
        Type: Signature
        Rule: "OR('Org2MSP.admin', 'Org2MSP.peer', 'Org2MSP.client')"
      Writers:
        Type: Signature
        Rule: "OR('Org2MSP.admin', 'Org2MSP.client')"
      Admins:
        Type: Signature
        Rule: "OR('Org2MSP.admin')"
      Endorsement:
        Type: Signature
        Rule: "OR('Org2MSP.peer')"
    AnchorPeers:
      - Host: peer0.org2.example.com
        Port: 7151

# Dans le profil BackupChannel, modifier la politique d'endorsement :
  BackupChannel:
    Application:
      Organizations:
        - *Org1
        - *Org2
      Policies:
        Endorsement:
          Type: Signature
          Rule: "AND('Org1MSP.peer', 'Org2MSP.peer')"  # Co-signature obligatoire
```

### 3. Ajouter le peer Org2 dans `docker-compose.yml`

```yaml
ca.org2.example.com:
  image: hyperledger/fabric-ca:1.5.7
  environment:
    - FABRIC_CA_HOME=/etc/hyperledger/fabric-ca-server
    - FABRIC_CA_SERVER_CA_NAME=ca-org2
    - FABRIC_CA_SERVER_TLS_ENABLED=true
    - FABRIC_CA_SERVER_PORT=7154
  ports:
    - "7154:7154"
  container_name: ca.org2.example.com

couchdb1:
  image: couchdb:3.3
  environment:
    - COUCHDB_USER=admin
    - COUCHDB_PASSWORD=adminpw
  container_name: couchdb1

peer0.org2.example.com:
  image: hyperledger/fabric-peer:2.5.4
  environment:
    - CORE_PEER_ID=peer0.org2.example.com
    - CORE_PEER_ADDRESS=peer0.org2.example.com:7151
    - CORE_PEER_LISTENADDRESS=0.0.0.0:7151
    - CORE_PEER_LOCALMSPID=Org2MSP
    - CORE_LEDGER_STATE_STATEDATABASE=CouchDB
    - CORE_LEDGER_STATE_COUCHDBCONFIG_COUCHDBADDRESS=couchdb1:5984
    # ... TLS identique à Org1 ...
  ports:
    - "7151:7151"
  container_name: peer0.org2.example.com
```

### 4. Modifier le connection profile `backend/config/connection-org1.json`

Ajouter Org2 dans le connection profile pour que le SDK Fabric puisse contacter les deux peers :

```json
{
  "organizations": {
    "Org1MSP": {
      "mspid": "Org1MSP",
      "peers": ["peer0.org1.example.com"]
    },
    "Org2MSP": {
      "mspid": "Org2MSP",
      "peers": ["peer0.org2.example.com"]
    }
  },
  "peers": {
    "peer0.org1.example.com": {
      "url": "grpcs://peer0.org1.example.com:7051"
    },
    "peer0.org2.example.com": {
      "url": "grpcs://peer0.org2.example.com:7151"
    }
  }
}
```

### 5. Modifier `backend/src/services/fabric.js` — endossement multi-org

Avec le SDK Fabric Gateway (v1.x), l'endossement multi-org est automatique si le connection profile liste les deux peers et que la politique `AND(...)` est définie dans le chaincode.

Vérifier que le gateway se connecte bien avec les deux peers dans la collection d'endorsement :

```javascript
// Dans submitTransaction, ajouter l'option endorsingOrganizations si nécessaire
const result = await contract.submit(fcn, {
  arguments: args,
  endorsingOrganizations: ['Org1MSP', 'Org2MSP'], // forcer les deux orgs
});
```

### 6. Interface admin — statut de chaque organisation

Ajouter `GET /api/network/orgs` :

```javascript
router.get('/orgs', async (req, res, next) => {
  try {
    // Vérifier que les peers des deux orgs répondent
    const orgs = [
      { name: 'Org1MSP', peer: 'peer0.org1.example.com:7051', role: 'Banque' },
      { name: 'Org2MSP', peer: 'peer0.org2.example.com:7151', role: 'Auditeur' },
    ];

    const statuses = await Promise.all(orgs.map(async (org) => {
      try {
        await fabric.evaluateTransaction('getHealth'); // ping léger
        return { ...org, status: 'online' };
      } catch {
        return { ...org, status: 'offline' };
      }
    }));

    res.json(statuses);
  } catch (err) { next(err); }
});
```

Afficher dans la page Network du frontend avec indicateurs de statut pour chaque org.

### 7. Mettre à jour `network/scripts/deploy-chaincode.sh`

```bash
# Approuver le chaincode pour Org1
CORE_PEER_LOCALMSPID=Org1MSP peer lifecycle chaincode approveformyorg ...

# Approuver pour Org2 (peer Org2)
CORE_PEER_LOCALMSPID=Org2MSP \
CORE_PEER_ADDRESS=peer0.org2.example.com:7151 \
peer lifecycle chaincode approveformyorg ...

# Committer (nécessite les deux approbations)
peer lifecycle chaincode commit \
  --peerAddresses peer0.org1.example.com:7051 \
  --peerAddresses peer0.org2.example.com:7151 \
  --tlsRootCertFiles ... \
  ...
```

---

## Validation

- [ ] `docker ps` : 10 conteneurs actifs (orderer, peer0 Org1, peer0 Org2, CA×2, CouchDB×2, IPFS, cluster, backend)
- [ ] `peer channel getinfo -c backupchannel` depuis les deux peers → même block height
- [ ] Uploader un fichier → transaction sur le ledger co-signée par Org1MSP + Org2MSP (vérifier dans les logs du peer Org2)
- [ ] Arrêter le peer Org2 → tentative de backup → erreur `ENDORSEMENT_POLICY_FAILURE` (la co-signature est exigée)
- [ ] `GET /api/network/orgs` retourne les statuts des deux organisations
- [ ] Chaincode version 1.3 sequence 4 déployé et approuvé par les deux orgs

---

## Action de fin de phase

1. Cocher dans [docs/Roadmap.md](../Roadmap.md)
2. Mettre à jour CLAUDE.md
3. `git commit -m "feat: phase 24 - multi-org Fabric banque + auditeur"`
4. Passer à la [Phase 25](phase-25.md)
