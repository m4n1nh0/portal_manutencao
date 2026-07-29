/**
 * Resolucao de condominio por subdominio.
 *
 *   jardins.seudominio.com.br  -> condominio de slug "jardins"
 *   admin.seudominio.com.br    -> portal do provedor (sem condominio)
 *   seudominio.com.br          -> portal do provedor
 *
 * Em desenvolvimento, onde subdominio real da trabalho, aceita tambem
 * o header X-Condominio, a query ?cond= e um slug padrao configuravel.
 */
const registry = require('../tenancy/registry');
const { avaliarContrato } = require('../tenancy/acesso');
const logger = require('../config/logger');

const APP_DOMAIN = (process.env.APP_DOMAIN || 'localhost').toLowerCase();
const SUBDOMINIOS_PROVEDOR = new Set(
  (process.env.PROVIDER_SUBDOMAIN || 'admin,painel').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
);
// Rotulos que nunca podem virar slug de cliente.
const SLUGS_RESERVADOS = new Set([
  'www', 'api', 'app', 'admin', 'painel', 'portal', 'cdn', 'static', 'assets',
  'mail', 'smtp', 'ftp', 'ns1', 'ns2', 'blog', 'suporte', 'status', 'docs',
]);

const PERMITE_FALLBACK = process.env.TENANT_FALLBACK
  ? process.env.TENANT_FALLBACK === 'true'
  : process.env.NODE_ENV !== 'production';
const SLUG_PADRAO = (process.env.TENANT_DEFAULT_SLUG || 'principal').toLowerCase();

/**
 * Mapa explicito host -> condominio, para hosts que nao seguem o padrao
 * <slug>.APP_DOMAIN. Resolve dois casos reais:
 *
 *   1. Deploy em dominio unico (Railway, Render, preview): sem wildcard,
 *      um host so precisa apontar para um condominio especifico.
 *   2. Dominio proprio do cliente (white label): portaldojardins.com.br
 *      atendendo o condominio "jardins".
 *
 * Formato: TENANT_HOSTS="host1=slug1,host2=slug2,admin.meudominio.com=@provedor"
 * O valor especial @provedor abre o portal comercial naquele host.
 *
 * E configuracao de servidor, nao cabecalho do cliente — por isso e seguro
 * mesmo em producao, ao contrario do TENANT_FALLBACK.
 */
const HOSTS_MAPEADOS = new Map(
  (process.env.TENANT_HOSTS || '')
    .split(',')
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const [host, destino] = par.split('=').map((s) => (s || '').trim().toLowerCase());
      return host && destino ? [host.replace(/:\d+$/, ''), destino] : null;
    })
    .filter(Boolean)
);

const IP_LITERAL = /^(\d{1,3}\.){3}\d{1,3}$|^\[?[0-9a-f:]+\]?$/i;

// Avisa uma vez por host desconhecido, para nao inundar o log.
const avisouHostDesconhecido = new Set();

function normalizarSlug(valor) {
  return String(valor || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function ehSlugValido(slug) {
  return /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug) && !SLUGS_RESERVADOS.has(slug);
}

/**
 * Extrai o rotulo de subdominio do host.
 * @returns {{ tipo: 'provedor'|'tenant'|'indefinido', slug: string|null }}
 */
function analisarHost(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/:\d+$/, '');
  if (!host || IP_LITERAL.test(host)) return { tipo: 'indefinido', slug: null };

  if (host === APP_DOMAIN || host === `www.${APP_DOMAIN}`) return { tipo: 'provedor', slug: null };

  if (host.endsWith(`.${APP_DOMAIN}`)) {
    const rotulo = host.slice(0, -(APP_DOMAIN.length + 1)).split('.')[0];
    if (SUBDOMINIOS_PROVEDOR.has(rotulo)) return { tipo: 'provedor', slug: null };
    if (rotulo === 'www') return { tipo: 'provedor', slug: null };
    return { tipo: 'tenant', slug: rotulo };
  }

  // Host fora do dominio configurado (*.up.railway.app, preview URLs, IPs).
  // Nao adivinhamos o condominio pelo primeiro rotulo: num deploy de dominio
  // unico isso transformaria "meu-app.up.railway.app" no slug "meu-app" e
  // derrubaria a aplicacao inteira com "condominio nao encontrado".
  // Para esses hosts existe o TENANT_HOSTS, que e explicito.
  const rotulo = host.split('.')[0];
  if (SUBDOMINIOS_PROVEDOR.has(rotulo)) return { tipo: 'provedor', slug: null };
  return { tipo: 'indefinido', slug: null };
}

