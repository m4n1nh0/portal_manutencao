#!/bin/sh
set -e

if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running database migrations..."
  node backend/scripts/migrate.js
fi

if [ "$RUN_SEEDS" = "true" ]; then
  echo "Running database seeds..."
  node backend/scripts/seed.js
fi

exec "$@"
