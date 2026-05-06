#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NETWORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$NETWORK_DIR"

echo "→ Arrêt du réseau Fabric..."
docker compose -f docker-compose.yaml down -v

echo "✓ Réseau arrêté et volumes supprimés"
