# Troubleshooting

Erreurs courantes rencontrées pendant le développement et leurs solutions.

## Réseau Hyperledger Fabric

### Le peer ne rejoint pas le channel

**Symptôme** : `peer channel join` échoue avec `cannot create ledger from genesis block`.

**Causes possibles** :
- Le genesis block a été régénéré sans nettoyer les volumes Docker
- Les certificats du peer ne correspondent pas à la configuration du channel

**Solution** :
```bash
docker compose -f network/docker-compose.yaml down -v
rm -rf network/crypto-config network/genesis.block network/channel.tx
./scripts/generate-crypto.sh
./scripts/start-network.sh
```

### Erreur "TLS handshake failed"

**Symptôme** : Logs des conteneurs avec `transport: authentication handshake failed`.

**Causes possibles** :
- Certificats expirés ou mal copiés
- Hostname différent entre certificat et configuration
- TLS désactivé d'un côté seulement

**Solution** :
- Vérifier les SAN (Subject Alternative Names) du certificat
- S'assurer que `CORE_PEER_TLS_ENABLED=true` partout
- Régénérer les certificats si expirés (rare en dev, plus fréquent après plusieurs mois)

### Le chaincode ne se déploie pas

**Symptôme** : `peer lifecycle chaincode commit` échoue avec `signature set did not satisfy policy`.

**Causes possibles** :
- Pas assez d'organisations ont approuvé le chaincode
- La séquence ou la version est incorrecte

**Solution** :
- Vérifier que toutes les organisations requises ont exécuté `approveformyorg`
- Incrémenter `--sequence` à chaque modification (1, 2, 3…)
- `peer lifecycle chaincode checkcommitreadiness` pour diagnostiquer

### Erreur "no Raft leader"

**Symptôme** : Les transactions échouent, logs des orderers indiquent absence de leader.

**Causes possibles** :
- Plus de la moitié des orderers sont en panne
- Problème réseau entre orderers
- Certificats TLS manquants entre orderers

**Solution** :
- Vérifier que la majorité des orderers tourne (`docker ps`)
- Vérifier les logs : `docker logs orderer1 | grep -i raft`
- Tester la connectivité réseau entre les machines orderer

## IPFS

### Erreur "connection refused" sur le port 5001

**Symptôme** : `curl: (7) Failed to connect to localhost port 5001`.

**Causes possibles** :
- Le conteneur IPFS n'est pas démarré
- Le port n'est pas exposé dans le `docker-compose.yaml`
- L'API IPFS n'écoute que sur 127.0.0.1 dans le conteneur

**Solution** :
```bash
docker ps | grep ipfs
docker logs ipfs0
docker exec ipfs0 ipfs config Addresses.API "/ip4/0.0.0.0/tcp/5001"
docker restart ipfs0
```

### Le fichier n'apparaît pas sur les autres nœuds IPFS

**Symptôme** : Upload sur nœud A, mais récupération impossible depuis nœud B.

**Causes possibles** :
- Pas de pinning automatique (utiliser IPFS Cluster)
- Les nœuds ne sont pas connectés en pairs
- Le fichier n'a pas eu le temps de se propager

**Solution** :
- Configurer IPFS Cluster avec un secret partagé
- Vérifier `ipfs swarm peers` sur chaque nœud
- Forcer le pinning via cluster : `ipfs-cluster-ctl pin add <CID>`

## Backend (Node.js)

### Erreur "user not found in wallet"

**Symptôme** : `Error: An identity for the user admin does not exist in the wallet`.

**Causes possibles** :
- Le wallet n'est pas initialisé
- L'utilisateur n'a pas été enrôlé via la CA

**Solution** :
- Lancer le script d'enrôlement : `node scripts/enroll-admin.js`
- Vérifier le chemin `FABRIC_WALLET_PATH` dans `.env`

### Erreur "NoValidEndorsementsError"

**Symptôme** : Une transaction Fabric échoue avec cette erreur.

**Causes possibles** :
- Le chaincode n'est pas installé sur les peers
- La policy d'endossement n'est pas satisfaite
- Le peer est hors ligne

**Solution** :
- `peer lifecycle chaincode queryinstalled` pour vérifier l'installation
- Vérifier la connection profile : tous les peers requis sont listés ?
- Logs des peers pour diagnostiquer

