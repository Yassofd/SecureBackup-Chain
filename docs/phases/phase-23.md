# Phase 23 — Gestion des clés HSM (HashiCorp Vault)

**Objectif** : Remplacer le `MASTER_KEY` stocké en clair dans `.env` par HashiCorp Vault, un gestionnaire de secrets certifié FIPS 140-2. Les clés ne quittent jamais Vault — le backend demande à Vault de chiffrer/déchiffrer les données sans jamais voir la clé brute.

**Durée estimée** : 1 semaine.

**Prérequis** : Phase 22 complétée.

**Pourquoi c'est critique pour une banque** :
- PCI-DSS section 3.5 : les clés de chiffrement doivent être stockées dans un système distinct et sécurisé
- DORA article 9 : gestion des clés cryptographiques avec rotation et audit
- En cas de compromission du serveur backend, la clé `MASTER_KEY` en `.env` expose TOUTES les données. Avec Vault, la clé n'est jamais sur le serveur.

---

## Architecture

```
Backend                    HashiCorp Vault
───────                    ───────────────
encrypt(data) ──► Transit API ──► chiffré retourné
decrypt(data) ──► Transit API ──► clair retourné
                  (la clé AES ne sort jamais de Vault)
```

Vault Transit Engine : agit comme un "chiffrement en tant que service". Le backend envoie le plaintext, Vault retourne le ciphertext — sans jamais exposer la clé.

---

## Étapes

### 1. Ajouter Vault au `docker-compose.yml`

```yaml
vault:
  image: hashicorp/vault:1.15
  command: server -dev -dev-root-token-id=${VAULT_DEV_TOKEN}
  environment:
    VAULT_DEV_ROOT_TOKEN_ID: ${VAULT_DEV_TOKEN}
    VAULT_DEV_LISTEN_ADDRESS: "0.0.0.0:8200"
  ports:
    - "8200:8200"
  cap_add:
    - IPC_LOCK   # nécessaire pour mlock (protège la mémoire)
  healthcheck:
    test: ["CMD", "vault", "status"]
    interval: 10s
    timeout: 5s
    retries: 5
```

**Note production** : en production, utiliser le mode `server` (non `-dev`) avec stockage Raft intégré ou Consul, et **ne jamais** hardcoder `VAULT_DEV_TOKEN`. Utiliser l'auto-unseal via AWS KMS ou Azure Key Vault.

Ajouter dans `.env` :
```
VAULT_ADDR=http://vault:8200
VAULT_TOKEN=${VAULT_DEV_TOKEN}
VAULT_DEV_TOKEN=<généré 32 chars hex>
VAULT_TRANSIT_KEY=securebackup-master
```

### 2. Script d'initialisation Vault `scripts/init-vault.sh`

```bash
#!/bin/bash
# À exécuter une seule fois après le premier démarrage de Vault
set -e

export VAULT_ADDR=${VAULT_ADDR:-http://localhost:8200}
export VAULT_TOKEN=${VAULT_DEV_TOKEN}

echo "→ Activation du moteur Transit..."
vault secrets enable transit || echo "Transit déjà activé"

echo "→ Création de la clé de chiffrement principale..."
vault write -f transit/keys/securebackup-master \
  type=aes256-gcm96 \
  exportable=false \
  allow_plaintext_backup=false

echo "→ Création d'un token limité pour le backend (read+encrypt+decrypt uniquement)..."
vault policy write securebackup-backend - <<EOF
path "transit/encrypt/securebackup-master" { capabilities = ["update"] }
path "transit/decrypt/securebackup-master" { capabilities = ["update"] }
path "transit/rewrap/securebackup-master"  { capabilities = ["update"] }
EOF

BACKEND_TOKEN=$(vault token create \
  -policy=securebackup-backend \
  -ttl=0 \
  -renewable=true \
  -format=json | jq -r '.auth.client_token')

echo "Token backend Vault : $BACKEND_TOKEN"
echo "→ Ajouter VAULT_TOKEN=$BACKEND_TOKEN dans .env (remplacer le dev token)"
```

### 3. Créer `backend/src/services/vault.js`

```javascript
'use strict';
const axios = require('axios');
const env   = require('../../config/env');

const vaultClient = axios.create({
  baseURL: env.VAULT_ADDR,
  headers: { 'X-Vault-Token': env.VAULT_TOKEN },
  timeout: 10000,
});

const TRANSIT_KEY = env.VAULT_TRANSIT_KEY || 'securebackup-master';

// Chiffrement via Vault Transit (AES-256-GCM)
// Input : Buffer ou string, Output : ciphertext base64 opaque
async function encrypt(plaintext) {
  const b64 = Buffer.isBuffer(plaintext)
    ? plaintext.toString('base64')
    : Buffer.from(plaintext).toString('base64');

  const resp = await vaultClient.post(`/v1/transit/encrypt/${TRANSIT_KEY}`, {
    plaintext: b64,
  });
  return resp.data.data.ciphertext; // format : "vault:v1:<base64>"
}

// Déchiffrement via Vault Transit
async function decrypt(ciphertext) {
  const resp = await vaultClient.post(`/v1/transit/decrypt/${TRANSIT_KEY}`, { ciphertext });
  return Buffer.from(resp.data.data.plaintext, 'base64');
}

// Rotation de clé (toutes les versions précédentes restent déchiffrables)
async function rotateKey() {
  await vaultClient.post(`/v1/transit/keys/${TRANSIT_KEY}/rotate`);
}

// Ré-chiffrement d'un ciphertext avec la version courante de la clé
async function rewrap(ciphertext) {
  const resp = await vaultClient.post(`/v1/transit/rewrap/${TRANSIT_KEY}`, { ciphertext });
  return resp.data.data.ciphertext;
}

module.exports = { encrypt, decrypt, rotateKey, rewrap };
```

