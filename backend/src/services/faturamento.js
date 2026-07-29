/**
 * Camada financeira do SaaS: geracao de faturas, marcacao de atraso e
 * escalonamento automatico de bloqueio.
 *
 * Roda inteiramente no plano de controle (banco principal), nunca no
 * banco de um condominio.
 */
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const registry = require('../tenancy/registry');
const logger = require('../config/logger');

const DIAS_ATE_SUSPENDER = parseInt(process.env.SUSPENSAO_APOS_DIAS || '30', 10);

function competenciaAtual(data = new Date()) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
}

function dataVencimento(competencia, diaVencimento) {
  const [ano, mes] = competencia.split('-').map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const dia = Math.min(Math.max(diaVencimento || 10, 1), ultimoDia);
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function valorCobranca(condominio) {
  const valor = condominio.valor_mensal ?? condominio.plano_preco ?? 0;
  return Number(valor);
}

/**
 * Gera as faturas da competencia para todos os condominios cobraveis.
 * Idempotente: a chave unica (condominio_id, competencia) evita duplicata.
 */
async function gerarFaturas(competencia = competenciaAtual()) {
  const [condominios] = await pool.query(
    `SELECT c.id, c.nome, c.slug, c.dia_vencimento, c.valor_mensal, c.status, p.preco_mensal AS plano_preco
     FROM condominios c
     LEFT JOIN planos p ON p.id = c.plano_id
     WHERE c.ativo = 1 AND c.status IN ('ativo','inadimplente')`
  );

  let geradas = 0;
  for (const condominio of condominios) {
    const valor = valorCobranca(condominio);
    if (valor <= 0) continue;
    const [r] = await pool.query(
      `INSERT IGNORE INTO condominio_faturas (id,condominio_id,competencia,descricao,valor,vencimento,status)
       VALUES (?,?,?,?,?,?, 'aberta')`,
      [uuidv4(), condominio.id, competencia, `Mensalidade ${competencia}`, valor,
       dataVencimento(competencia, condominio.dia_vencimento)]
    );
    geradas += r.affectedRows ? 1 : 0;
  }

  logger.info('Faturas geradas', { competencia, geradas, avaliados: condominios.length });
  return { competencia, geradas, avaliados: condominios.length };
}

/**
 * Atualiza atrasos e aplica a escada de bloqueio:
 *   vencida + tolerancia -> inadimplente (somente leitura)
 *   vencida + SUSPENSAO_APOS_DIAS -> suspenso (sem acesso)
 *   tudo pago -> volta para ativo
 *   trial expirado -> inadimplente
 */
async function atualizarInadimplencia() {
  const resultado = { vencidas: 0, inadimplentes: 0, suspensos: 0, reativados: 0, trialsEncerrados: 0 };

  const [vencidas] = await pool.query(
    "UPDATE condominio_faturas SET status='vencida' WHERE status='aberta' AND vencimento < CURDATE()"
  );
  resultado.vencidas = vencidas.affectedRows;

  const [inadimplentes] = await pool.query(
    `UPDATE condominios c
     SET c.status = 'inadimplente'
     WHERE c.status = 'ativo' AND c.bloqueio_automatico = 1
       AND EXISTS (
         SELECT 1 FROM condominio_faturas f
         WHERE f.condominio_id = c.id AND f.status = 'vencida'
           AND f.vencimento < DATE_SUB(CURDATE(), INTERVAL c.dias_tolerancia DAY)
       )`
  );
  resultado.inadimplentes = inadimplentes.affectedRows;

  const [suspensos] = await pool.query(
    `UPDATE condominios c
     SET c.status = 'suspenso'
     WHERE c.status = 'inadimplente' AND c.bloqueio_automatico = 1
       AND EXISTS (
         SELECT 1 FROM condominio_faturas f
         WHERE f.condominio_id = c.id AND f.status = 'vencida'
           AND f.vencimento < DATE_SUB(CURDATE(), INTERVAL ? DAY)
       )`,
    [DIAS_ATE_SUSPENDER]
  );
  resultado.suspensos = suspensos.affectedRows;

  const [reativados] = await pool.query(
    `UPDATE condominios c
     SET c.status = 'ativo'
     WHERE c.status IN ('inadimplente','suspenso')
       AND NOT EXISTS (
         SELECT 1 FROM condominio_faturas f
         WHERE f.condominio_id = c.id AND f.status IN ('aberta','vencida') AND f.vencimento < CURDATE()
       )`
  );
  resultado.reativados = reativados.affectedRows;

  const [trials] = await pool.query(
    `UPDATE condominios SET status='inadimplente'
     WHERE status='trial' AND trial_expira_em IS NOT NULL AND trial_expira_em < CURDATE()`
  );
  resultado.trialsEncerrados = trials.affectedRows;

  const mudou = Object.values(resultado).some((n) => n > 0);
  if (mudou) {
    registry.invalidar(); // status mudou: derruba o cache de tenants
    logger.info('Rotina de inadimplencia aplicada', resultado);
  }
  return resultado;
}

/** Baixa manual de uma fatura. Regulariza o condominio quando quita tudo. */
async function registrarPagamento(faturaId, { valor_pago, metodo, pago_em, observacao }) {
  const [[fatura]] = await pool.query('SELECT * FROM condominio_faturas WHERE id=?', [faturaId]);
  if (!fatura) throw Object.assign(new Error('Fatura nao encontrada.'), { status: 404 });

  await pool.query(
    `UPDATE condominio_faturas
     SET status='paga', pago_em=?, valor_pago=?, metodo=?, observacao=COALESCE(?,observacao)
     WHERE id=?`,
    [pago_em || new Date().toISOString().slice(0, 10), valor_pago ?? fatura.valor, metodo || null, observacao || null, faturaId]
  );

  const [[pendentes]] = await pool.query(
    `SELECT COUNT(*) AS n FROM condominio_faturas
     WHERE condominio_id=? AND status IN ('aberta','vencida') AND vencimento < CURDATE()`,
    [fatura.condominio_id]
  );
  if (!pendentes.n) {
    await pool.query(
      "UPDATE condominios SET status='ativo' WHERE id=? AND status IN ('inadimplente','suspenso')",
      [fatura.condominio_id]
    );
  }
  registry.invalidar(fatura.condominio_id);
  return { regularizado: !pendentes.n };
}

/** Indicadores comerciais para o painel do provedor. */
async function resumoFinanceiro() {
  const [[receita]] = await pool.query(
    `SELECT COALESCE(SUM(COALESCE(c.valor_mensal, p.preco_mensal, 0)),0) AS mrr
     FROM condominios c LEFT JOIN planos p ON p.id = c.plano_id
     WHERE c.ativo = 1 AND c.status IN ('ativo','inadimplente')`
  );
  const [porStatus] = await pool.query(
    'SELECT status, COUNT(*) AS total FROM condominios WHERE ativo=1 GROUP BY status'
  );
  const [[aberto]] = await pool.query(
    "SELECT COALESCE(SUM(valor),0) AS total, COUNT(*) AS qtd FROM condominio_faturas WHERE status IN ('aberta','vencida')"
  );
  const [[atraso]] = await pool.query(
    "SELECT COALESCE(SUM(valor),0) AS total, COUNT(*) AS qtd FROM condominio_faturas WHERE status='vencida'"
  );
  const [[recebido]] = await pool.query(
    `SELECT COALESCE(SUM(COALESCE(valor_pago,valor)),0) AS total FROM condominio_faturas
     WHERE status='paga' AND pago_em >= DATE_FORMAT(CURDATE(),'%Y-%m-01')`
  );

  return {
    mrr: Number(receita.mrr),
    por_status: porStatus,
    em_aberto: { total: Number(aberto.total), quantidade: aberto.qtd },
    em_atraso: { total: Number(atraso.total), quantidade: atraso.qtd },
    recebido_no_mes: Number(recebido.total),
  };
}

module.exports = {
  gerarFaturas,
  atualizarInadimplencia,
  registrarPagamento,
  resumoFinanceiro,
  competenciaAtual,
  dataVencimento,
};
