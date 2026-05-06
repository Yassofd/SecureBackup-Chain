# Phase 10 — Audit trail et notifications

**Objectif** : Tracer toutes les opérations sur le ledger et notifier les événements.

**Prérequis** : Phase 9 complétée.

---

## Étapes principales

### 1. Étendre le chaincode

Ajouter une fonction `recordAuditEntry(ctx, action, target, details)` qui inscrit une trace dans le ledger.

Modifier les fonctions existantes pour appeler cette trace automatiquement (lecture, vérification, partage, révocation).

Ajouter une fonction `getAuditHistory(ctx, filters)` qui exploite `getHistoryForKey` de Fabric.

### 2. Endpoint `GET /api/audit`

Filtres : utilisateur, date début/fin, type d'action, fichier cible.
Tri par date décroissante. Pagination.

### 3. Export PDF/CSV

Service utilisant `pdfkit` :
- Logo de l'organisation
- Liste tabulaire des opérations
- Signature numérique (hash du rapport sur le ledger)
- Métadonnées (généré le, par qui, période)

### 4. Système de notifications

Service `services/notifications.js` :
- Table `notifications` (id, user_id, type, title, message, read, created_at)
- Méthodes : `notify(userId, type, title, message)`, `notifyAdmins(...)`, `notifyByEmail(...)`

Email avec nodemailer (configuration SMTP dans `.env`).

### 5. Événements déclencheurs

- Sauvegarde réussie/échouée
- Vérification d'intégrité (alerte forte si échec)
- Partage reçu
- Tentative d'accès non autorisée
- Tâche planifiée exécutée
- Certificat proche de l'expiration (J-30, J-7, J-1)

### 6. Frontend

- Cloche de notifications en haut à droite avec badge nombre non lu
- Page "Notifications" avec marquage lu/non lu
- Page "Préférences" : choix des canaux (web/email) par type d'événement
- Page Audit avec filtres et boutons d'export

---

## Validation

- [ ] Toutes les opérations sont tracées dans le ledger
- [ ] L'export PDF est généré avec le bon contenu
- [ ] Les notifications apparaissent en temps réel
- [ ] Les emails sont envoyés (tester avec MailHog en dev)
- [ ] Une vérification échouée génère une alerte visible

---

## Action de fin de phase

Cocher → CLAUDE.md → commit → [Phase 11](phase-11.md).