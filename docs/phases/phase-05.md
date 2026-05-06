# Phase 5 — Frontend React minimal

**Objectif** : Interface web permettant l'upload, la liste et la vérification des sauvegardes.

**Durée estimée** : 4 à 6 heures.

**Prérequis** : Phase 4 complétée et validée.

---

## Étapes

### 1. Initialiser le projet

```bash
cd frontend
npm create vite@latest . -- --template react
npm install
npm install axios react-router-dom react-dropzone tailwindcss postcss autoprefixer recharts lucide-react clsx
npx tailwindcss init -p
```

### 2. Configurer Tailwind

`tailwind.config.js` :
```js
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: { extend: {} },
  plugins: []
}
```

`src/index.css` :
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 3. Configurer le proxy Vite

`vite.config.js` :
```js
export default {
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
}
```

### 4. Structure

```
frontend/src/
├── App.jsx                     Routeur
├── main.jsx
├── index.css
├── services/
│   └── api.js                  Wrapper Axios
├── context/
│   └── AppContext.jsx          État global léger
├── components/
│   ├── Layout.jsx              Sidebar + header
│   ├── UploadZone.jsx          Drag and drop
│   ├── BackupRow.jsx           Ligne de la liste
│   └── StatCard.jsx            Carte statistique
└── pages/
    ├── Dashboard.jsx
    ├── Backups.jsx
    ├── BackupDetail.jsx
    └── Verify.jsx
```

### 5. Implémenter les pages essentielles

**Dashboard** — 4 cartes (nombre de sauvegardes, espace utilisé, transactions, intégrité), graphique d'activité, dernières sauvegardes.

**Backups** — liste paginée avec filtres (date, type, taille), tri, recherche.

**Upload** — composant `react-dropzone` avec barre de progression, multi-fichiers, retour visuel succès/erreur.

**BackupDetail** — métadonnées complètes, bouton "Vérifier l'intégrité", bouton "Télécharger".

**Verify** — drag-and-drop d'un fichier à comparer, sélection d'un backup existant, résultat clair (✓ intègre / ✗ altéré).

### 6. Wrapper API

`services/api.js` :
```js
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' }
});

export const backupsApi = {
  list: (params) => api.get('/backups', { params }),
  get: (id) => api.get(`/backups/${id}`),
  upload: (formData, onProgress) => api.post('/backups', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress
  }),
  verify: (id, formData) => api.post(`/backups/${id}/verify`, formData),
  download: (id) => api.get(`/backups/${id}/download`, { responseType: 'blob' })
};

export default api;
```

### 7. Tester le flux complet

1. Lancer le backend (`cd backend && npm run dev`)
2. Lancer le frontend (`cd frontend && npm run dev`)
3. Ouvrir http://localhost:5173
4. Drag-and-drop d'un PDF → vérifier qu'il apparaît dans la liste
5. Cliquer sur un fichier → voir les détails
6. Vérifier l'intégrité → voir le résultat
7. Télécharger → comparer avec l'original

---

## Validation

- [ ] Le frontend démarre sans erreur sur le port 5173
- [ ] Le dashboard charge les statistiques depuis l'API
- [ ] Le drag-and-drop fonctionne et l'upload se voit en temps réel
- [ ] La liste des sauvegardes affiche les fichiers déposés
- [ ] La page de détail montre toutes les métadonnées
- [ ] La vérification d'intégrité affiche un résultat clair
- [ ] Le téléchargement récupère le fichier original

---

## Action de fin de phase

1. Cocher dans [docs/roadmap.md](../roadmap.md)
2. Mettre à jour CLAUDE.md — **MVP terminé !**
3. Commiter : `git commit -m "feat: phase 5 - frontend React minimal"`
4. Passer à la [Phase 6](phase-06.md)