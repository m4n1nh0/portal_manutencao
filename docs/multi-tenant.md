# Multi-tenant: vendendo o portal para vários condomínios

Um único deploy atende N condomínios. Cada cliente acessa por um subdomínio
próprio, enxerga apenas os seus dados e tem contrato, plano e cobrança
independentes. Quem vende o sistema opera tudo pelo **portal do provedor**.

---

## 1. Endereços

| Endereço | O que abre |
|---|---|
| `admin.seudominio.com.br` | Portal do provedor (gestão comercial) |
| `painel.seudominio.com.br` | Idem (alias configurável) |
| `seudominio.com.br` | Portal do provedor |
| `jardins.seudominio.com.br` | Portal do condomínio de slug `jardins` |
| `vilanova.seudominio.com.br` | Portal do condomínio de slug `vilanova` |

O backend descobre o condomínio pelo header `Host`. Não há troca de
condomínio dentro da sessão: um token emitido para o condomínio A é
rejeitado no subdomínio de B (`TENANT_INCOMPATIVEL`).

### Infraestrutura necessária

1. **DNS wildcard**: registro `A`/`CNAME` para `*.seudominio.com.br`.
2. **Certificado curinga** (`*.seudominio.com.br`) — Let's Encrypt emite via
   desafio DNS-01.
3. `APP_DOMAIN=seudominio.com.br` no ambiente do backend.
4. `TENANT_FALLBACK=false` em produção (ver "Segurança" abaixo).

Cadastrar um cliente novo **não exige mexer no DNS** — o wildcard já cobre
qualquer slug.

### Hosts fora do padrão: `TENANT_HOSTS`

Nem todo host segue `<slug>.APP_DOMAIN`. Para esses existe um mapa explícito:

```bash
TENANT_HOSTS=meu-app.up.railway.app=principal,portaldojardins.com.br=jardins,admin.meudominio.com=@provedor
```

Resolve dois casos reais:

- **Deploy em domínio único** (Railway, Render, URLs de preview): sem
  wildcard, um host precisa apontar para um condomínio específico. Sem isso a
  aplicação não identifica o condomínio e cai no portal do provedor.
- **Domínio próprio do cliente** (white label): `portaldojardins.com.br`
  atendendo o condomínio `jardins`.

O mapa tem **prioridade** sobre a análise por subdomínio, e é seguro em
produção por ser configuração de servidor — ao contrário de `TENANT_FALLBACK`,
que depende de um cabeçalho enviado pelo cliente.

Hosts não reconhecidos **não viram condomínio por palpite**: o parser não
adivinha o slug pelo primeiro rótulo, porque num deploy de domínio único isso
transformaria `meu-app.up.railway.app` no slug `meu-app` e derrubaria a
aplicação inteira. Eles caem no portal do provedor, com um aviso no log
indicando a configuração que falta.

---

## 2. Isolamento dos dados

Modelo híbrido: **um banco hoje, separável por cliente depois**.

- Todas as tabelas operacionais têm `condominio_id` com chave estrangeira
  para `condominios` e `ON DELETE CASCADE`.
- As chaves únicas passaram a ser por condomínio: dois condomínios podem ter
  a `Quadra A`, a equipe `Manutenção` e até o mesmo e-mail de usuário.
- Nenhuma rota usa o pool global. Toda consulta passa por `req.db`
  (`backend/src/tenancy/tenantDb.js`), que **recusa SQL tocando uma tabela
  multi-tenant sem mencionar `condominio_id`**. Um `WHERE` esquecido vira
  erro 500 em desenvolvimento, não vazamento entre clientes.
- Para agregações do provedor e tabelas de controle existe `db.unscoped()`,
  com nome propositalmente feio para saltar aos olhos na revisão.

### Migrar um cliente para banco dedicado

O caminho já está montado; é mudança de cadastro, não de código:

1. Crie o banco novo e aplique as migrations nele.
2. Copie os dados daquele `condominio_id`.
3. No registro do condomínio, defina:
   ```sql
   UPDATE condominios
      SET isolamento = 'dedicado',
          db_config = JSON_OBJECT('host','...','port',3306,'user','...','password','...','database','...')
    WHERE slug = 'jardins';
   ```
4. `registry.poolPara()` passa a abrir um pool exclusivo para esse cliente.

O **plano de controle** (`condominios`, `planos`, `condominio_faturas`)
continua sempre no banco principal, mesmo para clientes dedicados.

---

## 3. Portal do provedor

`admin.seudominio.com.br` — acesso apenas com perfil `superadmin`, que não
pertence a condomínio nenhum.

| Tela | O que faz |
|---|---|
| Visão geral | MRR, recebido no mês, atrasos, carteira por status |
| Condomínios | Cadastro, busca, situação e uso real de cada cliente |
| Condomínio (detalhe) | Cadastro, contrato, acessos, faturas, suporte |
| Planos | Preço, limites (unidades/usuários/moradores) e recursos |
| Faturas | Geração mensal, baixa de pagamento, cobrança |