function slugSolicitado(req) {
  // O mapa explicito tem prioridade: e a unica forma de um host fora do
  // padrao <slug>.APP_DOMAIN apontar para o condominio certo.
  const host = String(req.hostname || req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  const mapeado = HOSTS_MAPEADOS.get(host);
  if (mapeado) {
    if (mapeado === '@provedor' || mapeado === '@provider') return { provedor: true, slug: null, origem: 'mapa' };
    return { provedor: false, slug: mapeado, origem: 'mapa' };
  }

  const analise = analisarHost(req.hostname || req.headers.host);
  if (analise.tipo === 'provedor') return { provedor: true, slug: null, origem: 'host' };
  if (analise.tipo === 'tenant') return { provedor: false, slug: analise.slug, origem: 'host' };

  // Header e query só valem com TENANT_FALLBACK ligado (padrão: fora de
  // produção). Em produção o condomínio vem SÓ do host — caso contrário
  // bastaria trocar um cabeçalho para cair no portal de outro cliente.
  if (!PERMITE_FALLBACK) {
    if (!avisouHostDesconhecido.has(host)) {
      avisouHostDesconhecido.add(host);
      logger.warn('Host nao reconhecido; caindo no portal do provedor', {
        host,
        appDomain: APP_DOMAIN,
        hint: `Configure APP_DOMAIN=${host.split('.').slice(1).join('.') || host} ou mapeie em TENANT_HOSTS="${host}=<slug>".`,
      });
    }
    return { provedor: true, slug: null, origem: 'indefinido' };
  }

  const cabecalho = normalizarSlug(req.headers['x-condominio']);
  if (cabecalho) {
    if (SUBDOMINIOS_PROVEDOR.has(cabecalho)) return { provedor: true, slug: null, origem: 'header' };
    return { provedor: false, slug: cabecalho, origem: 'header' };
  }

  const query = normalizarSlug(req.query?.cond);
  if (query) return { provedor: false, slug: query, origem: 'query' };

  return { provedor: false, slug: SLUG_PADRAO, origem: 'padrao' };
}

/**
 * Popula req.tenant / req.db / req.contrato. Nunca rejeita a requisicao:
 * quem exige tenant e o middleware `exigirTenant`.
 */
async function resolverTenant(req, res, next) {
  const { provedor, slug, origem } = slugSolicitado(req);
  req.contextoProvedor = provedor;
  req.tenantSlug = slug;
  req.tenantOrigem = origem;
  req.tenant = null;
  req.db = null;
  req.contrato = null;

  if (provedor || !slug) return next();

  try {
    const condominio = await registry.buscarPorSlug(slug);
    if (!condominio) {
      logger.warn('Subdominio sem condominio correspondente', { slug, host: req.hostname, origem });
      return next();
    }
    req.tenant = condominio;
    req.db = registry.dbPara(condominio);
    req.contrato = avaliarContrato(condominio);
    res.setHeader('X-Condominio', condominio.slug);
    return next();
  } catch (error) {
    return next(error);
  }
}

/** Exige que a requisicao esteja em um subdominio de condominio valido. */
function exigirTenant(req, res, next) {
  if (req.tenant) return next();
  return res.status(404).json({
    erro: req.tenantSlug
      ? `Condominio "${req.tenantSlug}" nao encontrado.`
      : 'Endereco sem condominio identificado. Acesse pelo subdominio do seu condominio.',
    codigo: 'TENANT_NAO_ENCONTRADO',
  });
}

/** Portal do provedor: exige contexto sem condominio (ou superadmin autenticado). */
function exigirContextoProvedor(req, res, next) {
  if (req.contextoProvedor || req.usuario?.perfil === 'superadmin') return next();
  return res.status(404).json({ erro: 'Rota disponivel apenas no portal do provedor.' });
}

/**
 * Corta o acesso de condominios suspensos/cancelados.
 *
 * Revogar as sessoes nao basta: o JWT de acesso e sem estado e continuaria
 * valido ate expirar (horas). Sem esta checagem por requisicao, suspender um
 * cliente inadimplente so faria efeito no proximo login.
 */
function exigirContratoAtivo(req, res, next) {
  if (!req.contrato || req.contrato.permiteLogin) return next();
  // O provedor precisa entrar justamente quando o contrato esta travado.
  if (req.usuario?.perfil === 'superadmin') return next();

  return res.status(403).json({
    erro: req.contrato.mensagem,
    codigo: 'CONTRATO_BLOQUEADO',
    estado: req.contrato.estado,
  });
}

/**
 * Modo somente leitura por inadimplencia. Libera GET/HEAD e as rotas de
 * conta (logout, troca de senha) para o usuario nao ficar preso.
 */
function bloquearEscritaInadimplente(req, res, next) {
  if (!req.contrato?.somenteLeitura) return next();
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.usuario?.perfil === 'superadmin') return next();
  if (req.path.startsWith('/auth/')) return next();

  return res.status(402).json({
    erro: req.contrato.mensagem || 'Portal em modo somente leitura.',
    codigo: 'CONTRATO_BLOQUEADO',
    estado: req.contrato.estado,
  });
}

module.exports = {
  resolverTenant,
  exigirTenant,
  exigirContextoProvedor,
  exigirContratoAtivo,
  bloquearEscritaInadimplente,
  analisarHost,
  normalizarSlug,
  ehSlugValido,
  slugSolicitado,
  SLUGS_RESERVADOS,
  HOSTS_MAPEADOS,
  APP_DOMAIN,
};
