# Phase 8 — Sauvegarde distante via SSH

**Objectif** : Récupérer des fichiers ou dossiers sur un serveur distant via SSH/SFTP et les sauvegarder.

**Prérequis** : Phase 7 complétée.

---

## Étapes principales

### 1. Installer node-ssh

```bash
cd backend
npm install node-ssh tar
```

### 2. Service `services/ssh.js`

Méthodes à implémenter :
- `testConnection({ host, port, username, password|privateKey })`
- `executeCommand(connection, command)` — pour récupérer le hash distant
- `fetchFile(connection, remotePath, localPath)` — SFTP
- `fetchDirectory(connection, remotePath, localPath)` — compression tar.gz à la volée
- `pushFile(connection, localPath, remotePath)` — pour la phase 15
- `closeConnection(connection)`

### 3. Stockage chiffré des identifiants

Service `services/credentials.js` :
- `encrypt(plaintext)` avec `MASTER_KEY` (AES-256-GCM)
- `decrypt(ciphertext)`

Table `ssh_servers` :
```sql
CREATE TABLE ssh_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  host VARCHAR(255) NOT NULL,
  port INT DEFAULT 22,
  username VARCHAR(100) NOT NULL,
  auth_type VARCHAR(20) NOT NULL CHECK (auth_type IN ('password', 'key')),
  encrypted_credentials TEXT NOT NULL,
  description TEXT,
  owner_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4. Endpoints

- `POST /api/ssh-servers` — ajout au carnet d'adresses
- `GET /api/ssh-servers` — liste (sans les credentials)
- `PUT /api/ssh-servers/:id`
- `DELETE /api/ssh-servers/:id`
- `POST /api/ssh-servers/:id/test` — test de connexion
- `POST /api/backups/remote` — sauvegarde distante immédiate

### 5. Logique du `POST /api/backups/remote`

```
1. Récupérer les credentials du serveur (déchiffrer)
2. Connecter en SSH
3. Vérifier l'existence du chemin
4. Calculer le hash distant : ssh exec "sha256sum <path>"
5. Si dossier : tar.gz à la volée
6. Transférer via SFTP vers /tmp/api/<uuid>
7. Chiffrer le fichier (AES-256)
8. Push IPFS → CID
9. Submit Fabric registerBackup avec source: REMOTE_SSH
10. Supprimer le fichier temporaire
11. Retourner backupId, cid, txId
```

### 6. Frontend

Page "Sauvegarde distante" avec :
- Sélection d'un serveur dans le carnet OU saisie manuelle
- Champ "Chemin distant" avec validation
- Option "Récursif" pour les dossiers
- Bouton "Tester la connexion" avant lancement
- Suivi en temps réel de l'opération (WebSocket ou polling)
- Notification de succès/échec

Page "Carnet d'adresses SSH" avec CRUD complet.

### 7. Sécurité

- Chemins interdits configurables (`/etc`, `/root`, `/var/log/auth.log`)
- Limite de taille (par exemple 10 Go par opération)
- Audit complet de chaque opération SSH dans le ledger

---

## Validation

- [ ] Ajout d'un serveur SSH au carnet
- [ ] Test de connexion fonctionnel
- [ ] Récupération d'un fichier simple sur Ubuntu/Debian
- [ ] Récupération d'un dossier (avec compression auto)
- [ ] Le fichier sauvegardé est intègre (vérification après restauration)
- [ ] Les credentials sont bien chiffrés en base
- [ ] L'audit montre toutes les opérations

---

## Action de fin de phase

Cocher → CLAUDE.md → commit → [Phase 9](phase-09.md).