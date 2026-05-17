# Phase 21 — MinIO S3 + TLS 1.3 — remplace SSH/SFTP

**Objectif** : Remplacer le protocole SSH/SFTP pour la sauvegarde distante par MinIO (S3-compatible, open source) avec TLS 1.3 et upload multipart parallèle. MinIO peut atteindre 10+ Go/s sur du matériel datacenter, là où SSH plafonne à 200–400 Mo/s.

**Durée estimée** : 1 semaine.

**Prérequis** : Phase 20 complétée.

**Pourquoi MinIO plutôt que SSH/SFTP** :

| Critère | SSH/SFTP actuel | MinIO S3 |
|---------|-----------------|----------|
| Débit max pratique | ~200 Mo/s (1 flux TCP) | 1–10 Go/s (multipart parallèle) |
| Protocole | SSH (années 90) | HTTPS / S3 (standard industrie) |
| Authentification | Mot de passe / clé RSA | Access Key + Secret Key + TLS |
| Multipart upload | Non | Oui (jusqu'à 10 000 parties) |
| Reprise sur erreur | Non | Oui (UploadId + ETag par partie) |
| IAM / politiques | Non | Oui (bucket policies, ACL) |
| Immutabilité WORM | Non | Oui (Object Lock) |
| Chiffrement côté serveur | Non | SSE-S3 / SSE-KMS |
| Standard industrie | Limitée | Oui (AWS S3-compatible) |

---

## Architecture cible

```
Serveur source             MinIO (datacenter banque)      SecureBackup backend
──────────────             ────────────────────────      ───────────────────
données ──► agent ──► PUT multipart TLS 1.3 ──►bucket─► event webhook ──► IPFS + Fabric
```

MinIO joue le rôle de **landing zone sécurisée** : les données arrivent en S3, un webhook notifie le backend SecureBackup qui les ingère dans IPFS+Fabric puis les supprime du bucket.

---

## Étapes

### 1. Ajouter MinIO au `docker-compose.yml`

```yaml
minio:
  image: minio/minio:latest
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: ${MINIO_ROOT_USER}
    MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    MINIO_NOTIFY_WEBHOOK_ENABLE_BACKUP: "on"
    MINIO_NOTIFY_WEBHOOK_ENDPOINT_BACKUP: "http://backend:3000/api/minio/events"
    MINIO_NOTIFY_WEBHOOK_AUTH_TOKEN_BACKUP: ${MINIO_WEBHOOK_SECRET}
  volumes:
    - minio-data:/data
  ports:
    - "9000:9000"   # API S3
    - "9001:9001"   # Console web
  healthcheck:
    test: ["CMD", "mc", "ready", "local"]
    interval: 10s
    timeout: 5s
    retries: 5

volumes:
  minio-data:
```

Ajouter dans `.env` :
```
MINIO_ROOT_USER=securebackup-admin
MINIO_ROOT_PASSWORD=<généré 32 chars>
MINIO_ENDPOINT=http://minio:9000
MINIO_WEBHOOK_SECRET=<généré 32 chars>
MINIO_BUCKET=incoming-backups
```

### 2. Installer le SDK MinIO côté backend

```bash
cd backend
npm install minio
```

### 3. Créer `backend/src/services/minio.js`

```javascript
'use strict';
const Minio = require('minio');
const env   = require('../../config/env');

const client = new Minio.Client({
  endPoint:  env.MINIO_HOST || 'minio',
  port:      parseInt(env.MINIO_PORT || '9000', 10),
  useSSL:    env.MINIO_SSL === 'true',
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

async function ensureBucket(bucket) {
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket, 'us-east-1');
    // Activer la notification webhook sur le bucket
    await client.setBucketNotification(bucket, {
      QueueConfigurations: [],
      TopicConfigurations: [],
      LambdaFunctionConfigurations: [],
    });
  }
}

// Upload un stream vers MinIO avec multipart automatique
async function putStream(bucket, objectName, stream, size, contentType) {
  await client.putObject(bucket, objectName, stream, size, {
    'Content-Type': contentType || 'application/octet-stream',
  });
}

// Récupérer un stream depuis MinIO
async function getStream(bucket, objectName) {
  return client.getObject(bucket, objectName);
}

// Supprimer un objet après ingestion dans IPFS
async function deleteObject(bucket, objectName) {
  await client.removeObject(bucket, objectName);
}

module.exports = { client, ensureBucket, putStream, getStream, deleteObject };
```

### 4. Créer `backend/src/routes/minio-events.js` — webhook de notification

```javascript
'use strict';
const { Router } = require('express');
const crypto = require('crypto');
const minio  = require('../services/minio');
const ipfs   = require('../services/ipfs');
const fabric = require('../services/fabric');
const { createZstdDecompressStream, createEncryptStream } = require('../services/crypto');
const { notify } = require('../services/notifications');
const db     = require('../services/db');
const env    = require('../../config/env');

const router = Router();

// Vérification HMAC du webhook MinIO
function verifyMinioWebhook(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token !== env.MINIO_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Webhook token invalide' });
  }
  next();
}

router.post('/', verifyMinioWebhook, async (req, res, next) => {
  try {
    const events = req.body?.Records || [];

    for (const event of events) {
      if (!event.eventName?.startsWith('s3:ObjectCreated')) continue;

      const bucket     = event.s3.bucket.name;
      const objectName = decodeURIComponent(event.s3.object.key);
      const size       = event.s3.object.size;
      const userId     = event.s3.object.userMetadata?.['x-amz-meta-userid'] || 'system';

      // Récupérer le stream depuis MinIO
      const minioStream = await minio.getStream(bucket, objectName);

      // Pipeline : MinIO stream → décompression zstd → AES-256 → IPFS
      const decompStream = createZstdDecompressStream();
      minioStream.pipe(decompStream);
      const { stream: encStream, getHash, getSize } = createEncryptStream(decompStream, env.MASTER_KEY);

      const cid      = await ipfs.addFromAsyncIterable(encStream, objectName);
      const fileHash = getHash();
      const storedSize = getSize();

      const { randomUUID } = require('crypto');
      const backupId = randomUUID();
      const entry = await fabric.submitTransaction(
        'registerBackup', backupId, cid, objectName, fileHash, String(storedSize), 'application/octet-stream',
      );
      await db.backupOwnership.create({ data: { backupId: entry.backupId, userId } });

      // Supprimer de MinIO après ingestion réussie
      await minio.deleteObject(bucket, objectName);

      notify(userId, 'backup_success', 'Sauvegarde MinIO ingérée',
        `Fichier "${objectName}" (${(storedSize / 1073741824).toFixed(2)} Go) sauvegardé.`);
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

### 5. Enregistrer la route dans `app.js`

```javascript
const minioEventsRouter = require('./routes/minio-events');
// ...
app.use('/api/minio/events', express.json(), minioEventsRouter);
```

### 6. Modifier l'agent (Phase 20) — utiliser S3 au lieu de chunked HTTP

Dans `agent/src/uploader.js`, remplacer l'upload chunked par le SDK MinIO :

```javascript
const Minio = require('minio');

async function uploadFileViaS3(filepath, config, logger) {
  const client = new Minio.Client({
    endPoint:  config.minio.endpoint,
    port:      config.minio.port || 9000,
    useSSL:    config.minio.tls !== false,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey,
  });

  const filename = path.basename(filepath);
  const stat     = fs.statSync(filepath);

  // Compression zstd avant envoi
  const readStream    = fs.createReadStream(filepath);
  const compressStream = createZstdCompressStream();
  readStream.pipe(compressStream);

  logger.info(`Upload S3 : ${filename} (${(stat.size / 1073741824).toFixed(2)} Go)`);

  await client.putObject(
    config.minio.bucket,
    filename,
    compressStream,
    -1, // taille inconnue (stream) — MinIO gère le multipart automatiquement
    {
      'Content-Type': 'application/octet-stream',
      'x-amz-meta-userid': config.credentials.userId,
      'x-amz-meta-compressed': 'zstd-framed',
    }
  );

  logger.info(`✓ S3 upload terminé : ${filename}`);
}
```

### 7. Activer Object Lock (WORM) sur le bucket — immutabilité réglementaire

```bash
# Via mc (MinIO client)
mc mb --with-lock myminio/incoming-backups
mc retention set --default COMPLIANCE 7y myminio/incoming-backups
```

Cela garantit que les fichiers ne peuvent pas être modifiés ou supprimés pendant 7 ans — requis par DORA et Bâle III.

### 8. Configurer TLS sur MinIO

En production (hors Docker local) :

```yaml
# docker-compose.yml
minio:
  environment:
    MINIO_SERVER_TLS_CERT_FILE: /certs/public.crt
    MINIO_SERVER_TLS_KEY_FILE:  /certs/private.key
  volumes:
    - ./certs:/certs:ro
```

Générer un certificat avec Let's Encrypt ou le PKI interne de la banque.

---

## Validation

- [ ] Upload d'un fichier 1 Go via l'agent → apparaît dans le bucket MinIO → ingéré dans IPFS → enregistré sur Fabric → supprimé du bucket
- [ ] Débit mesuré > 500 Mo/s sur réseau local (vs ~100 Mo/s SSH)
- [ ] TLS 1.3 vérifié : `openssl s_client -connect localhost:9000 -tls1_3`
- [ ] Object Lock actif : tentative de suppression manuell retournée `AccessDenied`
- [ ] Webhook MinIO → backend reçoit bien l'événement et traite le fichier
- [ ] Rollback possible : si l'ingestion IPFS échoue, le fichier reste dans MinIO (pas supprimé)

---

## Action de fin de phase

1. Cocher dans [docs/Roadmap.md](../Roadmap.md)
2. Mettre à jour CLAUDE.md
3. `git commit -m "feat: phase 21 - MinIO S3 TLS 1.3 remplace SSH/SFTP"`
4. Passer à la [Phase 22](phase-22.md)
