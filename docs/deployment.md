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
RUN_SEEDS=false      # use true somente se tambem definir ALLOW_DEV_SEEDS=true
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
   RUN_SEEDS=false
   NODE_ENV=production
   ```
5. O Railway detecta `railway.json` e usa o `Dockerfile` da raiz.
6. Se voce realmente quiser criar os usuarios de exemplo no primeiro deploy,
   defina `RUN_SEEDS=true` e `ALLOW_DEV_SEEDS=true`, depois volte ambos para `false`.

## Migrations e seeds

- `database/migrations/*.sql`: somente estrutura e evolucao do banco.
- `database/seeds/*.sql`: dados demonstrativos e cadastros operacionais de desenvolvimento.
- `backend/scripts/seed.js`: aplica os arquivos de seed em ordem alfabetica e cria os usuarios de exemplo com bcrypt.

Os seeds atuais incluem rotinas diarias, semanais, mensais e anuais com status mistos
(`Pendente`, `Em Andamento`, `Em Revisao` e `Concluido`) para facilitar a validacao do dashboard,
kanban e telas por perfil.

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
RUN_SEEDS=false
NODE_ENV=production
```

### Web (`portal-web`)

Use `railway.web.json` como config file do serviço:

```env
VITE_API_URL=https://sua-api.up.railway.app/api
```

## Usuarios iniciais de exemplo

Esses usuarios so sao criados quando `RUN_SEEDS=true` e `ALLOW_DEV_SEEDS=true`.

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
- Seeds sao opt-in e protegidos: rodam somente com `RUN_SEEDS=true` e, em producao, tambem `ALLOW_DEV_SEEDS=true`.
- O health check é `/api/health` (monolito e API) e `/` (web separada).
- O frontend separado usa Caddy para servir SPA com fallback para `index.html`.

## Logs de deploy

O container agora imprime um resumo no boot com Node, modo (`SERVE_CLIENT`),
flags de migrations/seeds, storage e configuracao do banco com senha mascarada.

Variaveis uteis:

- `LOG_LEVEL=info` ou `debug`
- `LOG_FORMAT=text` ou `json`
- `LOG_STACKS=true` para stack traces nos erros
- `LOG_SQL_ON_ERROR=true` para incluir ate 2000 caracteres do SQL que falhou
- `WAIT_FOR_DB=true` e `DB_WAIT_TIMEOUT_SECONDS=60` para aguardar o MySQL antes de iniciar

Para acompanhar localmente:

```bash
npm run docker:logs
```
