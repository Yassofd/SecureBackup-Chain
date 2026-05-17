# Phase 19 — Uploads parallèles — N streams simultanés

**Objectif** : Uploader plusieurs chunks en parallèle pour saturer la bande passante disponible et réduire le temps de sauvegarde d'un facteur N (N = nombre de streams configuré).

**Durée estimée** : 4 à 6 heures.

**Prérequis** : Phase 18 complétée.

**Impact attendu** :
- 200 Mbps / 1 stream = 25 Mo/s → 10 jours pour 20 To
- 200 Mbps / 4 streams parallèles = saturation → 2–3 jours pour 20 To
- 10 Gbps / 8 streams = ~1 Go/s → 6 heures pour 20 To

---

## Contexte technique

**Problème actuel** : le frontend envoie les chunks un par un (`await` dans une boucle `for`). Chaque chunk attend que le précédent soit confirmé avant de commencer. Sur un lien à haute latence (tunnel Codespaces, WAN bancaire), le RTT « gaspille » la bande passante.

**Solution** : fenêtre glissante de N requêtes simultanées (sliding window / concurrency pool).

```
Avant  : [chunk0]--[chunk1]--[chunk2]--[chunk3]  (séquentiel)
Après  : [chunk0][chunk1]
                [chunk2][chunk3]                  (N=2 simultanés)
```

**Côté serveur** : les chunks peuvent arriver dans le désordre. Il faut réordonner avant d'écrire dans le PassThrough. On utilise un buffer d'ordre côté serveur.

---

## Étapes

### 1. Backend — gestion des chunks hors-ordre

Modifier la session dans `backend/src/routes/backups.js` :

```javascript
// Structure de session étendue :
session = {
  passthrough,
  ipfsPromise,
  getHash, getSize,
  filename, mimeType,
  createdAt: Date.now(),
  userId: req.user.sub,
  nextExpected: 0,          // prochain index à écrire dans le stream
  pendingChunks: new Map(), // buffer pour les chunks arrivés hors-ordre
  totalChunks,
  receivedCount: 0,
};
```

Remplacer la logique d'écriture dans le handler du chunk par :

```javascript
// Stocker le chunk reçu dans le buffer en attente
session.pendingChunks.set(chunkIndex, req.rawBody);
session.receivedCount++;

// Vider le buffer dans l'ordre : écrire tous les chunks consécutifs disponibles
while (session.pendingChunks.has(session.nextExpected)) {
  const data = session.pendingChunks.get(session.nextExpected);
  session.pendingChunks.delete(session.nextExpected);
  session.nextExpected++;

  await new Promise((resolve, reject) => {
    const ok = session.passthrough.write(data, (err) => (err ? reject(err) : resolve()));
    if (!ok) session.passthrough.once('drain', resolve);
  });
}

const isLast = session.receivedCount === session.totalChunks;
if (!isLast) return res.json({ ok: true, received: session.receivedCount, total: session.totalChunks });

// Dernier chunk reçu — attendre que le buffer soit complètement vidé
while (session.pendingChunks.size > 0) {
  await new Promise(resolve => setTimeout(resolve, 10));
}
session.passthrough.end();
// ... suite inchangée (ipfsPromise, Fabric, etc.)
```

### 2. Frontend — pool de concurrence dans `UploadZone.jsx`

Ajouter une constante configurable :

```javascript
const PARALLEL_CHUNKS = 4; // nombre de chunks simultanés (4 = bon équilibre latence/débit)
```

Remplacer la boucle `for` séquentielle par un pool de concurrence :

