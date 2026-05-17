# Phase 20 — Agent local daemon (remplace l'upload navigateur)

**Objectif** : Créer un agent léger installable sur les serveurs de la banque qui surveille des répertoires et pousse automatiquement les nouvelles données vers SecureBackup-Chain, sans passer par le navigateur. L'agent peut saturer un lien 10 Gbps là où le navigateur est limité.

**Durée estimée** : 1 à 2 semaines.

**Prérequis** : Phase 19 complétée.

**Impact attendu** :
- Upload non limité par le navigateur : saturation possible d'un lien 10 Gbps
- Sauvegarde automatique sans intervention humaine
- Reprise automatique sur coupure réseau
- Authentification par certificat (pas de mot de passe)

---

## Architecture

```
Serveur banque                       SecureBackup-Chain
──────────────                       ─────────────────
/data/transactions/ ──► agent ──► API /api/backups/chunks/:id
/data/logs/         ──► agent     (TLS 1.3 + JWT ou mTLS)
/data/archives/     ──► agent
```

L'agent est un processus Node.js (ou binaire compilé avec `pkg`) installé en tant que service systemd sur les serveurs sources.

---

## Étapes

### 1. Créer `agent/` à la racine du projet

```bash
mkdir -p agent/src agent/config
cd agent
npm init -y
npm install axios chokidar winston commander @mongodb-js/zstd
npm install --save-dev pkg
```

Structure finale :
```
agent/
  src/
    index.js          # point d'entrée CLI
    watcher.js        # surveillance de répertoires (chokidar)
    uploader.js       # logique upload chunked + parallèle
    auth.js           # gestion JWT + refresh automatique
    queue.js          # file d'attente persistante (SQLite via better-sqlite3)
    logger.js         # winston
  config/
    agent.example.json
  Dockerfile.agent
  package.json
```

### 2. `agent/config/agent.example.json`

```json
{
  "server": "https://securebackup.monentreprise.com",
  "credentials": {
    "email": "agent-srv1@securebackup.local",
    "password": "<généré au setup>",
    "tokenPath": "/etc/securebackup-agent/token.json"
  },
  "watch": [
    {
      "path": "/data/transactions",
      "recursive": true,
      "extensions": [".csv", ".xml", ".json"],
      "minAgeMins": 5
    },
    {
      "path": "/data/logs",
      "recursive": false,
      "extensions": [".log", ".gz"],
      "minAgeMins": 60
    }
  ],
  "upload": {
    "chunkSizeMb": 10,
    "parallelChunks": 8,
    "retryMax": 5,
    "retryDelayMs": 5000,
    "bandwidthLimitMbps": 0
  },
  "queue": {
    "dbPath": "/var/lib/securebackup-agent/queue.db"
  }
}
```

### 3. `agent/src/queue.js` — file d'attente persistante (SQLite)

La queue survit aux redémarrages de l'agent. Si l'agent tombe en plein upload, il reprend au prochain démarrage.

```javascript
const Database = require('better-sqlite3');

class UploadQueue {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filepath TEXT NOT NULL UNIQUE,
        size INTEGER,
        status TEXT DEFAULT 'pending',  -- pending | uploading | done | failed
        uploadId TEXT,
        chunksUploaded INTEGER DEFAULT 0,
        createdAt INTEGER DEFAULT (unixepoch()),
        updatedAt INTEGER DEFAULT (unixepoch()),
        error TEXT
      )
    `);
  }

  enqueue(filepath, size) {
    this.db.prepare(
      'INSERT OR IGNORE INTO queue (filepath, size) VALUES (?, ?)'
    ).run(filepath, size);
  }

  nextPending() {
    return this.db.prepare(
      "SELECT * FROM queue WHERE status = 'pending' ORDER BY createdAt LIMIT 1"
    ).get();
  }

  markUploading(id, uploadId) {
    this.db.prepare(
      "UPDATE queue SET status='uploading', uploadId=?, updatedAt=unixepoch() WHERE id=?"
    ).run(uploadId, id);
  }

  markDone(id) {
    this.db.prepare(
      "UPDATE queue SET status='done', updatedAt=unixepoch() WHERE id=?"
    ).run(id);
  }

  markFailed(id, error) {
    this.db.prepare(
      "UPDATE queue SET status='failed', error=?, updatedAt=unixepoch() WHERE id=?"
    ).run(String(error), id);
  }
}

