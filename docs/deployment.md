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

   # ── Multi-tenant: OBRIGATÓRIO, ver secao abaixo ──
   TENANT_FALLBACK=false
   TENANT_HOSTS=seu-monolito.up.railway.app=principal
   ```
5. O Railway detecta `railway.json` e usa o `Dockerfile` da raiz.
6. Se voce realmente quiser criar os usuarios de exemplo no primeiro deploy,
   defina `RUN_SEEDS=true` e `ALLOW_DEV_SEEDS=true`, depois volte ambos para `false`.

## Multi-tenant no Railway

A migration de multi-tenancy roda sozinha (`RUN_MIGRATIONS=true`) e converte
uma base existente sem perder dados. Mas **duas configuracoes sao obrigatorias
ou o deploy quebra**.

### 1. Identificacao do condominio pelo host

O backend descobre o condominio pelo header `Host`. Um dominio do Railway
(`seu-app.up.railway.app`) nao segue o padrao `<slug>.<APP_DOMAIN>`, entao
precisa ser mapeado explicitamente:

```env
TENANT_HOSTS=seu-app.up.railway.app=principal
TENANT_FALLBACK=false
```

Sem isso o host cai como "nao reconhecido" e abre o portal do provedor em vez
do portal do condominio (o log avisa, com a dica de configuracao).

> **O dominio `*.up.railway.app` nao serve para subdominio por condominio.**
> O certificado do Railway cobre o host exato do servico; `<slug>.seu-app.up.railway.app`
> seria um wildcard aninhado sob um dominio que nao e seu, e o navegador barra
> com `ERR_CERT_COMMON_NAME_INVALID` antes de chegar na aplicacao. Wildcard so
> existe em dominio proprio adicionado como custom domain.

### Um host so: alternando entre os dois portais

Com um unico host, ele serve o portal do condominio **ou** o do provedor.
Enquanto nao houver dominio proprio, alterne a variavel conforme a tarefa
(cada troca reinicia o servico):

```env
# rotina: usar o portal do condominio
TENANT_HOSTS=seu-app.up.railway.app=principal

# eventual: cadastrar/gerenciar condominios, planos e faturas
TENANT_HOSTS=seu-app.up.railway.app=@provedor
```

Solucao temporaria: nao serve para uso real, porque nenhum cliente pode estar
usando o portal enquanto voce esta no modo provedor.

**Quando tiver dominio proprio com wildcard**, troque para:

```env
APP_DOMAIN=seudominio.com.br
TENANT_FALLBACK=false
# TENANT_HOSTS deixa de ser necessario
```

Configure no Railway o dominio `*.seudominio.com.br` apontando para o servico.
Cada cliente novo passa a funcionar sem mexer no DNS.

Os dois modos convivem: `TENANT_HOSTS` tem prioridade e serve tambem para
dominio proprio de cliente (white label), por exemplo
`TENANT_HOSTS=portaldojardins.com.br=jardins`.

### 2. Conta do provedor

Os seeds ficam desligados em producao, entao **nao existe superadmin depois do
deploy** — ninguem consegue entrar no portal comercial. Crie pelo shell do
Railway:

```bash
npm run provedor:criar -- --login provedor --email voce@seudominio.com.br --senha 'SuaSenha@123'
```

O script roda em qualquer ambiente, recusa senha fraca e e idempotente
(`--resetar-senha` troca a senha de uma conta existente).

### Ordem recomendada no primeiro deploy

1. Defina as variaveis (incluindo `TENANT_HOSTS` e `TENANT_FALLBACK=false`).
2. Faca o deploy — as migrations rodam e criam o "Condominio Principal",
   movendo os dados existentes para ele.
3. Crie a conta do provedor pelo shell.
4. Entre no portal do provedor e ajuste nome/slug do condominio principal.
5. Cadastre os demais clientes pela tela "Novo condominio".

> A migration nao pode violar as novas chaves unicas: `login` e `email` ja
> eram unicos globalmente, e passam a ser unicos por condominio — restricao
> mais fraca. Ainda assim, faca backup antes (`mysqldump`).

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
O seed e idempotente: usuarios existentes nao sao recriados nem sobrescritos.

| Login        | Senha       | Perfil       |
|--------------|-------------|--------------|
| `admin`      | `Admin@123` | Administrador |
| `supervisor` | `Super@123` | Supervisor   |
| `sindico`    | `Sind@123`  | Síndico      |
| `subsindico` | `Sub@123`   | Subsíndico   |
| `conselho`   | `Cons@123`  | Conselho     |
| `campo`      | `Campo@123` | Equipe Campo |

O usuário `conselho` representa o perfil de conselheiro, com permissões específicas para análise e aprovação, conforme definido nos seeds e permissões do sistema.

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