```javascript
// Pool de concurrence : envoie PARALLEL_CHUNKS requêtes en parallèle
// et lance la suivante dès qu'une se termine (sliding window)
const queue = Array.from({ length: totalChunks }, (_, i) => i);
const inFlight = new Set();
const results = new Array(totalChunks);
let lastError = null;
let cancelled = false;

async function sendChunk(i) {
  if (cancelled || pausedRef.current) return;

  const start = i * CHUNK_SIZE;
  const chunk = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
  const ctrl = new AbortController();
  abortCtrlRef.current = ctrl;

  try {
    const resp = await api.post(`/backups/chunks/${uploadId}`, chunk, {
      signal: ctrl.signal,
      headers: {
        'Content-Type':   'application/octet-stream',
        'x-chunk-index':  String(i),
        'x-total-chunks': String(totalChunks),
        'x-filename':     encodeURIComponent(file.name),
        'x-mime-type':    file.type || 'application/octet-stream',
      },
      timeout: 120000,
      onUploadProgress: (e) => {
        // Note : avec parallélisme, la progression est approximative
        updateProgress(bytesUploaded + (e.loaded || 0), file.size);
      },
    });
    results[i] = resp.data;
    bytesUploaded += chunk.size;
  } catch (err) {
    if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
      cancelled = true;
    } else {
      lastError = err;
    }
  }
}

// Gestion de la pause dans le pool
async function waitIfPaused() {
  if (pausedRef.current) {
    await new Promise(resolve => { resumeFnRef.current = resolve; });
  }
}

// Worker : prend des chunks dans la queue et les envoie
async function worker() {
  while (queue.length > 0 && !lastError && !cancelled) {
    await waitIfPaused();
    const idx = queue.shift();
    if (idx === undefined) break;
    await sendChunk(idx);
  }
}

// Lancer PARALLEL_CHUNKS workers en parallèle
await Promise.all(Array.from({ length: PARALLEL_CHUNKS }, () => worker()));

if (cancelled) { setStatus(null); reset(); return; }
if (lastError) throw lastError;

data = results[totalChunks - 1]; // réponse du dernier chunk (contient backupId)
```

### 3. Ajouter `PARALLEL_CHUNKS` comme paramètre configurable côté admin

Dans `backend/config/env.js`, ajouter :

```javascript
UPLOAD_PARALLEL_CHUNKS: parseInt(process.env.UPLOAD_PARALLEL_CHUNKS || '4', 10),
```

Exposer via `GET /api/admin/config` pour que le frontend puisse récupérer la valeur au démarrage.

### 4. Affichage frontend — indicateur de parallélisme

Dans la zone de progression de `UploadZone.jsx`, ajouter sous les métriques :

```jsx
<p className="text-xs text-ink-500 text-center">
  {PARALLEL_CHUNKS} flux parallèles · {fmtSize(Math.round(speed * PARALLEL_CHUNKS))}/s max théorique
</p>
```

### 5. Limite de mémoire serveur

Avec N chunks de 5 Mo en parallèle, le serveur buffère jusqu'à `N × 5 Mo = 20 Mo` hors-ordre en RAM. C'est négligeable. Ajouter une garde :

```javascript
// Rejeter si trop de chunks hors-ordre en attente (protection contre abus)
if (session.pendingChunks.size > 50) {
  return res.status(429).json({ error: 'Trop de chunks en attente — réduire le parallélisme' });
}
```

### 6. Tester le débit

```bash
# Créer un fichier de 500 Mo
dd if=/dev/urandom of=/tmp/test_500mb.bin bs=1M count=500

# Mesurer le temps avec l'interface (ou curl avec N processus parallèles)
time for i in 1 2 3 4; do
  dd if=/tmp/test_500mb.bin bs=1M count=125 skip=$((($i-1)*125)) | \
    curl -s -X POST http://localhost:80/api/backups/chunks/test-parallel \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/octet-stream" \
      -H "x-chunk-index: $(($i-1))" \
      -H "x-total-chunks: 4" &
done
wait
```

---

## Validation

- [ ] Upload d'un fichier 1 Go avec 4 streams parallèles : débit > 3× le débit séquentiel mesuré en Phase 18
- [ ] Les chunks arrivant hors-ordre sont correctement réordonnés → fichier restauré identique
- [ ] Annulation en cours de transfert parallèle annule bien tous les streams
- [ ] Aucune fuite mémoire après plusieurs uploads consécutifs (`docker stats backend`)
- [ ] `PARALLEL_CHUNKS=1` : comportement identique à la Phase 17 (régression impossible)

---

## Action de fin de phase

1. Cocher dans [docs/Roadmap.md](../Roadmap.md)
2. Mettre à jour CLAUDE.md
3. `git commit -m "feat: phase 19 - uploads parallèles N streams simultanés"`
4. Passer à la [Phase 20](phase-20.md)
