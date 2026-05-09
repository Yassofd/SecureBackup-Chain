#!/bin/sh
set -e

echo "[entrypoint] Applying database schema..."
npx prisma db push --accept-data-loss --skip-generate

echo "[entrypoint] Starting API..."
exec node src/server.js
