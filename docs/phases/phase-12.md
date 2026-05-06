# Phase 12 — Cluster Raft pour les orderers

**Objectif** : Passer d'un orderer unique à un cluster de 3 orderers.

**Prérequis** : Phase 11 complétée.

---

## Étapes principales

### 1. Mettre à jour `crypto-config.yaml`

```yaml
OrdererOrgs:
  - Name: Orderer
    Domain: example.com
    EnableNodeOUs: true
    Specs:
      - Hostname: orderer1
      - Hostname: orderer2
      - Hostname: orderer3
```

Régénérer les certificats : `cryptogen generate --config=./crypto-config.yaml`

### 2. Mettre à jour `configtx.yaml`

Section `Orderer.EtcdRaft.Consenters` avec les 3 hôtes :
```yaml
EtcdRaft:
  Consenters:
    - Host: orderer1.example.com
      Port: 7050
      ClientTLSCert: ...orderer1.../tls/server.crt
      ServerTLSCert: ...orderer1.../tls/server.crt
    - Host: orderer2.example.com
      Port: 7050
      ClientTLSCert: ...orderer2.../tls/server.crt
      ServerTLSCert: ...orderer2.../tls/server.crt
    - Host: orderer3.example.com
      Port: 7050
      ClientTLSCert: ...orderer3.../tls/server.crt
      ServerTLSCert: ...orderer3.../tls/server.crt

Addresses:
  - orderer1.example.com:7050
  - orderer2.example.com:7050
  - orderer3.example.com:7050
```

Régénérer le genesis block : `configtxgen -profile OrdererGenesis ...`

### 3. docker-compose-orderers.yaml

Trois services orderer1, orderer2, orderer3 avec :
- Ports 7050, 8050, 9050 (mapping différent pour le développement local)
- Volumes distincts
- Mêmes variables d'environnement adaptées au hostname

### 4. Mettre à jour la connection profile

Le `connection-org1.json` doit lister les 3 orderers dans la section `orderers`.

### 5. Tester le basculement

```bash
# Identifier le leader
docker logs orderer1.example.com 2>&1 | grep -i "Raft leader"

# Stopper le leader
docker stop <leader>

# Vérifier l'élection
docker logs orderer2.example.com 2>&1 | grep -i "became Leader"

# Soumettre une transaction → doit réussir
```

---

## Validation

- [ ] Les 3 orderers démarrent et forment un cluster
- [ ] Un leader est élu
- [ ] Les transactions passent normalement
- [ ] Stopper le leader → nouveau leader élu en moins de 5 secondes
- [ ] Aucune transaction n'est perdue
- [ ] L'orderer redémarré rejoint et se resynchronise

---

## Action de fin de phase

Cocher → CLAUDE.md → commit → [Phase 13](phase-13.md).