### L'API reçoit le fichier mais l'upload IPFS plante

**Symptôme** : Erreur `RequestError: connect ECONNREFUSED` sur l'appel IPFS.

**Solution** :
- Vérifier `IPFS_API_URL` dans `.env`
- Tester l'API IPFS directement : `curl http://localhost:5001/api/v0/version`
- Si Docker : utiliser `host.docker.internal` ou le nom du service

## SSH (sauvegardes distantes)

### Erreur "Authentication failed"

**Causes possibles** :
- Mauvais mot de passe ou clé
- L'utilisateur n'a pas accès SSH sur le serveur cible
- Le serveur n'autorise pas l'authentification par mot de passe

**Solution** :
- Tester en ligne de commande : `ssh user@host`
- Vérifier `/etc/ssh/sshd_config` du serveur cible (`PasswordAuthentication yes`)
- Préférer l'authentification par clé en production

### Transfert SFTP très lent

**Causes possibles** :
- Bande passante limitée
- Serveur source surchargé
- Compression désactivée

**Solution** :
- Activer la compression dans node-ssh
- Compresser les dossiers en `.tar.gz` avant transfert
- Utiliser un planning de sauvegarde en heures creuses

## Frontend (React)

### Erreur CORS au moment des appels API

**Symptôme** : `Access to XMLHttpRequest blocked by CORS policy`.

**Solution** :
- Configurer le proxy Vite dans `vite.config.js` pour le développement :
  ```js
  server: { proxy: { '/api': 'http://localhost:3000' } }
  ```
- Pour la production, configurer `cors` dans Express avec l'origine autorisée

### Le drag-and-drop ne fonctionne pas

**Solution** :
- Vérifier que `react-dropzone` est installé
- Vérifier que la zone n'est pas écrasée par un overlay
- Tester avec `console.log` dans `onDrop`

## Docker

### "No space left on device"

**Solution** :
```bash
docker system prune -a --volumes
```
**Attention** : supprime aussi les volumes non utilisés.

### Conteneur qui redémarre en boucle

**Solution** :
```bash
docker logs <container> --tail 50
docker inspect <container> | grep -i restart
```
Vérifier les variables d'environnement et les volumes montés.

### Port déjà utilisé

**Symptôme** : `bind: address already in use`.

**Solution** :
```bash
sudo lsof -i :7050   # Identifier le processus
sudo kill -9 <PID>   # Le tuer
# Ou changer le port dans docker-compose.yaml
```

## Déploiement multi-machines

### Les machines ne se voient pas

**Solution** :
- Vérifier la connectivité : `ping`, `telnet <ip> <port>`
- Vérifier les firewalls (ufw, iptables, security groups cloud)
- Vérifier les règles DNS ou `/etc/hosts`

### Certificats invalides entre machines

**Solution** :
- Les certificats doivent inclure les hostnames/IPs réels dans les SAN
- Régénérer avec les bons SAN si nécessaire
- Synchroniser l'horloge des machines (NTP) : un décalage > 5 minutes invalide les certificats

## Cluster Raft

### Élection en boucle (split brain)

**Symptôme** : Logs montrent des élections successives sans stabilisation.

**Causes** :
- Latence réseau élevée entre orderers
- Plus de la moitié des orderers est down

**Solution** :
- Vérifier la latence (< 100ms idéalement)
- Augmenter `ElectionTick` dans `configtx.yaml` si latence élevée
- S'assurer que la majorité des orderers est en ligne

## Astuces générales

### Régénérer entièrement le réseau (en dev uniquement)

```bash
docker compose down -v
rm -rf crypto-config wallet volumes channel-artifacts
./scripts/generate-crypto.sh
./scripts/start-network.sh
./scripts/deploy-chaincode.sh
node backend/scripts/enroll-admin.js
```

### Inspecter le ledger

```bash
peer chaincode query -C backupchannel -n backup-cc -c '{"function":"getAllBackups","Args":[]}'
```

### Voir les blocs

```bash
peer channel fetch newest block.pb -c backupchannel
configtxlator proto_decode --input block.pb --type common.Block | jq
```

### Logs centralisés rapides

```bash
docker compose logs -f --tail 50
```

---

**Si une erreur ne figure pas ici, l'ajouter à ce fichier après l'avoir résolue.**