### Onboarding em uma tela

O formulário "Novo condomínio" faz o ciclo inteiro numa submissão:

1. Cadastro comercial (dados, plano, valor, vencimento, avaliação).
2. **Provisionamento**: cópia do catálogo padrão (ciclo de 8 dias, quadras
   A–M com ruas, equipes, locais e 40+ modelos de tarefa) — ou clone de um
   condomínio existente, ou começar vazio.
3. **Primeiro acesso**: cria o síndico/administrador do cliente.

Ao final, o painel mostra a URL do cliente e as credenciais provisórias.

### Suporte dentro do cliente

"Entrar como suporte" emite um token curto (padrão 60 min, sem refresh) que
vale **apenas** no subdomínio daquele condomínio. O portal do cliente exibe
uma faixa avisando que é acesso de suporte, e toda ação fica no `audit_log`
com `_impersonado_por`.

---

## 4. Camada comercial

### Escada de bloqueio

```
trial ──▶ ativo ──▶ inadimplente ──▶ suspenso
             ▲            │              │
             └── pagou ───┴──────────────┘
```

| Estado | Login | Escrita | Quando |
|---|---|---|---|
| `trial` | ✅ | ✅ | até `trial_expira_em` |
| `ativo` | ✅ | ✅ | contrato em dia |
| `inadimplente` | ✅ | ❌ (402) | fatura vencida + `dias_tolerancia` |
| `suspenso` | ❌ | ❌ | vencida há mais de `SUSPENSAO_APOS_DIAS` |
| `cancelado` | ❌ | ❌ | contrato encerrado / arquivado |

O modo somente leitura libera `GET` e as rotas de conta (logout, troca de
senha) de propósito: o cliente continua consultando e não fica preso.
`bloqueio_automatico = 0` no cadastro desliga a escada para um cliente
específico.

### Limites de plano

Verificados no momento da ação, com HTTP 402 e código `LIMITE_PLANO`:

- `max_usuarios` — ao criar usuário interno;
- `max_moradores` — no registro público e na aprovação de morador;
- `max_unidades` — informativo no cadastro.

Campo vazio = ilimitado.

### Rotinas de cobrança

| Rota | O que faz |
|---|---|
| `POST /api/provedor/faturamento/gerar` | Lança a fatura do mês para a carteira |
| `POST /api/provedor/faturamento/atualizar` | Marca vencidas, aplica bloqueios e reativa quem pagou |

Idempotentes — a chave única `(condominio_id, competencia)` impede duplicata.
Dá para chamá-las por cron; no painel elas estão em "Gerar faturas do mês" e
"Rodar cobrança".

---

## 5. Desenvolvimento local

Navegadores resolvem `*.localhost` para `127.0.0.1` sem mexer no `hosts`:

```bash
npm run db:setup   # migrations + condomínio "principal" + provedor
npm run dev

# Condomínio de demonstração
http://principal.localhost:5173

# Portal do provedor
http://admin.localhost:5173
```

Contas criadas pelo seed (apenas em `NODE_ENV=development`):

| Onde | Login | Senha |
|---|---|---|
| `admin.localhost` | `provedor` | `Provedor@123` |
| `principal.localhost` | `admin` | `Admin@123` |
| `principal.localhost` | `sindico` | `Sind@123` |

> O proxy do Vite usa `changeOrigin: false` justamente para o header `Host`
> chegar ao backend. Se mudar isso, a identificação por subdomínio para de
> funcionar em desenvolvimento.

---

## 6. Segurança

- **`TENANT_FALLBACK=false` em produção.** Ligado, o backend aceita o header
  `X-Condominio` e `?cond=` como identificação — conveniente em dev, mas em
  produção significaria que trocar um cabeçalho leva ao portal de outro
  cliente. Com ele desligado, o condomínio vem só do `Host`.
- **Token amarrado ao condomínio.** O JWT carrega `condominio_id`; o
  middleware compara com o subdomínio a cada requisição.
- **CORS por família de hosts.** `*.APP_DOMAIN` é aceito; o resto não.
- **Rate limit por condomínio + IP**, para o excesso de um cliente não
  derrubar os outros.
- **Auditoria com `condominio_id`**, inclusive nas tentativas de login.
- Suspender ou cancelar um condomínio **revoga as sessões ativas na hora**.

---

## 7. Exclusão de cliente

- **Arquivar** (padrão): encerra o acesso, preserva todos os dados.
- **Excluir definitivamente**: apaga em cascata tudo do condomínio. Exige
  `?definitivo=true&confirmacao=<slug>` — digitar o slug é a confirmação.
