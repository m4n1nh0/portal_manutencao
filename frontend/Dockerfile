# ═══════════════════════════════════════════════════════════════
#  frontend/Dockerfile — React buildado + Caddy (SPA server)
#  Referenciado por railway.web.json
# ═══════════════════════════════════════════════════════════════

FROM node:20-alpine AS build

WORKDIR /app

COPY frontend/package*.json frontend/
RUN npm ci --prefix frontend

# URL da API separada (injetada em build time pelo Railway)
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}

COPY frontend frontend
RUN npm run build --prefix frontend

# ── Caddy: serve SPA com fallback para index.html ───────────────
FROM caddy:2-alpine AS runtime

ENV PORT=8080

COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv

EXPOSE 8080
