# Phase 18 — Compression zstd dans le pipeline

**Objectif** : Insérer une étape de compression zstd entre la réception des données et le chiffrement AES, afin de réduire le volume stocké et transféré de 60 à 80 % sur des données bancaires typiques (logs, XML, JSON, CSV).

**Durée estimée** : 3 à 5 heures.

**Prérequis** : Phase 17 complétée. Pipeline AES+IPFS fonctionnel.

**Impact attendu** :
- 200 To/jour de données brutes → ~40–80 To après compression
- Temps de sauvegarde divisé par 2 à 5 selon le type de données
- Coût de stockage IPFS réduit proportionnellement

---

## Contexte technique

L'ordre impératif du pipeline est :

```
données brutes → zstd compress → AES-256-CBC encrypt → IPFS
```

**Pourquoi compresser AVANT de chiffrer** : les données chiffrées ont une entropie maximale (pseudo-aléatoires) et sont incompressibles. Compresser après chiffrement ne donne rien.

**Pourquoi zstd et pas gzip** :
- zstd niveau 3 : ~500 Mo/s en compression sur un seul cœur (gzip : ~100 Mo/s)
- Ratio similaire ou supérieur à gzip
- Décompression très rapide (~1,5 Go/s)
- Bibliothèque Node.js native : `@mongodb-js/zstd` ou `fzstd`

---

## Étapes

### 1. Installer la dépendance

```bash
cd backend
npm install @mongodb-js/zstd
```

Vérifier que le build natif fonctionne dans l'image Docker :
```bash
docker compose build backend
docker compose run --rm backend node -e "require('@mongodb-js/zstd'); console.log('zstd OK')"
```

### 2. Modifier `backend/src/services/crypto.js` — ajouter `createCompressEncryptStream`

Lire le fichier actuel, puis ajouter après la fonction `createEncryptStream` existante :

```javascript
const { compress } = require('@mongodb-js/zstd');
const { Transform } = require('stream');

// Stream transform qui compresse par blocs de 1 Mo avec zstd niveau 3.
// Produit un format framed : [4 octets taille compressée][données compressées]...
// Le décompresseur côté restauration lit ce format pour reconstituer le flux original.
function createZstdCompressStream() {
  const BLOCK_SIZE = 1 * 1024 * 1024; // 1 Mo par bloc
  let buf = Buffer.alloc(0);

  return new Transform({
    async transform(chunk, _enc, cb) {
      buf = Buffer.concat([buf, chunk]);
      const out = [];
      while (buf.length >= BLOCK_SIZE) {
        const block = buf.slice(0, BLOCK_SIZE);
        buf = buf.slice(BLOCK_SIZE);
        const compressed = await compress(block, 3);
        const header = Buffer.alloc(4);
        header.writeUInt32BE(compressed.length, 0);
        out.push(header, compressed);
      }
      if (out.length) this.push(Buffer.concat(out));
      cb();
    },
    async flush(cb) {
      if (buf.length > 0) {
        const compressed = await compress(buf, 3);
        const header = Buffer.alloc(4);
        header.writeUInt32BE(compressed.length, 0);
        this.push(Buffer.concat([header, compressed]));
      }
      cb();
    },
  });
}

function createZstdDecompressStream() {
  const { decompress } = require('@mongodb-js/zstd');
  let buf = Buffer.alloc(0);

  return new Transform({
    async transform(chunk, _enc, cb) {
      buf = Buffer.concat([buf, chunk]);
      const out = [];
      while (buf.length >= 4) {
        const blockSize = buf.readUInt32BE(0);
        if (buf.length < 4 + blockSize) break;
        const compressed = buf.slice(4, 4 + blockSize);
        buf = buf.slice(4 + blockSize);
        const decompressed = await decompress(compressed);
        out.push(decompressed);
      }
      if (out.length) this.push(Buffer.concat(out));
      cb();
    },
  });
}

module.exports = {
  // ... exports existants ...
  createZstdCompressStream,
  createZstdDecompressStream,
};
```

### 3. Modifier `backend/src/routes/backups.js` — intégrer la compression

Dans la route `POST /` (upload multipart busboy), modifier le pipeline :

