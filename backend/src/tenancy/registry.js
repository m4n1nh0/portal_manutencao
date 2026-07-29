/**
 * Registry de condominios (tenants).
 *
 * Responsavel por resolver slug/id -> condominio e por decidir de qual pool
 * MySQL os dados daquele condominio vem:
 *
 *   isolamento = 'compartilhado'  -> pool principal (padrao hoje)
 *   isolamento = 'dedicado'       -> pool proprio, criado a partir de db_config
 *
 * O plano de controle (condominios, planos, faturas) fica SEMPRE no banco
 * principal, mesmo para clientes com banco dedicado.
 */
const mysql = require('mysql2/promise');
const poolPrincipal = require('../config/database');
const logger = require('../config/logger');
const { TenantDb } = require('./tenantDb');

const TTL_MS = parseInt(process.env.TENANT_CACHE_TTL_MS || '60000', 10);

const cachePorSlug = new Map(); // slug -> { condominio, expiraEm }
const cachePorId = new Map();   // id   -> { condominio, expiraEm }
const poolsDedicados = new Map(); // condominio_id -> pool

const COLUNAS = `
  c.id, c.slug, c.nome, c.razao_social, c.cnpj, c.email_contato, c.telefone, c.responsavel,
  c.cep, c.logradouro, c.numero, c.complemento, c.bairro, c.cidade, c.uf, c.total_unidades,
  c.logo_url, c.cor_primaria, c.plano_id, c.valor_mensal, c.status, c.trial_expira_em,
  c.contrato_inicio, c.contrato_fim, c.dia_vencimento, c.dias_tolerancia, c.bloqueio_automatico,
  c.isolamento, c.db_config, c.provisionado_em, c.ativo, c.criado_em,
  p.codigo AS plano_codigo, p.nome AS plano_nome, p.preco_mensal AS plano_preco,
  p.max_unidades, p.max_usuarios, p.max_moradores, p.recursos AS plano_recursos`;

function fresco(entrada) {
  return entrada && entrada.expiraEm > Date.now();
}

function guardarCache(condominio) {
  const entrada = { condominio, expiraEm: Date.now() + TTL_MS };
  cachePorId.set(condominio.id, entrada);
  cachePorSlug.set(condominio.slug, entrada);
  return condominio;
}

async function carregar(campo, valor) {
  const [[linha]] = await poolPrincipal.query(
    `SELECT ${COLUNAS} FROM condominios c LEFT JOIN planos p ON p.id = c.plano_id WHERE c.${campo} = ? LIMIT 1`,
    [valor]
  );
  return linha || null;
}

async function buscarPorSlug(slug) {
  if (!slug) return null;
  const chave = String(slug).toLowerCase();
  const cache = cachePorSlug.get(chave);
  if (fresco(cache)) return cache.condominio;

  const condominio = await carregar('slug', chave);
  return condominio ? guardarCache(condominio) : null;
}

async function buscarPorId(id) {
  if (!id) return null;
  const cache = cachePorId.get(id);
  if (fresco(cache)) return cache.condominio;

  const condominio = await carregar('id', id);
  return condominio ? guardarCache(condominio) : null;
}

/** Chame apos qualquer alteracao no cadastro do condominio. */
function invalidar(condominio) {
  if (!condominio) { cachePorId.clear(); cachePorSlug.clear(); return; }
  if (typeof condominio === 'string') {
    const entrada = cachePorId.get(condominio);
    if (entrada) cachePorSlug.delete(entrada.condominio.slug);
    cachePorId.delete(condominio);
    cachePorSlug.delete(condominio);
    return;
  }
  cachePorId.delete(condominio.id);
  cachePorSlug.delete(condominio.slug);
}

/**
 * Pool do condominio. Hoje quase sempre o principal; a ramificacao existe
 * para que migrar um cliente grande para banco proprio seja mudanca de
 * cadastro, nao de codigo.
 */
function poolPara(condominio) {
  if (condominio.isolamento !== 'dedicado') return poolPrincipal;

  const existente = poolsDedicados.get(condominio.id);
  if (existente) return existente;

  const cfg = typeof condominio.db_config === 'string'
    ? JSON.parse(condominio.db_config)
    : condominio.db_config;

  if (!cfg?.host || !cfg?.database) {
    logger.error('Condominio marcado como dedicado sem db_config valido; usando pool principal', {
      condominio: condominio.slug,
    });
    return poolPrincipal;
  }

  const pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port || 3306,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: parseInt(cfg.poolMax || process.env.DB_POOL_MAX || '5', 10),
    charset: 'utf8mb4',
    timezone: 'local',
    enableKeepAlive: true,
  });

  poolsDedicados.set(condominio.id, pool);
  logger.info('Pool dedicado criado para condominio', { condominio: condominio.slug, host: cfg.host });
  return pool;
}

/** Handle de banco ja amarrado ao condominio. */
function dbPara(condominio) {
  return new TenantDb({ pool: poolPara(condominio), condominio });
}

async function encerrarPools() {
  for (const [id, pool] of poolsDedicados) {
    await pool.end().catch(() => {});
    poolsDedicados.delete(id);
  }
}

module.exports = {
  buscarPorSlug,
  buscarPorId,
  invalidar,
  poolPara,
  dbPara,
  encerrarPools,
  poolPrincipal,
};
