# ══════════════════════════════════════════════════════════════════════════════
#  SecureBackup-Chain — Makefile
#  Usage : make <commande>
# ══════════════════════════════════════════════════════════════════════════════

.PHONY: help install start stop restart status logs logs-backend logs-fabric \
        backup update shell-backend shell-db reset-password purge init-network \
        fix-docker-net fix-stack fix-raft fix-chaincode test-ransomware lab-ransomware

# Couleurs
BOLD  := $(shell tput bold 2>/dev/null || echo '')
GREEN := $(shell tput setaf 2 2>/dev/null || echo '')
RESET := $(shell tput sgr0 2>/dev/null || echo '')

help: ## Affiche cette aide
	@echo ""
	@echo "  $(BOLD)SecureBackup-Chain$(RESET) — Commandes disponibles"
	@echo "  ──────────────────────────────────────────────"
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  $(GREEN)make %-18s$(RESET) %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo ""

install: ## Lancer l'installation complète (première fois)
	@bash install.sh

start: ## Démarrer tous les services
	@echo "  → Démarrage des services..."
	@docker compose up -d
	@echo "  ✓ Services démarrés — http://localhost:$${HTTP_PORT:-80}"

stop: ## Arrêter tous les services
	@echo "  → Arrêt des services..."
	@docker compose stop
	@echo "  ✓ Services arrêtés"

restart: ## Redémarrer tous les services
	@docker compose restart
	@echo "  ✓ Services redémarrés"

status: ## État des services
	@echo ""
	@echo "  $(BOLD)Conteneurs :$(RESET)"
	@docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose ps
	@echo ""
	@echo "  $(BOLD)Santé API :$(RESET)"
	@curl -s http://localhost:$${HTTP_PORT:-80}/api/health 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "  API non disponible"
	@echo ""

logs: ## Logs temps réel de tous les services
	@docker compose logs -f --tail=50

logs-backend: ## Logs du backend uniquement
	@docker compose logs -f --tail=100 backend

logs-fabric: ## Logs Fabric (orderer + peer + chaincode)
	@docker compose logs -f --tail=50 orderer peer chaincode

logs-frontend: ## Logs nginx
	@docker compose logs -f --tail=50 frontend

backup: ## Exporter la configuration (archive chiffrée)
	@echo "  → Export de la configuration..."
	@TOKEN=$$(curl -s -X POST http://localhost:$${HTTP_PORT:-80}/api/auth/login \
		-H "Content-Type: application/json" \
		-d "{\"email\":\"$$(grep ADMIN_EMAIL .env | cut -d= -f2)\",\"password\":\"$$SBC_ADMIN_PASSWORD\"}" \
		2>/dev/null | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4); \
	if [ -z "$$TOKEN" ]; then echo "  ✗ Login échoué. Définissez SBC_ADMIN_PASSWORD=<votre-mdp> avant make backup"; exit 1; fi; \
	FILENAME="securebackup-config-$$(date +%Y%m%d-%H%M%S).tar.gz.enc"; \
	curl -s -X POST "http://localhost:$${HTTP_PORT:-80}/api/admin/export-config" \
		-H "Authorization: Bearer $$TOKEN" \
		--output "$$FILENAME"; \
	echo "  ✓ Configuration exportée : $$FILENAME"

snapshot: ## Déclencher un snapshot immédiat (pg_dump + ledger)
	@echo "  → Snapshot en cours..."
	@TOKEN=$$(curl -s -X POST http://localhost:$${HTTP_PORT:-80}/api/auth/login \
		-H "Content-Type: application/json" \
		-d "{\"email\":\"$$(grep ADMIN_EMAIL .env | cut -d= -f2)\",\"password\":\"$$SBC_ADMIN_PASSWORD\"}" \
		2>/dev/null | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4); \
	curl -s -X POST "http://localhost:$${HTTP_PORT:-80}/api/admin/snapshot" \
		-H "Authorization: Bearer $$TOKEN" | python3 -m json.tool 2>/dev/null
	@echo "  ✓ Snapshot terminé"

