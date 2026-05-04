# ═══════════════════════════════════════════════════════════════
#  Dockerfile — Monolito: API + React no mesmo container
#  Referenciado por railway.json
# ═══════════════════════════════════════════════════════════════

# ── Stage 1: deps do backend ────────────────────────────────────
FROM node:20-alpine AS backend-deps

WORKDIR /app

COPY backend/package*.json backend/
RUN npm ci --prefix backend

# ── Stage 2: build do frontend ──────────────────────────────────
FROM node:20-alpine AS client-build

WORKDIR /app

COPY frontend/package*.json frontend/
RUN npm install --prefix frontend

# VITE_API_URL=/api → proxy relativo (monolito: API e Web no mesmo servidor)
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

COPY frontend frontend
RUN npm run build --prefix frontend

# ── Stage 3: runtime de produção ────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    SERVE_CLIENT=true \
    CLIENT_DIST_DIR=/app/client/dist \
    LOG_DIR=/app/logs \
    UPLOAD_DIR=/app/uploads

# Apenas dependências de produção do backend
COPY backend/package*.json backend/
RUN npm ci --omit=dev --prefix backend \
  && npm cache clean --force

# Código do backend
COPY backend/src  backend/src
COPY backend/scripts backend/scripts

# Frontend buildado (renomeia para client/dist como no SEP)
COPY --from=client-build /app/frontend/dist client/dist

# Database (migrations e schema)
COPY database database

# Entrypoint
COPY deploy/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/logs /app/uploads/comprovacoes /app/uploads/documentos \
  && chown -R node:node /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "backend/src/server.js"]
