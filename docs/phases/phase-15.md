# Phase 15 — Restauration vers serveur distant

**Objectif** : Restaurer un fichier sauvegardé directement vers un serveur distant via SSH.

**Prérequis** : Phase 14 complétée.

---

## Étapes principales

### 1. Endpoint `POST /api/backups/:id/restore-remote`

Reçoit : `{ ssh_server_id, destination_path, preserve_permissions }`

### 2. Logique

```
1. Récupérer les métadonnées du backup depuis Fabric
2. Vérifier les droits (owner, partage, admin)
3. Récupérer le fichier chiffré depuis IPFS (via CID)
4. Déchiffrer le fichier
5. Recalculer le hash et vérifier l'intégrité
6. Connecter en SSH au serveur cible
7. Créer le dossier de destination si besoin
8. Pousser le fichier via SFTP
9. Si tar.gz : décompresser à distance via ssh exec
10. Restaurer les permissions (chmod) si demandé
11. Audit dans le ledger
12. Notifier l'utilisateur
```

### 3. Frontend

Sur la page de détail d'une sauvegarde :
- Bouton "Restaurer vers serveur distant"
- Modal :
  - Sélection du serveur (carnet d'adresses ou nouveau)
  - Champ "Chemin de destination"
  - Option "Préserver les permissions originales"
  - Bouton "Tester la connexion"
  - Confirmation
- Suivi en temps réel
- Notification finale

### 4. Cas spéciaux

- Le fichier existe déjà à destination : option "écraser" / "renommer" / "annuler"
- Espace disque insuffisant : détection préalable via `df -h` à distance
- Permissions insuffisantes : message d'erreur clair

---

## Validation

- [ ] Restauration d'un fichier simple sur un serveur Ubuntu
- [ ] Restauration d'un dossier compressé (décompression automatique)
- [ ] L'intégrité est vérifiée après restauration
- [ ] L'opération est tracée dans l'audit
- [ ] Les erreurs sont gérées proprement

---

## Action de fin de phase

Cocher → CLAUDE.md → commit → [Phase 16](phase-16.md).