update: ## Mettre à jour l'application (pull + rebuild + restart)
	@echo "  → Mise à jour..."
	@git pull --ff-only
	@docker compose build backend frontend
	@docker compose up -d backend frontend
	@echo "  ✓ Application mise à jour"

fix-docker-net: ## Neutraliser les règles iptables-legacy résiduelles (Dev Container / Codespaces)
	@echo "  → Contrôle du pare-feu Docker (iptables legacy résiduel)..."
	@if [ -r /proc/net/ip_tables_names ] && grep -q filter /proc/net/ip_tables_names 2>/dev/null; then \
		sudo iptables-legacy -P FORWARD ACCEPT 2>/dev/null \
			&& echo "  ✓ Politique FORWARD de la table legacy neutralisée" \
			|| echo "  ⚠ À exécuter manuellement : sudo iptables-legacy -P FORWARD ACCEPT"; \
	else \
		echo "  ⓘ Aucune table iptables-legacy détectée — rien à faire"; \
	fi
	@echo "  → Redémarrage du backend..."
	@docker compose up -d --force-recreate backend
	@echo "  → Vérification (ping inter-conteneurs)..."
	@docker exec backup-cc ping -c 1 -W 2 securebackup-db >/dev/null 2>&1 \
		&& echo "  ✓ Réseau inter-conteneurs opérationnel" \
		|| echo "  ⚠ Le réseau inter-conteneurs reste bloqué — voir docs/troubleshooting.md"

# ══════════════════════════════════════════════════════════════════════════════
#  REMISE EN ÉTAT après un arrêt brutal (Ctrl-C) ou un plantage réseau
# ══════════════════════════════════════════════════════════════════════════════

fix-raft: ## Rétablir le quorum Raft (relancer les orgs 2/3 si absentes)
	@echo "  → Vérification du cluster Raft (orderers)..."
	@ORDERS=$$(docker ps --format '{{.Names}}' | grep -c '^orderer\.' || true); \
	if [ "$$ORDERS" -lt 2 ]; then \
		echo "  ⚠ Seulement $$ORDERS orderer(s) actif(s) — le quorum Raft est perdu."; \
		echo "  → Relance des nœuds org additionnels (docker-compose-node*)..."; \
		for f in network/docker-compose-node*.yaml; do \
			[ -f "$$f" ] || continue; \
			ORG=$$(basename "$$f" | grep -oE 'node[0-9]+' | grep -oE '[0-9]+'); \
			[ "$$ORG" = "1" ] && continue; \
			echo "    · démarrage nœud $$ORG ($$f)"; \
			docker compose -f "$$f" up -d 2>&1 | grep -E 'Started|Created|Error' || true; \
		done; \
		echo "  → Attente de l'élection du leader Raft (25s)..."; \
		sleep 25; \
	else \
		echo "  ✓ $$ORDERS orderers actifs — quorum Raft présent."; \
	fi
	@if docker logs --since 30s orderer.org1.example.com 2>&1 | grep -qiE 'new election'; then \
		echo "  ⚠ Élections encore en cours — patientez ou lancez 'make fix-chaincode'"; \
	else \
		echo "  ✓ Cluster Raft stable (pas de nouvelle élection)."; \
	fi

