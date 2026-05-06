# Phase 14 — Ajout dynamique de nœuds par SSH

**Objectif** : Depuis le dashboard, déployer un nouveau nœud sur une machine distante.

**Prérequis** : Phase 13 complétée.

---

## Étapes principales

### 1. Service `services/node-deployer.js`

Étapes orchestrées :
1. Connexion SSH à la machine cible
2. Vérification : `docker --version`, espace disque, accès Internet
3. Si Docker absent : installation via script (`curl -fsSL https://get.docker.com | sh`)
4. Création du dossier `/opt/securebackup`
5. Génération côté API des certificats du nouveau nœud (via Fabric CA)
6. Transfert SCP : certificats + `docker-compose.yaml` adapté
7. Génération du `.env` distant avec les hostnames du réseau
8. `docker compose up -d` à distance via SSH
9. Vérification : `docker ps`, ping du nouveau nœud
10. Pour les peers : exécuter `peer channel join` à distance
11. Enregistrement dans la table `network_nodes` et le ledger

### 2. Templates docker-compose

Préparer des templates paramétrables :
- `templates/docker-compose-peer.yaml.tpl`
- `templates/docker-compose-orderer.yaml.tpl`
- `templates/docker-compose-ipfs.yaml.tpl`
- `templates/docker-compose-ca.yaml.tpl`

Variables : hostname, organization, ports, certificats.

### 3. Endpoint `POST /api/network/nodes`

Reçoit : `{ type, host, port, ssh_username, ssh_auth, organization, name }`

Retourne immédiatement un `jobId` puis exécute en arrière-plan.

### 4. Suivi en temps réel

WebSocket `/ws/jobs/:jobId` qui stream les logs et la progression.

Format : `{ step: "checking_prereqs", progress: 20, message: "...", logs: [] }`

### 5. Frontend

Page "Ajouter un nœud" :
- Formulaire avec validation
- Bouton "Tester la connexion" avant envoi
- Modal de progression en temps réel avec :
  - Barre de progression
  - Étape en cours mise en évidence
  - Logs streamés
- Notification finale (succès / échec avec raison)

### 6. Gestion des erreurs

À chaque étape, en cas d'erreur :
- Annuler les actions effectuées (rollback)
- Logger l'erreur précise
- Possibilité de réessayer en partant de la dernière étape réussie

---

## Validation

- [ ] Test sur une nouvelle VM (Multipass/VirtualBox)
- [ ] Le nœud est déployé et joint le réseau en moins de 10 minutes
- [ ] La vue topologique affiche le nouveau nœud
- [ ] Le nouveau nœud peut endosser des transactions (pour un peer)
- [ ] La suppression du nœud retire proprement du réseau

---

## Action de fin de phase

Cocher → CLAUDE.md → commit → [Phase 15](phase-15.md).