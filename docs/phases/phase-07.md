# Phase 7 — Assistant de configuration initiale

**Objectif** : Au premier lancement, afficher un assistant en 4 étapes pour configurer l'organisation.

**Prérequis** : Phase 6 complétée.

---

## Étapes principales

### 1. Détection du premier lancement

Au démarrage du backend, vérifier l'absence de `config/initialized.json`.
Si absent : autoriser uniquement les endpoints `/api/setup/*`.

### 2. Endpoints

- `GET /api/setup/status` — retourne `{ initialized: false }` ou `true`
- `POST /api/setup/initialize` — reçoit toutes les données et configure
- `POST /api/setup/test-server` — teste l'IP/port

### 3. Wizard frontend (4 étapes)

**Étape 1 — Identité de l'organisation**
- Nom, statut juridique, adresse, BP, téléphone, email, secteur, identifiant fiscal optionnel, logo

**Étape 2 — Configuration serveur**
- IP publique ou DNS, ports (Fabric, IPFS, API), test de connectivité

**Étape 3 — Compte administrateur**
- Email, mot de passe (avec règles de force), confirmation, MFA optionnel (QR code TOTP)

**Étape 4 — Récapitulatif**
- Affichage de tous les paramètres
- Bouton "Initialiser le réseau"
- Téléchargement du kit de récupération (clé maître + config chiffrée)

### 4. Logique d'initialisation

Le `POST /api/setup/initialize` :
1. Génère les certificats racines (si pas déjà fait par la phase 1)
2. Initialise la base PostgreSQL
3. Crée le compte administrateur
4. Démarre les conteneurs Fabric et IPFS si pas démarrés
5. Stocke la configuration de l'organisation dans le ledger
6. Écrit `config/initialized.json` avec un timestamp
7. Retourne le kit de récupération

### 5. Verrouillage post-initialisation

`POST /api/setup/initialize` retourne 403 si `initialized.json` existe.
Pour réinitialiser (dev uniquement) : supprimer le fichier manuellement.

---

## Validation

- [ ] Premier lancement → wizard affiché
- [ ] Saisie validée à chaque étape (Zod côté frontend)
- [ ] Le test de connectivité serveur fonctionne
- [ ] L'initialisation crée toutes les ressources
- [ ] Le kit de récupération est téléchargeable
- [ ] Lancements suivants → page Login directe
- [ ] Réinitialisation possible en dev (suppression du fichier)

---

## Action de fin de phase

Cocher → CLAUDE.md → commit → [Phase 8](phase-08.md).