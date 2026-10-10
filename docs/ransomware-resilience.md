# Test de résistance aux ransomwares — guide

Deux outils complémentaires prouvent que SecureBackup-Chain résiste aux ransomwares.

| Outil | Fichier | Stack requise | Usage |
|-------|---------|---------------|-------|
| **Lab simulé** | `backend/scripts/ransomware-lab.js` | Aucune (juste Node) | Démo pédagogique immédiate, sans infra |
| **Test LIVE** | `backend/scripts/ransomware-live-test.js` | IPFS + Fabric réels | Preuves palpables contre la vraie stack |

---

## 1. Lab simulé — démonstration instantanée

Aucune installation, aucun service. Idéal pour expliquer le principe.

```bash
cd backend
npm run lab:ransomware        # ou : node scripts/ransomware-lab.js
```

Il rejoue 4 attaques (chiffrement local, altération, vérification d'un corrompu,
lecture des octets) en réutilisant les **vraies fonctions** de `src/services/crypto.js`.

---

## 2. Test LIVE — preuves contre la vraie stack

### Prérequis

1. `cd backend && npm install`
2. Un `backend/.env` valide (au minimum `MASTER_KEY`, `IPFS_API_URL`, `FABRIC_*`).
3. Le réseau Fabric démarré : `crypto-config` généré, chaincode `backup-cc` déployé,
   wallet admin importé.
4. IPFS joignable.

> Le script commence par un **préflight** : si IPFS ou Fabric ne répond pas, il
> s'arrête avec un message clair indiquant quoi corriger.

### Lancer

```bash
cd backend
npm run test:ransomware       # ou : node scripts/ransomware-live-test.js
```

### Ce qui se produit

1. Génère un fichier témoin (données bancaires sensibles).
2. Le sauvegarde **pour de vrai** → obtient un **CID IPFS réel** + un **txId Fabric**.
3. Rejoue 4 scénarios d'attaque en interrogeant la vraie stack.
4. Génère deux **preuves palpables** dans `backend/proofs/` :
   - `ransomware-report-<ts>.json` — rapport technique structuré
   - `ransomware-cert-<ts>.pdf` — certificat lisible, à montrer en réunion

### Les 4 scénarios LIVE

| # | Attaque | Garantie démontrée | Preuve on-chain / IPFS |
|---|---------|--------------------|------------------------|
| 1 | Ransomware chiffre les fichiers locaux | Restauration depuis IPFS + `verifyIntegrity`=true | CID + `getBackup` |
| 2 | Altération d'un octet du contenu stocké | CID = empreinte → altération non substituable | CID recalculé ≠ CID ancré |
| 3 | Fichier rançonné soumis à vérification | `verifyIntegrity`=false → corruption bloquée | rejet on-chain |
| 4 | Lecture directe des octets IPFS | AES-256 au repos → illisible sans `MASTER_KEY` | octets chiffrés |

---

## 3. Vérifier les preuves indépendamment

Le certificat PDF contient les commandes exactes. En résumé :

- **CID IPFS** : ouvrir `${IPFS_GATEWAY_URL}/ipfs/<CID>` → les octets sont illisibles (chiffrés).
- **Hash Fabric** : `peer chaincode query … getBackup <backupId>` → le champ `fileHash` est immuable.
- **Intégrité** : `verifyIntegrity <backupId> <hash du fichier restauré>` → true si intact, false si altéré.

---

## Note

Le dossier `backend/proofs/` est ignoré par Git (contient des données de test).
Ne committe ni les rapports ni les certificats générés.
