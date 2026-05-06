# Phase 13 — Déploiement multi-machines

**Objectif** : Distribuer les composants sur plusieurs machines physiques.

**Prérequis** : Phase 12 complétée.

---

## Étapes principales

### 1. Préparer les fichiers docker-compose par machine

- `docker-compose-orderer.yaml` (machine A : orderer1)
- `docker-compose-orderer.yaml` (machine B : orderer2)
- `docker-compose-orderer.yaml` (machine C : orderer3)
- `docker-compose-org1.yaml` (machine D : peer + CA + IPFS Org1)
- `docker-compose-org2.yaml` (machine E : peer + CA + IPFS Org2)
- `docker-compose-app.yaml` (machine F : API + frontend + PostgreSQL)

### 2. Configuration TLS et hostnames

- DNS interne ou `/etc/hosts` sur chaque machine pour résoudre les hostnames
- Certificats TLS générés avec les SAN incluant : hostname, IP, FQDN
- Synchronisation NTP des horloges (critique pour TLS)

### 3. Ouvrir les ports sur les firewalls

Par machine :
- Orderers : 7050 entrant
- Peers : 7051, 7052 entrants
- CA : 7054 entrant
- IPFS : 4001 (swarm bidirectionnel), 5001 (interne uniquement), 8080 (gateway si besoin)
- API : 3000 ou 443 (entrant depuis utilisateurs)

### 4. Tester la connectivité

Depuis chaque machine, vers chaque autre machine :
```bash
nc -zv <ip> <port>
openssl s_client -connect <host>:<port>
```

### 5. Démarrer dans l'ordre

1. Orderers (machines A, B, C)
2. Attendre l'élection du leader
3. Peers et CA (machines D, E)
4. IPFS (machines D, E)
5. API + Frontend (machine F)

### 6. Vérifier le fonctionnement

- Soumettre une transaction depuis l'API → endossée par le peer → ordonnée par le cluster Raft
- Uploader un fichier → distribué sur les nœuds IPFS
- Vue topologique → tous les nœuds en ligne

---

## Validation

- [ ] Tous les nœuds communiquent en TLS
- [ ] Une transaction soumise depuis l'API est ordonnée par le cluster Raft distribué
- [ ] Un fichier uploadé est accessible depuis tous les nœuds IPFS
- [ ] La vue topologique reflète l'état réel
- [ ] Aucun firewall ne bloque les flux nécessaires

---

## Action de fin de phase

Cocher → CLAUDE.md → commit → [Phase 14](phase-14.md).