fix-chaincode: ## Réaligner le CHAINCODE_ID du conteneur backup-cc sur celui commité
	@echo "  → Détection du CHAINCODE_ID commité sur le channel..."
	@CC_ID=$$(grep -E '^CHAINCODE_ID=' network/.env 2>/dev/null | cut -d= -f2); \
	if [ -z "$$CC_ID" ]; then \
		CC_ID=$$(docker logs peer0.org1.example.com 2>&1 | grep -oE 'backup-cc_1\.0:[a-f0-9]{64}' | sort -u | tail -1); \
	fi; \
	if [ -z "$$CC_ID" ]; then \
		echo "  ✗ Impossible de déterminer le CHAINCODE_ID commité. Lancez d'abord 'make init-network'."; exit 1; \
	fi; \
	echo "  ✓ CHAINCODE_ID cible : $$CC_ID"; \
	CUR=$$(docker exec backup-cc sh -c 'echo $$CHAINCODE_ID' 2>/dev/null); \
	if [ "$$CUR" = "$$CC_ID" ]; then \
		echo "  ✓ backup-cc annonce déjà le bon ID — rien à faire."; \
	else \
		echo "  ⚠ backup-cc annonce '$$CUR' ≠ commité. Recréation du conteneur..."; \
		docker rm -f backup-cc >/dev/null 2>&1; \
		docker run -d --name backup-cc --network securebackup-net \
			-e CHAINCODE_SERVER_ADDRESS=0.0.0.0:9999 -e CHAINCODE_ID="$$CC_ID" \
			-v "$(PWD)/chaincode:/usr/local/src" -w /usr/local/src \
			node:18-alpine sh start.sh >/dev/null 2>&1 && echo "  ✓ backup-cc recréé avec le bon ID (npm install en cours...)"; \
		echo "  → Attente du démarrage du chaincode (25s)..."; \
		sleep 25; \
	fi

fix-stack: ## 🔧 Remise en état complète après crash (réseau + node_modules + raft + chaincode)
	@echo ""
	@echo "  $(BOLD)Remise en état de la stack SecureBackup-Chain$(RESET)"
	@echo "  ────────────────────────────────────────────────────────"
	@echo "  ⓘ Les données (DB, wallet, crypto-config, IPFS) sont PRÉSERVÉES."
	@echo ""
	@echo "  [1/6] Nettoyage du node_modules corrompu du chaincode..."
	@rm -rf chaincode/node_modules && echo "        ✓ node_modules supprimé (régénéré au démarrage)"
	@echo "  [2/6] Arrêt de la stack (sans supprimer les volumes)..."
	@docker compose down --remove-orphans 2>&1 | grep -E 'Removed|Error' | tail -3 || true
	@echo "  [3/6] Libération et recréation du réseau 'securebackup-net' corrompu..."
	@for c in $$(docker ps -a --filter network=securebackup-net --format '{{.Names}}' 2>/dev/null); do \
		docker stop "$$c" >/dev/null 2>&1; docker rm "$$c" >/dev/null 2>&1; \
	 done; \
	docker network rm securebackup-net >/dev/null 2>&1 && echo "        ✓ réseau supprimé" || echo "        ⓘ réseau absent (sera recréé)"
	@echo "  [4/6] Redémarrage des services de base..."
	@docker compose up -d 2>&1 | grep -E 'Started|Healthy|Error' | tail -3 || true
	@echo "  [5/6] Rétablissement du quorum Raft..."
	@$(MAKE) --no-print-directory fix-raft
	@echo "  [6/6] Réalignement du chaincode..."
	@$(MAKE) --no-print-directory fix-chaincode
	@echo ""
	@echo "  → Vérification finale de la santé (attente 15s)..."
	@sleep 15
	@curl -sf http://localhost:$${HTTP_PORT:-80}/api/health >/dev/null 2>&1 \
		&& echo "  $(GREEN)✓ Stack opérationnelle — API répond.$(RESET)" \
		|| echo "  ⚠ L'API ne répond pas encore — lancez 'make status' et 'make logs-backend'."
	@echo ""

lab-ransomware: ## Démo simulée anti-ransomware (sans infra, juste Node)
	@cd backend && node scripts/ransomware-lab.js

