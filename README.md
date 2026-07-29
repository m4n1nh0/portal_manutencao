# Portal de Manutenção v4

SaaS de manutenção condominial. Um único deploy atende vários condomínios:
cada cliente entra por um endereço próprio, enxerga apenas os seus dados e
tem plano, contrato e cobrança independentes.

React (Vite) + Node.js + MySQL 8.

- **Portal do condomínio** — tarefas, ciclo de 8 dias, agendamento, kanban,
  comprovação fotográfica, aprovação de moradores, auditoria.
- **Portal do provedor** — cadastro dos condomínios clientes, planos,
  faturas, bloqueio por inadimplência e acesso de suporte.

Arquitetura completa em [docs/multi-tenant.md](docs/multi-tenant.md).
Deploy em [docs/deployment.md](docs/deployment.md).

---

## Início rápido

```bash
npm install && npm run install:all
cp backend/.env.example backend/.env      # ajuste DB, JWT_SECRET e APP_DOMAIN
npm run db:setup                          # migrations + condomínio demo + provedor
npm run dev
```

| Onde | Endereço |
|---|---|
| Condomínio de demonstração | http://principal.localhost:5173 |
| Portal do provedor | http://admin.localhost:5173 |
| API | http://localhost:3001 |

Navegadores resolvem `*.localhost` para 127.0.0.1 sozinhos — não é preciso
editar o arquivo `hosts`.

> Requer **MySQL 8.0.13+** (o schema usa `DEFAULT (UUID())` em colunas).

---

## Endereços e identificação do condomínio

O backend descobre o condomínio pelo header `Host`. Três formas, nesta ordem
de prioridade:

| Forma | Quando usar | Variável |
|---|---|---|
| Mapa explícito de host | Domínio único (Railway/Render) ou domínio próprio do cliente | `TENANT_HOSTS` |
| Subdomínio `<slug>.<domínio>` | Produção com DNS wildcard | `APP_DOMAIN` |
| Header `X-Condominio` / `?cond=` | Só desenvolvimento | `TENANT_FALLBACK` |

```
admin.seudominio.com.br      → portal do provedor
seudominio.com.br            → portal do provedor
jardins.seudominio.com.br    → condomínio de slug "jardins"
```

Com o wildcard configurado, **cadastrar um cliente novo não exige mexer no
DNS**. Sem wildcard (domínio único), mapeie o host:

```bash
TENANT_HOSTS=meu-app.up.railway.app=principal,portaldojardins.com.br=jardins
```

O valor especial `@provedor` abre o portal comercial naquele host.

> **`TENANT_FALLBACK=false` em produção.** Ligado, o backend aceita o header
> `X-Condominio` como identificação — trocar um cabeçalho levaria ao portal
> de outro cliente. Para domínio único use `TENANT_HOSTS`, que é
> configuração de servidor e não depende do que o cliente envia.

---

## Conta do provedor

Sem ela ninguém acessa o portal comercial. Em desenvolvimento o
`npm run db:setup` já cria. Em produção (onde os seeds ficam desligados),
crie explicitamente:

```bash
npm run provedor:criar -- --login provedor --email voce@seudominio.com.br --senha 'SuaSenha@123'

# trocar a senha depois
npm run provedor:criar -- --login provedor --senha 'NovaSenha@123' --resetar-senha
```

Funciona em qualquer ambiente e recusa senha fraca.

---

## Cadastrando um condomínio

Pelo portal do provedor → **Condomínios → Novo condomínio**. O formulário faz
o onboarding inteiro numa submissão:

1. Cadastro comercial (dados, plano, valor, vencimento, período de avaliação).
2. **Conteúdo inicial**: catálogo padrão (ciclo de 8 dias, quadras A–M com
   ruas, equipes, locais e 40+ modelos de tarefa), clone de outro condomínio,
   ou começar vazio.
3. **Primeiro acesso**: o síndico/administrador do cliente.

Ao final a tela mostra a URL do cliente e as credenciais provisórias.

---

## Usuários iniciais (desenvolvimento)

Criados apenas com `NODE_ENV=development` pelo `npm run seed` ou
`npm run docker:dev`. Idempotente: se o login já existir, é mantido.

Portal do provedor — `admin.localhost:5173`:

| Login      | Senha          | Perfil   |
|------------|----------------|----------|
| `provedor` | `Provedor@123` | Provedor |

Condomínio de demonstração — `principal.localhost:5173`:

| Login        | Senha       | Perfil        |
|--------------|-------------|---------------|
| `admin`      | `Admin@123` | Administrador |
| `supervisor` | `Super@123` | Supervisor    |
| `sindico`    | `Sind@123`  | Sindico       |
| `subsindico` | `Sub@123`   | Subsindico    |
| `conselho`   | `Cons@123`  | Conselho      |
| `campo`      | `Campo@123` | Equipe Campo  |
| `morador`    | `Mor@123`   | Morador       |

O `conselho` analisa e aprova cadastros sem acesso administrativo completo.
O `provedor` (superadmin) opera o portal comercial e não pertence a nenhum
condomínio.

---

## Banco de dados

```bash
npm run migrate          # só estrutura — seguro em produção
npm run seed             # dados de demonstração (bloqueado fora de dev)
npm run db:setup         # migrate + seed
npm run provedor:criar   # conta do provedor (qualquer ambiente)
```

- `database/migrations/*.sql` — apenas estrutura/evolução. Aplicadas uma vez,
  registradas em `_migrations`.
- `database/seeds/*.sql` — dados demonstrativos, escopados ao condomínio
  `principal`.

Todas as tabelas operacionais têm `condominio_id`. As rotas nunca usam o pool
global: passam por `req.db`, que **recusa SQL tocando tabela multi-tenant sem
`condominio_id`** — um `WHERE` esquecido vira erro, não vazamento entre
clientes.

### Migrando uma base existente

A migration `20260728_001_multitenancy.sql` converte uma base mono-condomínio
em multi-tenant sem perder dados: cria o "Condomínio Principal", move tudo o
que já existe para ele e transforma as chaves únicas em únicas-por-condomínio.
É idempotente. **Faça backup antes**:

```bash
mysqldump -u USER -p BANCO > backup.sql
npm run migrate
```

---

## Camada comercial

```
trial ──▶ ativo ──▶ inadimplente ──▶ suspenso
             ▲            │              │
             └── pagou ───┴──────────────┘
```

| Estado | Login | Escrita |
|---|---|---|
| `trial` | ✅ | ✅ até `trial_expira_em` |
| `ativo` | ✅ | ✅ |
| `inadimplente` | ✅ | ❌ (402) após `dias_tolerancia` |
| `suspenso` | ❌ | ❌ |

O modo somente leitura libera `GET` e as rotas de conta de propósito: o
cliente continua consultando e não fica preso. Limites de plano
(usuários/moradores/unidades) são verificados na hora da ação.

Rotinas de cobrança no painel — "Gerar faturas do mês" e "Rodar cobrança" —
ou por cron em `POST /api/provedor/faturamento/{gerar,atualizar}`.

---

## Build para produção

```bash
npm run build   # gera backend/public/
npm start       # serve API + SPA em :3001
```

Em produção as migrations sobem somente a estrutura; seeds ficam desligados
(`RUN_SEEDS=false`). Variáveis obrigatórias: `JWT_SECRET`, `APP_DOMAIN` (ou
`TENANT_HOSTS`) e `TENANT_FALLBACK=false`.

## Docker

```bash
npm run docker:dev        # stack de desenvolvimento
npm run docker:monolith   # API + SPA num container
npm run docker:split      # API e frontend separados
```
