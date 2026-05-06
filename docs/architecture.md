# Architecture technique

## Principe fondateur

Séparation des responsabilités entre **deux couches** :
- **IPFS** stocke les fichiers chiffrés (données volumineuses, distribuées)
- **Hyperledger Fabric** enregistre les métadonnées et preuves d'intégrité (CID, hash, horodatage, identité)

Cette séparation combine la capacité de stockage d'IPFS avec l'immuabilité de la blockchain, sans surcharger le ledger avec des données binaires.

## Schéma de haut niveau

```
┌─────────────────────────────────────────────────────────────┐
│                  Application web React                       │
│   Dashboard │ Upload │ Vérification │ Audit │ Admin          │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS + JWT
┌──────────────────────────┴──────────────────────────────────┐
│                  API Gateway Node.js                         │
│   Auth │ Fabric SDK │ IPFS Client │ SSH │ Scheduler          │
└──────────────┬─────────────────────────────┬────────────────┘
               │                              │
┌──────────────┴─────────────┐  ┌────────────┴───────────────┐
│   Réseau Hyperledger        │  │      Cluster IPFS          │
│   - Orderers (Raft)         │  │      - Nœuds IPFS          │
│   - Peers Org1, Org2…       │  │      - Réplication         │
│   - CA par organisation     │  │      - Pinning             │
│   - Channel: backupchannel  │  │                            │
│   - Chaincode: backup-cc    │  │                            │
└─────────────────────────────┘  └────────────────────────────┘
```

## Flux fonctionnels clés

### Sauvegarde locale (drag-and-drop)

1. L'utilisateur dépose un fichier dans le navigateur
2. Le frontend calcule le hash SHA-256
3. Le fichier est chiffré côté client avec AES-256
4. Upload vers l'API
5. L'API pousse le fichier chiffré vers IPFS → obtient un CID
6. L'API enregistre les métadonnées sur le ledger Fabric (CID, hash, propriétaire, timestamp)
7. Confirmation retournée avec l'ID de transaction

### Sauvegarde distante par SSH

1. L'utilisateur saisit IP, identifiants et chemin du fichier source
2. L'API se connecte en SSH au serveur distant
3. Calcul du hash sur le serveur source (via commande à distance)
4. Transfert SFTP du fichier vers l'API
5. Compression à la volée pour les dossiers
6. Chiffrement AES-256
7. Push IPFS et enregistrement Fabric (mention de la source distante)
8. Suppression du fichier temporaire local

### Vérification d'intégrité

1. Récupération des métadonnées depuis Fabric (par CID ou ID)
2. Téléchargement du fichier depuis IPFS
3. Déchiffrement
4. Recalcul du hash SHA-256
5. Comparaison avec le hash stocké dans Fabric
6. Génération d'un certificat d'intégrité signé (PDF)

### Ajout dynamique d'un nœud par SSH

1. L'admin saisit IP, identifiants SSH et type de nœud
2. L'API se connecte au serveur distant
3. Vérification des prérequis (Docker, espace disque)
4. Installation Docker si absent
5. Génération des certificats côté API
6. Transfert SCP des certificats et du `docker-compose.yaml`
7. Lancement des conteneurs Docker
8. Pour les peers : jonction au channel
9. Enregistrement du nœud dans la base et le ledger

## Cluster Raft (haute disponibilité)

**3 orderers minimum** (idéalement 5) sur des machines distinctes.

- Élection automatique du leader
- Réplication du journal sur tous les orderers
- Tolérance à la perte de (N-1)/2 nœuds (1 sur 3, 2 sur 5)
- Basculement transparent en moins de 5 secondes
- Pas de perte de transaction grâce à Raft

## Cluster IPFS

**Plusieurs nœuds IPFS** coordonnés par IPFS Cluster.

- Pinning automatique sur tous les nœuds via le secret partagé
- Persistance garantie même en cas de panne d'un nœud
- API unifiée sur le port 9094 (cluster) au lieu de 5001 (IPFS direct)

## Modèle de données

