# Phase 2 — Chaincode minimal

**Objectif** : Déployer un smart contract Node.js qui enregistre, lit et vérifie les sauvegardes.

**Durée estimée** : 2 à 3 heures.

**Prérequis** : Phase 1 complétée et validée.

---

## Étapes

### 1. Initialiser le projet chaincode

```bash
cd chaincode
npm init -y
npm install fabric-contract-api fabric-shim
```

### 2. Créer `chaincode/lib/backup-contract.js`

Implémenter les méthodes minimales :
- `initLedger(ctx)` — initialisation
- `registerBackup(ctx, backupId, cid, fileName, fileHash, fileSize, mimeType)`
- `getBackup(ctx, backupId)`
- `getAllBackups(ctx)`
- `verifyIntegrity(ctx, backupId, providedHash)`
- `getBackupsByOwner(ctx)` — utilise `getCreator()` pour filtrer

Chaque opération sensible doit émettre un événement (`ctx.stub.setEvent`) pour permettre l'audit.

Voir [docs/architecture.md](../architecture.md) section "Modèle de données" pour la structure exacte de `BackupEntry`.

### 3. Créer `chaincode/index.js`

```javascript
'use strict';
const BackupContract = require('./lib/backup-contract');
module.exports.BackupContract = BackupContract;
module.exports.contracts = [BackupContract];
```

### 4. Créer le script de déploiement `network/scripts/deploy-chaincode.sh`

Le script enchaîne les commandes Fabric 2.x :
```
peer lifecycle chaincode package
peer lifecycle chaincode install
peer lifecycle chaincode approveformyorg
peer lifecycle chaincode commit
```

Avec gestion de la version et de la séquence (incrémenter à chaque mise à jour).

### 5. Tester le chaincode

```bash
# Enregistrement
peer chaincode invoke -C backupchannel -n backup-cc \
  -c '{"function":"registerBackup","Args":["b001","QmXxx","test.pdf","abc123hash","1024","application/pdf"]}' \
  --tls --cafile <ca-cert>

# Lecture
peer chaincode query -C backupchannel -n backup-cc \
  -c '{"function":"getBackup","Args":["b001"]}'

# Vérification
peer chaincode invoke -C backupchannel -n backup-cc \
  -c '{"function":"verifyIntegrity","Args":["b001","abc123hash"]}'
# → true

peer chaincode invoke -C backupchannel -n backup-cc \
  -c '{"function":"verifyIntegrity","Args":["b001","wronghash"]}'
# → false
```

---

## Validation

- [ ] Le chaincode est installé sur le peer (`peer lifecycle chaincode queryinstalled`)
- [ ] Le chaincode est commit sur le channel (`peer lifecycle chaincode querycommitted -C backupchannel`)
- [ ] Une sauvegarde peut être enregistrée et relue
- [ ] La vérification d'intégrité retourne `true` pour un bon hash et `false` pour un mauvais

---

## Action de fin de phase

1. Cocher dans [docs/roadmap.md](../roadmap.md)
2. Mettre à jour CLAUDE.md
3. Commiter : `git commit -m "feat: phase 2 - chaincode minimal"`
4. Passer à la [Phase 3](phase-03.md)