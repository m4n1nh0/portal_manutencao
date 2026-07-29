/**
 * TenantDb — handle de banco amarrado a um condominio.
 *
 * Todo acesso a dados operacionais passa por aqui. O objetivo e duplo:
 *
 *   1. Isolamento: `query()` recusa SQL que toque uma tabela multi-tenant
 *      sem mencionar condominio_id. Um WHERE esquecido vira erro 500 no
 *      desenvolvimento em vez de vazamento de dados entre clientes.
 *
 *   2. Portabilidade: o pool vem do registry, nao do modulo global. Hoje
 *      todos os condominios compartilham o mesmo pool; quando um cliente
 *      migrar para banco dedicado, apenas o registry muda — nenhuma rota
 *      precisa ser reescrita.
 */

// Tabelas que carregam condominio_id e nunca podem ser lidas sem escopo.
const TABELAS_TENANT = new Set([
  'usuarios',
  'sessoes',
  'audit_log',
  'ciclo_8dias',
  'ciclo_atividades',
  'quadras',
  'ruas',
  'equipes',
  'locais',
  'tarefa_modelos',
  'tarefas',
  'historico_tarefas',
  'comprovacoes',
  'observacoes_moradores',
]);

// Tabelas do plano de controle: pertencem ao provedor, nunca a um condominio.
const TABELAS_CONTROLE = new Set(['condominios', 'planos', 'condominio_faturas', '_migrations']);

const REF_TABELA = /\b(?:from|join|into|update)\s+`?([a-z_][a-z0-9_]*)`?/gi;

class TenantScopeError extends Error {
  constructor(tabelas, sql) {
    super(
      `Consulta sem escopo de condominio nas tabelas [${tabelas.join(', ')}]. ` +
      'Inclua condominio_id no SQL ou use db.unscoped() explicitamente. ' +
      `SQL: ${sql.replace(/\s+/g, ' ').trim().slice(0, 200)}`
    );
    this.name = 'TenantScopeError';
    this.status = 500;
    this.tabelas = tabelas;
  }
}

function tabelasReferenciadas(sql) {
  const encontradas = new Set();
  let match;
  REF_TABELA.lastIndex = 0;
  while ((match = REF_TABELA.exec(sql)) !== null) encontradas.add(match[1].toLowerCase());
  return encontradas;
}

/**
 * Guarda de escopo. Heuristica deliberadamente simples: se o SQL toca uma
 * tabela multi-tenant, precisa mencionar condominio_id em algum lugar.
 * Nao substitui revisao de codigo — pega o esquecimento, nao o erro logico.
 */
function verificarEscopo(sql) {
  const tabelas = [...tabelasReferenciadas(sql)].filter((t) => TABELAS_TENANT.has(t));
  if (!tabelas.length) return;
  if (/condominio_id/i.test(sql)) return;
  throw new TenantScopeError(tabelas, sql);
}

class TenantDb {
  /**
   * @param {object} params
   * @param {import('mysql2/promise').Pool} params.pool
   * @param {object} params.condominio linha da tabela condominios
   */
  constructor({ pool, condominio }) {
    this.pool = pool;
    this.condominio = condominio;
  }

  get id() { return this.condominio.id; }
  get slug() { return this.condominio.slug; }
  get nome() { return this.condominio.nome; }
  get isolamento() { return this.condominio.isolamento; }

  /** Consulta com guarda de escopo. Use sempre este metodo nas rotas. */
  query(sql, params = []) {
    verificarEscopo(sql);
    return this.pool.query(sql, params);
  }

  /**
   * Escape hatch sem guarda — para agregacoes de controle, DDL de
   * provisionamento e consultas em tabelas nao multi-tenant.
   * O nome e feio de proposito: deve saltar aos olhos na revisao.
   */
  unscoped(sql, params = []) {
    return this.pool.query(sql, params);
  }

  /** Executa `fn` dentro de uma transacao, com a mesma guarda de escopo. */
  async transaction(fn) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const tx = {
        id: this.id,
        condominio: this.condominio,
        query: (sql, params = []) => { verificarEscopo(sql); return conn.query(sql, params); },
        unscoped: (sql, params = []) => conn.query(sql, params),
      };
      const resultado = await fn(tx);
      await conn.commit();
      return resultado;
    } catch (error) {
      await conn.rollback().catch(() => {});
      throw error;
    } finally {
      conn.release();
    }
  }
}

module.exports = {
  TenantDb,
  TenantScopeError,
  TABELAS_TENANT,
  TABELAS_CONTROLE,
  verificarEscopo,
};