### Sur le ledger Fabric

```javascript
BackupEntry {
  backupId: string,           // UUID unique
  cid: string,                // CID IPFS
  fileName: string,
  fileHash: string,           // SHA-256 hex
  fileSize: number,
  mimeType: string,
  ownerId: string,            // ID du certificat
  ownerMSP: string,           // Organisation
  timestamp: ISO 8601,
  txId: string,               // ID de transaction Fabric
  status: "ACTIVE" | "ARCHIVED",
  source: "LOCAL" | "REMOTE_SSH",
  sourceDetails: { host?, path? },
  sharedWith: [{ userId, accessLevel, expiresAt }],
  verificationCount: number,
  lastVerification: { timestamp, verifier, result }
}
```

### Dans la base applicative (PostgreSQL)

- `users` (id, email, password_hash, role, mfa_secret, certificate_id, created_at)
- `ssh_servers` (id, name, host, port, username, encrypted_credentials, owner_id)
- `scheduled_backups` (id, name, ssh_server_id, remote_path, cron_expression, last_run, status)
- `notifications` (id, user_id, type, message, read, created_at)
- `network_nodes` (id, type, host, organization, status, last_seen, deployed_by)
- `audit_local` (id, user_id, action, target, ip_address, timestamp) — complément du ledger

## Sécurité

### Chiffrement
- **En transit** : TLS 1.3 entre tous les composants (API, Fabric, IPFS)
- **Au repos sur IPFS** : AES-256 côté client avec clé dérivée
- **Identifiants SSH** : chiffrés avec la `MASTER_KEY` (variable d'environnement)
- **Mots de passe utilisateurs** : bcrypt avec salt

### Authentification
- JWT avec expiration courte (15 min) + refresh token (7 jours)
- MFA TOTP optionnel pour les administrateurs
- Verrouillage temporaire après 5 tentatives échouées
- Certificats X.509 émis par la CA Fabric pour les opérations on-chain

### RBAC
- **Administrateur** : tout (gestion utilisateurs, nœuds, organisations)
- **Responsable** : ses propres sauvegardes et partages
- **Auditeur** : lecture seule, pas de téléchargement

## Tolérance aux pannes

| Panne | Conséquence | Récupération |
|-------|-------------|--------------|
| Leader Raft | Élection nouveau leader | < 5 secondes, automatique |
| Follower Raft | Aucune | Resync au redémarrage |
| Peer organisation | Endorsement dégradé | Autres peers de l'org prennent le relais |
| Nœud IPFS | Aucune (cluster réplique) | Resync via cluster |
| API backend | Indisponibilité service | Redémarrage manuel ou supervisor |
| Base applicative | Indisponibilité service | Restauration depuis backup |

## Déploiement minimal recommandé

### Développement (1 machine)
Tous les services en Docker Compose local. Ressources : 8 Go RAM, 4 vCPU, 50 Go disque.

### Production minimale (6 machines)
- 3 machines pour les orderers Raft (2 vCPU, 4 Go, 50 Go chacune)
- 2 machines pour les organisations (peer + CA + IPFS) (4 vCPU, 8 Go, 200 Go chacune)
- 1 machine pour l'API + frontend + base applicative (4 vCPU, 8 Go, 100 Go)

### Production étendue
Ajouter des orderers (5 ou 7), des organisations supplémentaires, un cluster IPFS plus large, un load balancer devant l'API.

## Choix techniques justifiés

| Choix | Raison |
|-------|--------|
| Hyperledger Fabric (vs Ethereum) | Permissionné, performances, pas de gas |
| Raft (vs Kafka) | Simple, intégré à Fabric 2.x, recommandé |
| IPFS Cluster (vs IPFS seul) | Garantie de réplication |
| AES-256 côté client | Confidentialité même contre l'opérateur IPFS |
| Node.js partout | Cohérence frontend/backend/chaincode |
| Docker Compose (vs Kubernetes) | Simplicité de mise en place initiale |
| PostgreSQL (vs MongoDB) | Transactions ACID pour les données critiques |