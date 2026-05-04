# Deploy e containers

Este projeto pode ser executado de duas formas:

- **Monolito**: API Express e React compilado no mesmo container.
- **Separado**: API e Web em containers/serviços independentes.

## Arquivos principais

| Arquivo                  | Uso                                                              |
|--------------------------|------------------------------------------------------------------|
| `Dockerfile`             | Build monolítico: compila frontend + backend e serve pelo Express |
| `backend/Dockerfile`     | Build da API isolada (sem frontend)                              |
| `frontend/Dockerfile`    | Build do React servido por Caddy                                 |
| `docker-compose.yml`     | Execução local com perfis `monolith` e `split`                  |
| `railway.json`           | Config Railway do monolito                                       |
| `railway.api.json`       | Config Railway da API separada                                   |
| `railway.web.json`       | Config Railway do frontend separado                             |

## Execução local com Docker Compose

### Monolito

```bash
docker compose --profile monolith up --build
# ou:
npm run docker:monolith
```

Acesse: `http://localhost:3001`

### API e Web separados

```bash
docker compose --profile split up --build
# ou:
npm run docker:split
```

Acesse:
- Web: `http://localhost:8080`
- API: `http://localhost:3001/api/health`

## Variáveis importantes

### API ou monolito

```env
NODE_ENV=production
PORT=3001
SERVE_CLIENT=true         # true = monolito | false = API separada
CLIENT_DIST_DIR=/app/client/dist

# Railway MySQL (use uma das formas abaixo):
MYSQL_URL=${{ MySQL.MYSQL_URL }}
# ou:
DB_HOST=  DB_PORT=3306  DB_USER=  DB_PASSWORD=  DB_NAME=portal_manutencao
# Railway também injeta: MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE

JWT_SECRET=          # openssl rand -hex 64
CLIENT_URL=          # URL do frontend (ou URL do monolito)
APP_URL=             # URL desta API
RUN_MIGRATIONS=true  # roda migrations na inicialização
RUN_SEEDS=false      # true apenas no primeiro deploy
STORAGE_DRIVER=local # local | s3 | r2
```

### Web separada

```env
VITE_API_URL=https://sua-api.up.railway.app/api
```

`VITE_API_URL` é usada no build do frontend. Se não definida, usa `/api` (correto para monolito).

## Deploy no Railway — Monolito

1. Crie um projeto no Railway.
2. Adicione um serviço **MySQL** (plugin oficial).
3. Adicione um serviço para a aplicação (ex: `portal-monolith`).
4. Configure as variáveis:
   ```env
   MYSQL_URL=${{ MySQL.MYSQL_URL }}
   JWT_SECRET=<64 bytes hex>
   CLIENT_URL=https://seu-monolito.up.railway.app
   APP_URL=https://seu-monolito.up.railway.app
   SERVE_CLIENT=true
   RUN_MIGRATIONS=true
   RUN_SEEDS=true
   NODE_ENV=production
   ```
5. O Railway detecta `railway.json` e usa o `Dockerfile` da raiz.
6. No primeiro deploy, `RUN_SEEDS=true` insere os usuários iniciais.
   Mude para `RUN_SEEDS=false` depois.

## Deploy no Railway — Separado

Crie dois serviços no mesmo projeto:

### API (`portal-api`)

Use `railway.api.json` como config file do serviço:

```env
SERVE_CLIENT=false
MYSQL_URL=${{ MySQL.MYSQL_URL }}
JWT_SECRET=<64 bytes hex>
CLIENT_URL=https://seu-front.up.railway.app
APP_URL=https://sua-api.up.railway.app
RUN_MIGRATIONS=true
RUN_SEEDS=true
NODE_ENV=production
```

### Web (`portal-web`)

Use `railway.web.json` como config file do serviço:

```env
VITE_API_URL=https://sua-api.up.railway.app/api
```

## Usuários iniciais (após RUN_SEEDS=true)

| Login        | Senha       | Perfil       |
|--------------|-------------|--------------|
| `admin`      | `Admin@123` | Administrador |
| `supervisor` | `Super@123` | Supervisor   |
| `sindico`    | `Sind@123`  | Síndico      |
| `subsindico` | `Sub@123`   | Subsíndico   |
| `conselho`   | `Cons@123`  | Conselho     |
| `campo`      | `Campo@123` | Equipe Campo |

> ⚠️ Troque as senhas após o primeiro acesso!

## Observações

- O Railway injeta a variável `PORT`; o container respeita essa porta.
- Migrations são seguras para produção: cada arquivo roda apenas uma vez.
- Seeds são opt-in: só rodam quando `RUN_SEEDS=true`.
- O health check é `/api/health` (monolito e API) e `/` (web separada).
- O frontend separado usa Caddy para servir SPA com fallback para `index.html`.
