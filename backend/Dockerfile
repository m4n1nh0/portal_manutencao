# ═══════════════════════════════════════════════════════════════
#  backend/Dockerfile — API isolada (sem frontend)
#  Referenciado por railway.api.json
# ═══════════════════════════════════════════════════════════════

FROM node:20-alpine AS deps

WORKDIR /app

COPY backend/package*.json backend/
RUN npm ci --prefix backend

FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    SERVE_CLIENT=false \
    LOG_DIR=/app/logs \
    UPLOAD_DIR=/app/uploads

COPY backend/package*.json backend/
RUN npm ci --omit=dev --prefix backend \
  && npm cache clean --force

COPY backend/src     backend/src
COPY backend/scripts backend/scripts
COPY database        database

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
