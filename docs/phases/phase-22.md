# Phase 22 — Déduplication CDC + backup incrémental

**Objectif** : Ne transférer et stocker que les blocs de données qui ont réellement changé depuis le dernier backup. Sur des données bancaires (logs, CSV, XML), 70 à 90 % des blocs sont identiques d'un jour sur l'autre — la déduplication réduit le volume à transférer et à stocker dans les mêmes proportions.

**Durée estimée** : 1 à 2 semaines.

**Prérequis** : Phase 21 complétée.

**Impact attendu** :
- 200 To de données brutes/jour → 20–60 To nouveaux blocs réels après dédup
- IPFS stocke nativement les blocs par hash (Content ID) — les blocs identiques ne sont jamais dupliqués
- Le delta quotidien à transférer peut passer de 200 To → 20 To

---

## Concepts clés

### CDC — Content-Defined Chunking

Contrairement au découpage à taille fixe (CHUNK_SIZE = 5 Mo), le CDC découpe en cherchant des **points de coupure naturels** dans le flux de données via un hash glissant (Rabin fingerprint ou Buzhash). Avantage : si 10 octets sont insérés au début d'un fichier, seul le premier bloc change — les blocs suivants restent identiques et sont reconnus par le système de dédup.

```
Fichier jour J   : [bloc A][bloc B][bloc C][bloc D]
Fichier jour J+1 : [bloc A][bloc B'][bloc C][bloc D]  ← seul B a changé
→ Transfert : bloc B' uniquement (les 3 autres sont déjà dans IPFS)
```

### IPFS + déduplication gratuite

IPFS est déjà un système de stockage par contenu adressable (CID = hash du contenu). Si deux blocs identiques sont ajoutés, ils ont le même CID et ne sont stockés qu'une fois. La dédup est donc **gratuite côté stockage** dès lors qu'on utilise CDC.

---

## Étapes

### 1. Installer `rabin-wasm` (CDC côté agent)

```bash
cd agent
npm install rabin-wasm
```

`rabin-wasm` implémente l'algorithme de Rabin fingerprinting en WebAssembly, compatible Node.js. Utilisé par restic, Borgbackup, FastCDC.

### 2. Créer `agent/src/cdc.js` — découpage par contenu

```javascript
'use strict';
const { Rabin } = require('rabin-wasm');

const MIN_CHUNK = 512  * 1024;  // 512 Ko min
const AVG_CHUNK = 2   * 1024 * 1024;  // 2 Mo cible
const MAX_CHUNK = 16  * 1024 * 1024;  // 16 Mo max

// Lit un stream et émet des chunks de taille variable basés sur Rabin fingerprint.
// Chaque chunk émis est un Buffer avec ses propres limites naturelles.
async function* cdcChunks(readableStream) {
  const rabin = await Rabin.create(AVG_CHUNK, MIN_CHUNK, MAX_CHUNK);
  let buf = Buffer.alloc(0);

  for await (const data of readableStream) {
    buf = Buffer.concat([buf, data]);

    let offset = 0;
    while (offset < buf.length) {
      const cutpoint = rabin.nextCutpoint(buf, offset);
      if (cutpoint === -1 || cutpoint - offset < MIN_CHUNK) break;
      yield buf.slice(offset, cutpoint);
      offset = cutpoint;
    }
    buf = buf.slice(offset);
  }

  if (buf.length > 0) yield buf;
}

module.exports = { cdcChunks };
```

### 3. Créer `backend/src/services/dedup.js` — vérifier si un bloc existe déjà

```javascript
'use strict';
const db  = require('./db');
const ipfs = require('./ipfs');

// Vérifie si un bloc (identifié par son hash SHA-256) est déjà dans IPFS.
// Retourne le CID existant ou null.
async function findExistingBlock(blockHash) {
  const existing = await db.dedupBlock.findUnique({
    where: { hash: blockHash },
    select: { cid: true },
  });
  return existing?.cid ?? null;
}

// Enregistre un nouveau bloc en base après upload dans IPFS.
async function registerBlock(blockHash, cid, size) {
  await db.dedupBlock.upsert({
    where:  { hash: blockHash },
    update: { refCount: { increment: 1 } },
    create: { hash: blockHash, cid, size, refCount: 1 },
  });
}

module.exports = { findExistingBlock, registerBlock };
```

### 4. Ajouter le modèle Prisma `DedupBlock`

Dans `backend/prisma/schema.prisma`, ajouter :

```prisma
model DedupBlock {
  id        Int      @id @default(autoincrement())
  hash      String   @unique  // SHA-256 du bloc (avant chiffrement)
  cid       String            // CID IPFS du bloc chiffré
  size      Int               // taille en octets (bloc non compressé)
  refCount  Int      @default(1)
  createdAt DateTime @default(now())

  @@index([hash])
}
```

Générer la migration :
```bash
cd backend
npx prisma migrate dev --name add_dedup_blocks
```

### 5. Modifier le pipeline d'ingestion — upload bloc par bloc avec dédup

