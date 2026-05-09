# ══════════════════════════════════════════════════════════════════════════════
#  SecureBackup-Chain — Makefile
#  Usage : make <commande>
# ══════════════════════════════════════════════════════════════════════════════

.PHONY: help install start stop restart status logs logs-backend logs-fabric \
        backup update shell-backend shell-db reset-password purge

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

init-network: ## Ré-initialiser le réseau Fabric (si le canal n'existe pas encore)
	@echo "  → Initialisation du réseau Fabric..."
	@bash network/init-network.sh
	@echo "  ✓ Réseau Fabric initialisé"

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
