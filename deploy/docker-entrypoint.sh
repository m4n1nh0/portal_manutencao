#!/bin/sh
set -e

timestamp() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

log() {
  level="$1"
  shift
  printf '%s %-5s [entrypoint] %s\n' "$(timestamp)" "$level" "$*"
}

run_step() {
  step="$1"
  shift
  started="$(date +%s)"
  log INFO "$step started"

  if "$@"; then
    finished="$(date +%s)"
    log INFO "$step finished durationSec=$((finished - started))"
    return 0
  fi

  status="$?"
  finished="$(date +%s)"
  log ERROR "$step failed exitCode=$status durationSec=$((finished - started))"
  return "$status"
}

print_runtime_summary() {
  NODE_PATH=/app/backend/node_modules node <<'NODE'
const {
  resolveDbConfig,
  summarizeDbConfig,
  dbConfigProblems,
} = require('./backend/src/config/dbConfig');

const { config, warnings } = resolveDbConfig();
const summary = {
  node: process.version,
  cwd: process.cwd(),
  env: {
    NODE_ENV: process.env.NODE_ENV || '(unset)',
    PORT: process.env.PORT || '(unset)',
    SERVE_CLIENT: process.env.SERVE_CLIENT || '(unset)',
    RUN_MIGRATIONS: process.env.RUN_MIGRATIONS || '(unset)',
    RUN_SEEDS: process.env.RUN_SEEDS || '(unset)',
    ALLOW_DEV_SEEDS: process.env.ALLOW_DEV_SEEDS || '(unset)',
    WAIT_FOR_DB: process.env.WAIT_FOR_DB || 'true',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_FORMAT: process.env.LOG_FORMAT || 'text',
    STORAGE_DRIVER: process.env.STORAGE_DRIVER || 'local',
    CLIENT_URL: process.env.CLIENT_URL || process.env.FRONTEND_URL || '(unset)',
    APP_URL: process.env.APP_URL || '(unset)',
  },
  db: summarizeDbConfig(config),
  dbProblems: dbConfigProblems(config),
  warnings,
};

console.log(JSON.stringify(summary));
NODE
}

wait_for_database() {
  if [ "${WAIT_FOR_DB:-true}" = "false" ]; then
    log WARN "Skipping database wait because WAIT_FOR_DB=false"
    return 0
  fi

  NODE_PATH=/app/backend/node_modules node <<'NODE'
const mysql = require('mysql2/promise');
const {
  resolveDbConfig,
  dbConnectionOptions,
  summarizeDbConfig,
} = require('./backend/src/config/dbConfig');

const timeoutSec = parseInt(process.env.DB_WAIT_TIMEOUT_SECONDS || '60', 10);
const intervalSec = parseInt(process.env.DB_WAIT_INTERVAL_SECONDS || '2', 10);
const connectTimeout = parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10);
const deadline = Date.now() + timeoutSec * 1000;
const { config, warnings } = resolveDbConfig();
const db = summarizeDbConfig(config);
const { database, ...serverOptions } = dbConnectionOptions(config);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorSummary(error) {
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    errno: error.errno,
    sqlState: error.sqlState,
    syscall: error.syscall,
    address: error.address,
    port: error.port,
  };
}

(async () => {
  let attempt = 0;
  let lastError = null;

  for (;;) {
    attempt += 1;
    try {
      const conn = await mysql.createConnection({
        ...serverOptions,
        connectTimeout,
      });
      await conn.ping();
      await conn.end();
      console.log(JSON.stringify({ status: 'connected', attempt, db, warnings }));
      return;
    } catch (error) {
      lastError = error;
      console.error(JSON.stringify({
        status: 'waiting',
        attempt,
        timeoutSec,
        db,
        error: errorSummary(error),
      }));

      if (Date.now() + intervalSec * 1000 > deadline) break;
      await sleep(intervalSec * 1000);
    }
  }

  console.error(JSON.stringify({
    status: 'failed',
    attempts: attempt,
    timeoutSec,
    db,
    error: errorSummary(lastError),
  }));
  process.exit(1);
})();
NODE
}

log INFO "Container boot started"
log INFO "Runtime summary: $(print_runtime_summary)"

run_step "database wait" wait_for_database

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  run_step "database migrations" node backend/scripts/migrate.js
else
  log INFO "Skipping database migrations because RUN_MIGRATIONS=${RUN_MIGRATIONS:-false}"
fi

if [ "${RUN_SEEDS:-false}" = "true" ]; then
  run_step "database seeds" node backend/scripts/seed.js
else
  log INFO "Skipping database seeds because RUN_SEEDS=${RUN_SEEDS:-false}"
fi

log INFO "Starting application command: $*"
exec "$@"