Dans `backend/src/routes/minio-events.js` (ou la route de chunked upload), remplacer le pipeline monolithique par un pipeline bloc par bloc :

```javascript
const { createHash } = require('crypto');
const { findExistingBlock, registerBlock } = require('../services/dedup');
const { createZstdCompressStream } = require('../services/crypto');

// Pipeline de déduplication :
// Pour chaque bloc CDC :
//   1. Calculer SHA-256 du bloc (clair, avant compression+chiffrement)
//   2. Si le bloc existe déjà dans IPFS → réutiliser le CID
//   3. Sinon → compresser + chiffrer + uploader dans IPFS + enregistrer en base

async function ingestWithDedup(sourceStream, filename, userId) {
  const blockCids = [];
  let totalSize = 0;
  let dedupedBytes = 0;

  for await (const block of cdcChunks(sourceStream)) {
    const blockHash = createHash('sha256').update(block).digest('hex');
    totalSize += block.length;

    const existingCid = await findExistingBlock(blockHash);
    if (existingCid) {
      blockCids.push(existingCid);
      dedupedBytes += block.length;
      continue; // bloc déjà stocké — aucun transfert
    }

    // Nouveau bloc : compresser + chiffrer + uploader
    const compressed = await compress(block, 3);
    const encrypted  = encryptBlock(compressed, env.MASTER_KEY);
    const cid        = await ipfs.addBuffer(encrypted, `${filename}-block-${blockHash.slice(0, 8)}`);

    await registerBlock(blockHash, cid, block.length);
    blockCids.push(cid);
  }

  // Créer un manifeste IPFS : liste ordonnée des CIDs des blocs
  const manifest = JSON.stringify({ filename, blockCids, totalSize, createdAt: new Date().toISOString() });
  const manifestCid = await ipfs.addBuffer(Buffer.from(manifest), `${filename}.manifest`);

  const ratio = totalSize > 0 ? ((dedupedBytes / totalSize) * 100).toFixed(1) : 0;
  console.log(`Dédup : ${ratio}% des données réutilisées depuis le cache`);

  return { manifestCid, totalSize, dedupedBytes };
}
```

### 6. Stocker le manifeste dans Fabric

Modifier `registerBackup` dans le chaincode pour accepter un type `manifest` :

```javascript
// Le CID stocké dans Fabric est désormais le CID du manifeste, pas du fichier brut.
// Le manifeste contient la liste ordonnée des blocs.
const entry = await fabric.submitTransaction(
  'registerBackup',
  backupId, manifestCid, filename, manifestHash, String(totalSize), mimeType, 'manifest-v1',
);
```

### 7. Restauration depuis le manifeste

Dans `GET /api/backups/:id/download` :

```javascript
// 1. Récupérer le manifeste depuis IPFS
const manifestBuffer = await ipfs.getBuffer(backup.cid);
const manifest = JSON.parse(manifestBuffer.toString());

// 2. Pour chaque bloc dans l'ordre → déchiffrer → décompresser → pipe vers réponse
res.setHeader('Content-Disposition', `attachment; filename="${manifest.filename}"`);

for (const blockCid of manifest.blockCids) {
  const encryptedBlock = await ipfs.getBuffer(blockCid);
  const decrypted      = decryptBlock(encryptedBlock, env.MASTER_KEY);
  const decompressed   = await decompress(decrypted);
  res.write(decompressed);
}
res.end();
```

### 8. Interface — afficher les statistiques de déduplication

Dans `frontend/src/pages/Dashboard.jsx`, ajouter une carte :

```jsx
<StatCard
  label="Ratio de déduplication"
  value={`${dedupRatio}%`}
  subtitle="données réutilisées depuis le cache"
  icon={<Layers />}
  color="purple"
/>
```

Ajouter `GET /api/admin/dedup-stats` côté backend :
```javascript
const stats = await db.dedupBlock.aggregate({
  _sum: { size: true },
  _count: { id: true },
});
// Comparer avec la somme totale des tailles de backup pour calculer le ratio
```

---

## Validation

- [ ] Uploader le même fichier 3 fois → 3 entrées Fabric → 1 seule copie dans IPFS (vérifier via `ipfs pin ls`)
- [ ] Uploader un fichier puis une version modifiée à 10 % → seuls les blocs modifiés sont re-uploadés (90 % de dédup)
- [ ] Restauration d'un fichier dédupliqué → contenu identique à l'original (hash SHA-256)
- [ ] `GET /api/admin/dedup-stats` retourne le ratio de déduplication global
- [ ] Performance : ingestion d'un fichier 10 Go → temps réduit de > 50 % par rapport à Phase 21 si le fichier est similaire à un précédent

---

## Action de fin de phase

1. Cocher dans [docs/Roadmap.md](../Roadmap.md)
2. Mettre à jour CLAUDE.md
3. `git commit -m "feat: phase 22 - déduplication CDC et backup incrémental"`
4. Passer à la [Phase 23](phase-23.md)