### 4. Adapter `backend/src/services/crypto.js` — remplacer MASTER_KEY par Vault

**Problème** : le chiffrement AES actuel est synchrone et en streaming. Vault Transit opère bloc par bloc (pas de streaming). Solution : Vault génère une **DEK (Data Encryption Key)** éphémère, le DEK chiffre les données en local (AES-256-GCM natif Node.js), et Vault chiffre le DEK (enveloppe de clé).

```javascript
// Schéma envelope encryption :
// 1. Vault génère/dérive un DEK aléatoire pour ce fichier
// 2. Le DEK chiffre les données en local (AES-256-GCM, rapide, streaming)
// 3. Vault chiffre le DEK → DEK chiffré stocké avec les métadonnées dans Fabric
// 4. Pour déchiffrer : Vault déchiffre le DEK, le DEK déchiffre les données

const { createCipheriv, createDecipheriv, randomBytes } = require('crypto');
const vault = require('./vault');

async function createEnvelopeEncryptStream(sourceStream, metadata) {
  // Générer un DEK aléatoire 32 octets pour ce fichier
  const dek     = randomBytes(32);
  const iv      = randomBytes(16);

  // Chiffrer le DEK avec Vault (enveloppe)
  const encryptedDek = await vault.encrypt(Buffer.concat([dek, iv]));

  // Créer le stream AES avec le DEK local
  const cipher = createCipheriv('aes-256-cbc', dek, iv);
  sourceStream.pipe(cipher);

  return {
    stream:       cipher,
    encryptedDek, // à stocker dans Fabric avec le backup
    getHash:      () => { /* ... SHA-256 inchangé */ },
  };
}

async function createEnvelopeDecryptStream(encryptedStream, encryptedDek) {
  // Récupérer le DEK depuis Vault
  const dekAndIv = await vault.decrypt(encryptedDek);
  const dek = dekAndIv.slice(0, 32);
  const iv  = dekAndIv.slice(32, 48);

  const decipher = createDecipheriv('aes-256-cbc', dek, iv);
  encryptedStream.pipe(decipher);
  return decipher;
}
```

### 5. Modifier le chaincode pour stocker `encryptedDek`

Dans `chaincode/lib/backup-contract.js` :

```javascript
async registerBackup(ctx, backupId, cid, filename, fileHash, size, mimeType, encryptedDek) {
  const backup = {
    backupId, cid, filename, fileHash,
    size: parseInt(size), mimeType,
    encryptedDek, // ← nouvelle métadonnée : DEK chiffré par Vault
    createdAt: new Date().toISOString(),
    status: 'active',
  };
  await ctx.stub.putState(backupId, Buffer.from(JSON.stringify(backup)));
  return backup;
}
```

Incrémenter `--version 1.2 --sequence 3`.

### 6. Rotation de clé — endpoint admin

```javascript
// POST /api/admin/vault/rotate-key
router.post('/vault/rotate-key', requireRole('admin'), async (req, res, next) => {
  try {
    await vault.rotateKey();
    // Note : les anciens backups restent déchiffrables (Vault garde les versions précédentes)
    // Lancer un job de ré-encryption en arrière-plan si souhaité
    res.json({ ok: true, message: 'Rotation effectuée. Anciens backups toujours déchiffrables.' });
  } catch (err) { next(err); }
});
```

### 7. Audit Vault — traçabilité de chaque accès à la clé

Vault logue nativement chaque opération encrypt/decrypt avec : qui, quand, quelle clé, succès/échec. Activer l'audit log :

```bash
vault audit enable file file_path=/vault/logs/audit.log
```

Monter `/vault/logs` dans docker-compose pour persister les logs.

---

## Validation

- [ ] `MASTER_KEY` supprimé de `.env` — le backend démarre sans lui
- [ ] Upload d'un fichier → `encryptedDek` visible dans `peer chaincode query getAllBackups`
- [ ] Restauration → fichier identique à l'original
- [ ] `POST /api/admin/vault/rotate-key` → Vault key version incrémentée (vérifier avec `vault read transit/keys/securebackup-master`)
- [ ] Anciens backups (version de clé précédente) toujours restaurables après rotation
- [ ] Arrêter le conteneur Vault → le backend répond `503 Service Unavailable` avec message explicite (pas de crash silencieux)
- [ ] Audit log Vault contient chaque opération encrypt/decrypt avec timestamp

---

## Action de fin de phase

1. Cocher dans [docs/Roadmap.md](../Roadmap.md)
2. Mettre à jour CLAUDE.md
3. `git commit -m "feat: phase 23 - gestion des clés HSM via HashiCorp Vault"`
4. Passer à la [Phase 24](phase-24.md)