module.exports = UploadQueue;
```

### 4. `agent/src/uploader.js` — upload chunked + parallèle + retry

```javascript
const fs     = require('fs');
const path   = require('path');
const axios  = require('axios');
const crypto = require('crypto');
const { compress } = require('@mongodb-js/zstd');

const HEADER_SIZE = 4; // octets pour la taille de bloc zstd

async function uploadFile(filepath, config, token, onProgress) {
  const stat      = fs.statSync(filepath);
  const filesize  = stat.size;
  const chunkSize = (config.upload.chunkSizeMb || 10) * 1024 * 1024;
  const parallel  = config.upload.parallelChunks || 4;
  const uploadId  = crypto.randomUUID();
  const filename  = path.basename(filepath);
  const totalChunks = Math.ceil(filesize / chunkSize);

  const api = axios.create({
    baseURL: config.server + '/api',
    headers: { Authorization: `Bearer ${token}` },
    timeout: 180000,
  });

  const queue = Array.from({ length: totalChunks }, (_, i) => i);
  let done = 0;

  async function sendChunk(i) {
    const start = i * chunkSize;
    const end   = Math.min(start + chunkSize, filesize);
    const len   = end - start;

    // Lire le chunk depuis le disque
    const fd  = fs.openSync(filepath, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    fs.closeSync(fd);

    // Compresser avec zstd (si activé)
    const compressed = await compress(buf, 3);
    const header     = Buffer.alloc(HEADER_SIZE);
    header.writeUInt32BE(compressed.length, 0);
    const payload = Buffer.concat([header, compressed]);

    // Retry loop
    let attempt = 0;
    while (attempt < (config.upload.retryMax || 5)) {
      try {
        await api.post(`/backups/chunks/${uploadId}`, payload, {
          headers: {
            'Content-Type':         'application/octet-stream',
            'x-chunk-index':        String(i),
            'x-total-chunks':       String(totalChunks),
            'x-filename':           encodeURIComponent(filename),
            'x-mime-type':          'application/octet-stream',
            'x-compressed':         'zstd-framed',
          },
        });
        done++;
        onProgress?.(done / totalChunks);
        return;
      } catch (err) {
        attempt++;
        if (attempt >= (config.upload.retryMax || 5)) throw err;
        await new Promise(r => setTimeout(r, (config.upload.retryDelayMs || 5000) * attempt));
      }
    }
  }

  // Pool de workers parallèles
  async function worker() {
    while (queue.length > 0) {
      const idx = queue.shift();
      if (idx === undefined) break;
      await sendChunk(idx);
    }
  }

  await Promise.all(Array.from({ length: parallel }, () => worker()));
}

module.exports = { uploadFile };
```

### 5. `agent/src/watcher.js` — surveillance de répertoires

```javascript
const chokidar = require('chokidar');
const path     = require('path');

function startWatcher(watchConfigs, queue, logger) {
  for (const cfg of watchConfigs) {
    const watcher = chokidar.watch(cfg.path, {
      recursive:     cfg.recursive ?? true,
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
    });

    watcher.on('add', (filepath) => {
      const ext = path.extname(filepath).toLowerCase();
      if (cfg.extensions && !cfg.extensions.includes(ext)) return;

      const stat = require('fs').statSync(filepath);
      const ageMins = (Date.now() - stat.mtimeMs) / 60000;
      if (ageMins < (cfg.minAgeMins ?? 0)) return;

      logger.info(`Nouveau fichier détecté : ${filepath} (${(stat.size / 1048576).toFixed(1)} Mo)`);
      queue.enqueue(filepath, stat.size);
    });

    logger.info(`Surveillance active : ${cfg.path}`);
  }
}

module.exports = { startWatcher };
```

### 6. `agent/src/index.js` — point d'entrée principal

```javascript
#!/usr/bin/env node
'use strict';

const { program }   = require('commander');
const fs            = require('fs');
const path          = require('path');
const UploadQueue   = require('./queue');
const { startWatcher } = require('./watcher');
const { uploadFile }   = require('./uploader');
const logger        = require('./logger');

program
  .option('-c, --config <path>', 'Chemin vers agent.json', '/etc/securebackup-agent/agent.json')
  .parse();

const opts   = program.opts();
const config = JSON.parse(fs.readFileSync(opts.config, 'utf8'));
const queue  = new UploadQueue(config.queue.dbPath);

// Surveiller les répertoires configurés
startWatcher(config.watch, queue, logger);

// Boucle de traitement de la queue
async function processLoop() {
  while (true) {
    const item = queue.nextPending();
    if (item) {
      logger.info(`Démarrage upload : ${item.filepath}`);
      queue.markUploading(item.id, require('crypto').randomUUID());
      try {
        // Récupérer ou renouveler le token JWT
        const token = await require('./auth').getToken(config);
        await uploadFile(item.filepath, config, token, (pct) => {
          logger.info(`  ${item.filepath} : ${Math.round(pct * 100)}%`);
        });
        queue.markDone(item.id);
        logger.info(`✓ Upload terminé : ${item.filepath}`);
      } catch (err) {
        queue.markFailed(item.id, err.message);
        logger.error(`✖ Échec upload ${item.filepath} : ${err.message}`);
      }
    }
    await new Promise(r => setTimeout(r, 2000)); // poll toutes les 2s
  }
}

processLoop().catch(err => { logger.error(err); process.exit(1); });
```

### 7. Service systemd (installation sur serveur banque)

Créer `agent/securebackup-agent.service` :

```ini
[Unit]
Description=SecureBackup-Chain Agent
After=network.target

[Service]
Type=simple
User=securebackup
ExecStart=/usr/local/bin/securebackup-agent --config /etc/securebackup-agent/agent.json
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 8. Script d'installation `agent/install.sh`

```bash
#!/bin/bash
# Installe l'agent sur un serveur Ubuntu/Debian
set -e
install -d -o securebackup /var/lib/securebackup-agent /etc/securebackup-agent
cp securebackup-agent /usr/local/bin/
cp securebackup-agent.service /etc/systemd/system/
cp agent.example.json /etc/securebackup-agent/agent.json
echo "Éditez /etc/securebackup-agent/agent.json puis : systemctl enable --now securebackup-agent"
```

### 9. Endpoint backend — création de compte agent

Ajouter `POST /api/admin/agents` qui crée un utilisateur avec rôle `agent` :
- Génère un mot de passe fort
- Crée l'utilisateur en base
- Retourne les credentials à copier dans `agent.json`

### 10. Compiler le binaire standalone

```bash
cd agent
npx pkg . --target node18-linux-x64 --output dist/securebackup-agent
# Tester
./dist/securebackup-agent --config config/agent.example.json
```

---

## Validation

- [ ] L'agent détecte un nouveau fichier dans le répertoire surveillé en < 5 secondes
- [ ] Upload d'un fichier 10 Go sans intervention humaine → `status: done` dans la queue SQLite
- [ ] Simuler une coupure réseau en plein upload → l'agent reprend automatiquement au chunk suivant
- [ ] Redémarrer l'agent en plein upload → l'upload reprend depuis le dernier chunk confirmé
- [ ] Débit mesuré ≥ 8× le débit navigateur (pas de limitation TCP monoflux)
- [ ] Le binaire fonctionne sur un serveur Ubuntu sans Node.js installé

---

## Action de fin de phase

1. Cocher dans [docs/Roadmap.md](../Roadmap.md)
2. Mettre à jour CLAUDE.md
3. `git commit -m "feat: phase 20 - agent local daemon pour upload haute performance"`
4. Passer à la [Phase 21](phase-21.md)
