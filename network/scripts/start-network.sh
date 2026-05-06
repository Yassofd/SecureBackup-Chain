#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NETWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$NETWORK_DIR"

export PATH="$NETWORK_DIR/fabric-samples/bin:$PATH"

echo "→ Démarrage du réseau Fabric..."
docker compose -f docker-compose.yaml up -d

echo "→ Attente du démarrage des conteneurs (15s)..."
sleep 15

echo "✓ Réseau démarré — lancer scripts/join-channel.sh pour créer et rejoindre le channel"
docker ps --format "table {{.Names}}\t{{.Status}}"