test-ransomware: ## Test LIVE anti-ransomware contre la vraie stack (génère rapports JSON + PDF)
	@echo "  → Exécution du test LIVE dans le conteneur backend..."
	@docker cp backend/scripts/ransomware-live-test.js securebackup-backend:/securebackup/backend/scripts/ransomware-live-test.js 2>/dev/null || \
		docker exec securebackup-backend sh -c 'mkdir -p /securebackup/backend/scripts' && \
		docker cp backend/scripts/ransomware-live-test.js securebackup-backend:/securebackup/backend/scripts/ransomware-live-test.js
	@mkdir -p backend/proofs
	@docker exec securebackup-backend node scripts/ransomware-live-test.js 2>&1 | \
		grep -vE 'ServiceEndpoint|waitForReady|NetworkConfig|buildPeer|buildOrderer|grpc/grpc-js|Endorser|injected env|github.com/hyperledger'
	@docker cp securebackup-backend:/securebackup/backend/proofs/. backend/proofs/ 2>/dev/null || true
	@echo ""
	@echo "  $(GREEN)✓ Preuves générées dans backend/proofs/ (rapport JSON + certificat PDF)$(RESET)"
	@ls -1 backend/proofs/ 2>/dev/null | sed 's/^/     /' || true
	@echo ""


init-network: ## Ré-initialiser le réseau Fabric (si le canal n'existe pas encore)
	@echo "  → Initialisation du réseau Fabric..."
	@HOST_PROJECT_DIR=$(PWD) DOCKER_NETWORK=securebackup-net bash network/init-network.sh
	@echo "  → Rechargement du chaincode avec le nouveau CHAINCODE_ID..."
	@docker compose up -d --force-recreate chaincode
	@echo "  → Redémarrage du backend..."
	@docker compose restart backend
	@echo "  → Attente du backend (10s)..."
	@sleep 10
	@curl -sf http://localhost:$${HTTP_PORT:-3000}/api/health > /dev/null 2>&1 \
		&& echo "  ✓ Réseau Fabric initialisé et backend opérationnel" \
		|| echo "  ✓ Réseau Fabric initialisé (vérifiez make status)"

reset-password: ## Réinitialiser le mot de passe admin (SBC_ADMIN_EMAIL + SBC_NEW_PASSWORD requis)
	@[ -n "$$SBC_ADMIN_EMAIL" ] || (echo "Définissez SBC_ADMIN_EMAIL=<email>"; exit 1)
	@[ -n "$$SBC_NEW_PASSWORD" ] || (echo "Définissez SBC_NEW_PASSWORD=<nouveau-mdp>"; exit 1)
	@docker compose exec backend node -e " \
		const { PrismaClient } = require('@prisma/client'); \
		const bcrypt = require('bcryptjs'); \
		const p = new PrismaClient(); \
		bcrypt.hash('$$SBC_NEW_PASSWORD', 12).then(h => \
		  p.user.update({where:{email:'$$SBC_ADMIN_EMAIL'},data:{passwordHash:h}}) \
		).then(() => { console.log('Mot de passe mis à jour'); p.\$$disconnect(); })"
	@echo "  ✓ Mot de passe réinitialisé pour $$SBC_ADMIN_EMAIL"

shell-backend: ## Ouvrir un shell dans le conteneur backend
	@docker compose exec backend sh

shell-db: ## Ouvrir psql dans la base de données
	@docker compose exec db psql -U securebackup -d securebackup

purge: ## ⚠ SUPPRIME TOUT (données incluses) — irréversible
	@echo "  ⚠  Cette commande supprime TOUTES les données (blockchain, fichiers, base de données)."
	@read -rp "  Tapez 'CONFIRMER' pour continuer : " CONFIRM; \
	[ "$$CONFIRM" = "CONFIRMER" ] || (echo "  Annulé."; exit 1)
	@docker compose down -v --remove-orphans
	@rm -rf network/crypto-config network/channel-artifacts network/wallet backend/wallet
	@echo "  ✓ Environnement purgé"