```javascript
// Avant (Phase 17) :
const { stream: encStream, getHash, getSize } = createEncryptStream(fileStream, env.MASTER_KEY);

// Après (Phase 18) :
const zstdStream = createZstdCompressStream();
fileStream.pipe(zstdStream);
const { stream: encStream, getHash, getSize } = createEncryptStream(zstdStream, env.MASTER_KEY);
```

Dans la route `POST /chunks/:uploadId` (chunked upload), modifier l'initialisation du premier chunk :

```javascript
// Avant :
const { stream: encStream, getHash, getSize } = createEncryptStream(passthrough, env.MASTER_KEY);

// Après :
const zstdStream = createZstdCompressStream();
passthrough.pipe(zstdStream);
const { stream: encStream, getHash, getSize } = createEncryptStream(zstdStream, env.MASTER_KEY);
```

### 4. Stocker un flag de compression dans les métadonnées Fabric

Modifier le chaincode `chaincode/lib/backup-contract.js` pour ajouter un champ `compressed` :

```javascript
// Dans registerBackup :
async registerBackup(ctx, backupId, cid, filename, fileHash, size, mimeType, compressed) {
  const backup = {
    backupId, cid, filename, fileHash,
    size: parseInt(size),
    mimeType,
    compressed: compressed === 'true',  // nouveau champ
    createdAt: new Date().toISOString(),
    status: 'active',
  };
  await ctx.stub.putState(backupId, Buffer.from(JSON.stringify(backup)));
  return backup;
}
```

Incrémenter la version du chaincode avant de le redéployer :
```bash
# Dans deploy-chaincode.sh, changer --version 1.0 → --version 1.1 et --sequence 1 → --sequence 2
```

### 5. Modifier la restauration — décompresser après déchiffrement

Dans la route de téléchargement `GET /api/backups/:id/download` :

```javascript
// Pipeline de restauration :
// IPFS → déchiffrement AES → décompression zstd → réponse HTTP

const ipfsStream = await ipfs.getStream(backup.cid);
const decStream  = createDecryptStream(ipfsStream, env.MASTER_KEY);

if (backup.compressed) {
  const zstdDecomp = createZstdDecompressStream();
  decStream.pipe(zstdDecomp);
  zstdDecomp.pipe(res);
} else {
  decStream.pipe(res); // compatibilité fichiers anciens non compressés
}
```

### 6. Mettre à jour le Dockerfile backend

```dockerfile
# Assurer que les outils de build natif sont disponibles pour @mongodb-js/zstd
RUN apk add --no-cache python3 make g++
```

### 7. Tester

```bash
# Test de compression sur un fichier texte (ratio élevé)
echo "$(cat /dev/urandom | head -c 0; python3 -c "print('TRANSACTION;12345;CREDIT;EUR;1000.00\n' * 100000)")" > /tmp/transactions.csv

curl -s -X POST http://localhost:80/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@securebackup.local","password":"<mot de passe>"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])" > /tmp/token.txt

TOKEN=$(cat /tmp/token.txt)

# Upload et mesurer le CID (taille sur IPFS)
curl -s -X POST http://localhost:80/api/backups \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/tmp/transactions.csv" | python3 -m json.tool

# Comparer la taille du fichier d'entrée vs taille stockée dans Fabric
ls -lh /tmp/transactions.csv
```

Vérifier dans les logs backend que le pipeline passe bien par zstd.

---

## Validation

- [ ] Upload d'un fichier CSV 100 Mo → taille stockée dans IPFS < 20 Mo (ratio > 5:1)
- [ ] Restauration du fichier → contenu identique au fichier d'origine (hash SHA-256 identique)
- [ ] Upload d'un fichier binaire aléatoire → taille stockée ≈ taille d'entrée (pas de décompression négative)
- [ ] Anciens fichiers sans `compressed: true` se restaurent correctement (compatibilité)
- [ ] Chaincode version 1.1, sequence 2 déployé avec succès

---

## Action de fin de phase

1. Cocher dans [docs/Roadmap.md](../Roadmap.md)
2. Mettre à jour CLAUDE.md → Phase 19 en cours
3. `git commit -m "feat: phase 18 - compression zstd dans le pipeline AES+IPFS"`
4. Passer à la [Phase 19](phase-19.md)
