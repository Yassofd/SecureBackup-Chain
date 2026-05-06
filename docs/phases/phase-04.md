# Phase 4 — Backend API minimal

**Objectif** : Avoir une API Express qui orchestre Fabric et IPFS pour les opérations de sauvegarde de base.

**Durée estimée** : 4 à 6 heures.

**Prérequis** : Phases 1, 2, 3 complétées et validées.

---

## Étapes

### 1. Initialiser le projet

```bash
cd backend
npm init -y
npm install express cors dotenv fabric-network ipfs-http-client multer crypto-js bcrypt jsonwebtoken zod
npm install -D nodemon jest supertest eslint prettier
```

### 2. Configurer `package.json`

```json
{
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "test": "jest",
    "lint": "eslint src/"
  }
}
```

### 3. Structure des fichiers

```
backend/
├── src/
│   ├── server.js                 Point d'entrée
│   ├── app.js                    Configuration Express
│   ├── config/
│   │   ├── connection-org1.json  Profil Fabric
│   │   └── env.js                Chargement des variables
│   ├── services/
│   │   ├── fabric.js             Wrapper SDK Fabric
│   │   ├── ipfs.js               Wrapper IPFS
│   │   └── crypto.js             Hash et chiffrement
│   ├── routes/
│   │   ├── backups.js
│   │   └── health.js
│   ├── middleware/
│   │   ├── error-handler.js
│   │   └── validate.js
│   └── utils/
│       └── logger.js
├── scripts/
│   └── enroll-admin.js           Enrôlement initial CA
└── wallet/                        (généré, ignoré par git)
```

### 4. Implémenter les services

**`services/crypto.js`** — `sha256(buffer)`, `encryptAES(buffer, key)`, `decryptAES(buffer, key)`.

**`services/ipfs.js`** — wrapper autour de `ipfs-http-client`. Méthodes : `add(buffer)`, `cat(cid)`, `pin(cid)`.

**`services/fabric.js`** — gestion du wallet, création du gateway, méthodes `submitTransaction(fn, ...args)` et `evaluateTransaction(fn, ...args)`.

### 5. Enrôlement de l'admin Fabric

Script `scripts/enroll-admin.js` qui :
1. Se connecte à la CA
2. Enrôle l'admin (`admin/adminpw`)
3. Stocke l'identité dans `wallet/`

```bash
node scripts/enroll-admin.js
```

### 6. Implémenter les endpoints

**`POST /api/backups`** (upload local)
- Multer reçoit le fichier
- Calcul du hash SHA-256
- Chiffrement AES-256
- Push IPFS → CID
- Submit Fabric `registerBackup`
- Retour : `{ backupId, cid, txId }`

**`GET /api/backups`** — liste via `getAllBackups` (ou par owner)

**`GET /api/backups/:id`** — détails via `getBackup`

**`POST /api/backups/:id/verify`** — vérification d'intégrité

**`GET /api/backups/:id/download`** — récupération IPFS + déchiffrement + envoi du fichier

**`GET /api/health`** — état des services (Fabric, IPFS)

### 7. Lancer et tester

```bash
npm run dev
```

Tests manuels avec curl :
```bash
# Upload
curl -X POST -F file=@test.pdf http://localhost:3000/api/backups

# Liste
curl http://localhost:3000/api/backups

# Détails
curl http://localhost:3000/api/backups/<id>

# Vérification (recalculer le hash du fichier)
curl -X POST -F file=@test.pdf http://localhost:3000/api/backups/<id>/verify

# Téléchargement
curl http://localhost:3000/api/backups/<id>/download -o restored.pdf
```

### 8. Tests automatisés

Créer `tests/backups.test.js` avec Jest et Supertest pour les endpoints critiques.

---

## Validation

- [ ] `npm run dev` lance l'API sans erreur sur le port 3000
- [ ] `GET /api/health` retourne `{ fabric: "ok", ipfs: "ok" }`
- [ ] Un fichier uploadé via `POST /api/backups` est accessible dans IPFS
- [ ] Les métadonnées sont enregistrées sur Fabric (vérifiable via CLI peer)
- [ ] Le téléchargement restaure le fichier original (mêmes octets)
- [ ] La vérification d'intégrité retourne `true` pour le fichier original
- [ ] La vérification d'intégrité retourne `false` pour un fichier modifié
- [ ] Les tests Jest passent

---

## Action de fin de phase

1. Cocher dans [docs/roadmap.md](../roadmap.md)
2. Mettre à jour CLAUDE.md
3. Commiter : `git commit -m "feat: phase 4 - backend API minimal"`
4. Passer à la [Phase 5](phase-05.md)