#!/bin/sh
# ═══════════════════════════════════════════════════════════════
#  entrypoint.sh — Inicialização inteligente do container
#  1. Aguarda MySQL estar pronto (com timeout)
#  2. Roda seed de usuários na primeira vez (idempotente)
#  3. Inicia o servidor Node.js
# ═══════════════════════════════════════════════════════════════
set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo "${BLUE}[entrypoint]${NC} $1"; }
ok()   { echo "${GREEN}[entrypoint]${NC} $1"; }
warn() { echo "${YELLOW}[entrypoint]${NC} $1"; }
err()  { echo "${RED}[entrypoint]${NC} $1"; exit 1; }

# ── 1. Aguarda MySQL ────────────────────────────────────────────
DB_HOST="${DB_HOST:-mysql}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-portal_user}"
DB_PASS="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-portal_manutencao}"
MAX_WAIT=60

log "Aguardando MySQL em ${DB_HOST}:${DB_PORT}..."

waited=0
until node -e "
  const m=require('mysql2/promise');
  m.createConnection({host:'${DB_HOST}',port:${DB_PORT},user:'${DB_USER}',password:'${DB_PASS}',database:'${DB_NAME}'})
   .then(c=>{c.end();process.exit(0);})
   .catch(()=>process.exit(1));
" 2>/dev/null; do
  if [ "$waited" -ge "$MAX_WAIT" ]; then
    err "MySQL não respondeu em ${MAX_WAIT}s. Verifique as configurações."
  fi
  printf "."
  sleep 2
  waited=$((waited + 2))
done

echo ""
ok "MySQL pronto em ${waited}s!"

# ── 2. Seed de usuários (apenas se tabela vazia) ────────────────
log "Verificando usuários iniciais..."

USER_COUNT=$(node -e "
  const m=require('mysql2/promise');
  m.createConnection({host:'${DB_HOST}',port:${DB_PORT},user:'${DB_USER}',password:'${DB_PASS}',database:'${DB_NAME}'})
   .then(async c=>{
     const [[r]]=await c.query('SELECT COUNT(*) AS n FROM usuarios');
     await c.end();
     console.log(r.n);
   }).catch(()=>console.log(0));
" 2>/dev/null || echo "0")

if [ "$USER_COUNT" = "0" ]; then
  log "Inserindo usuários iniciais..."
  node scripts/db-setup.js && ok "Seed concluído!" || warn "Seed falhou (banco pode já ter sido populado)"
else
  ok "Banco já populado com ${USER_COUNT} usuário(s). Pulando seed."
fi

# ── 3. Inicia o servidor ────────────────────────────────────────
ok "Iniciando Portal de Manutenção..."
exec "$@"
