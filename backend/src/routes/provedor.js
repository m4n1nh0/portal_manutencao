/**
 * Portal do provedor — o painel comercial de quem vende o sistema.
 *
 * Cadastra condominios, provisiona o conteudo inicial, controla planos,
 * faturas e bloqueios, e permite entrar no portal de um cliente para dar
 * suporte (com registro em auditoria).
 *
 * Vive no plano de controle: usa o pool principal diretamente, nunca req.db.
 */
const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const logger = require('../config/logger');
const { autenticar, exigirSuperadmin, audit } = require('../middleware/auth');
const { ehSlugValido, normalizarSlug, SLUGS_RESERVADOS, APP_DOMAIN } = require('../middleware/tenant');
const registry = require('../tenancy/registry');
const { avaliarContrato } = require('../tenancy/acesso');
const provisionamento = require('../services/provisionamento');
const faturamento = require('../services/faturamento');

const val = (req,res,next) => { const e=validationResult(req); if(!e.isEmpty()) return res.status(400).json({erros:e.array()}); next(); };
const TRIAL_DIAS = parseInt(process.env.TRIAL_DIAS || '14', 10);
const IMPERSONACAO_MIN = parseInt(process.env.IMPERSONACAO_MINUTOS || '60', 10);

const STATUS_VALIDOS = ['trial','ativo','inadimplente','suspenso','cancelado'];

router.use(autenticar);
router.use(exigirSuperadmin);

// ── Helpers ───────────────────────────────────────────────────
const SELECT_CONDOMINIO = `
  SELECT c.*, p.codigo AS plano_codigo, p.nome AS plano_nome, p.preco_mensal AS plano_preco,
         p.max_unidades, p.max_usuarios, p.max_moradores
  FROM condominios c LEFT JOIN planos p ON p.id = c.plano_id`;

async function carregarCondominio(id) {
  const [[row]] = await pool.query(`${SELECT_CONDOMINIO} WHERE c.id = ?`, [id]);
  return row || null;
}

function comContrato(condominio) {
  return { ...condominio, contrato: avaliarContrato(condominio), url: urlDoCondominio(condominio.slug) };
}

function urlDoCondominio(slug) {
  const protocolo = process.env.APP_PROTOCOL || (APP_DOMAIN.includes('localhost') ? 'http' : 'https');
  const porta = process.env.APP_PORT_PUBLICA ? `:${process.env.APP_PORT_PUBLICA}` : '';
  return `${protocolo}://${slug}.${APP_DOMAIN}${porta}`;
}

/** Uso por condominio (contagens vindas das tabelas operacionais). */
async function usoPorCondominio(ids = null) {
  if (ids && !ids.length) return {};
  const filtro = ids ? 'AND condominio_id IN (?)' : '';
  const args = ids ? [ids] : [];

  const [usuarios] = await pool.query(
    `SELECT condominio_id,
            SUM(perfil <> 'morador') AS internos,
            SUM(perfil = 'morador') AS moradores,
            SUM(status = 'pendente') AS pendentes
     FROM usuarios WHERE condominio_id IS NOT NULL ${filtro} GROUP BY condominio_id`, args);
  const [tarefas] = await pool.query(
    `SELECT condominio_id, COUNT(*) AS total,
            SUM(status = 'Concluído') AS concluidas,
            MAX(atualizado_em) AS ultima_atividade
     FROM tarefas WHERE condominio_id IS NOT NULL ${filtro} GROUP BY condominio_id`, args);

  const mapa = {};
  const garantir = (id) => (mapa[id] ||= { internos:0, moradores:0, pendentes:0, tarefas:0, concluidas:0, ultima_atividade:null });
  usuarios.forEach((r) => Object.assign(garantir(r.condominio_id), {
    internos: Number(r.internos), moradores: Number(r.moradores), pendentes: Number(r.pendentes),
  }));
  tarefas.forEach((r) => Object.assign(garantir(r.condominio_id), {
    tarefas: Number(r.total), concluidas: Number(r.concluidas), ultima_atividade: r.ultima_atividade,
  }));
  return mapa;
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD COMERCIAL
// ══════════════════════════════════════════════════════════════
router.get('/dashboard', async (req, res) => {
  const financeiro = await faturamento.resumoFinanceiro();
  const [[totais]] = await pool.query(
    `SELECT COUNT(*) AS condominios,
            SUM(status = 'trial') AS em_trial,
            SUM(status = 'ativo') AS ativos,
            SUM(status = 'inadimplente') AS inadimplentes,
            SUM(status = 'suspenso') AS suspensos
     FROM condominios WHERE ativo = 1`
  );
  const [recentes] = await pool.query(
    `${SELECT_CONDOMINIO} WHERE c.ativo = 1 ORDER BY c.criado_em DESC LIMIT 5`
  );
  const [vencendo] = await pool.query(
    `SELECT f.*, c.nome AS condominio_nome, c.slug
     FROM condominio_faturas f JOIN condominios c ON c.id = f.condominio_id
     WHERE f.status IN ('aberta','vencida')
     ORDER BY f.vencimento ASC LIMIT 10`
  );
  const uso = await usoPorCondominio();
  const totalUnidades = Object.values(uso).reduce((soma, u) => soma + u.moradores, 0);

  res.json({
    totais: {
      condominios: Number(totais.condominios || 0),
      em_trial: Number(totais.em_trial || 0),
      ativos: Number(totais.ativos || 0),
      inadimplentes: Number(totais.inadimplentes || 0),
      suspensos: Number(totais.suspensos || 0),
      moradores: totalUnidades,
    },
    financeiro,
    recentes: recentes.map(comContrato),
    faturas_pendentes: vencendo,
  });
});

// ══════════════════════════════════════════════════════════════
// CONDOMINIOS
// ══════════════════════════════════════════════════════════════
router.get('/slug-disponivel', async (req, res) => {
  const slug = normalizarSlug(req.query.slug);
  if (!ehSlugValido(slug)) {
    return res.json({
      disponivel: false,
      motivo: SLUGS_RESERVADOS.has(slug)
        ? 'Endereço reservado pelo sistema.'
        : 'Use de 3 a 40 caracteres: letras minúsculas, números e hífen.',
    });
  }
  const [[existe]] = await pool.query('SELECT id FROM condominios WHERE slug = ?', [slug]);
  res.json({ disponivel: !existe, motivo: existe ? 'Já existe um condomínio com este endereço.' : null, url: urlDoCondominio(slug) });
});

router.get('/condominios', async (req, res) => {
  const { status, busca } = req.query;
  let sql = `${SELECT_CONDOMINIO} WHERE 1=1`;
  const p = [];
  if (status && STATUS_VALIDOS.includes(status)) { sql += ' AND c.status = ?'; p.push(status); }
  if (req.query.arquivados !== 'true') sql += ' AND c.ativo = 1';
  if (busca) {
    sql += ' AND (c.nome LIKE ? OR c.slug LIKE ? OR c.cnpj LIKE ? OR c.cidade LIKE ?)';
    p.push(`%${busca}%`,`%${busca}%`,`%${busca}%`,`%${busca}%`);
  }
  sql += " ORDER BY FIELD(c.status,'inadimplente','suspenso','trial','ativo','cancelado'), c.nome";

  const [rows] = await pool.query(sql, p);
  const uso = await usoPorCondominio(rows.map((r) => r.id));
  res.json({
    condominios: rows.map((c) => ({ ...comContrato(c), uso: uso[c.id] || { internos:0, moradores:0, pendentes:0, tarefas:0, concluidas:0, ultima_atividade:null } })),
  });
});

router.get('/condominios/:id', async (req, res) => {
  const condominio = await carregarCondominio(req.params.id);
  if (!condominio) return res.status(404).json({ erro: 'Condomínio não encontrado.' });

  const uso = await usoPorCondominio([condominio.id]);
  const [faturas] = await pool.query(
    'SELECT * FROM condominio_faturas WHERE condominio_id = ? ORDER BY competencia DESC LIMIT 24', [condominio.id]);
  const [administradores] = await pool.query(
    `SELECT id,login,nome,email,perfil,status,ultimo_login FROM usuarios
     WHERE condominio_id = ? AND perfil <> 'morador' ORDER BY FIELD(perfil,'admin','sindico','supervisor','subsindico','conselho','campo'), nome`,
    [condominio.id]);

  res.json({
    condominio: comContrato(condominio),
    uso: uso[condominio.id] || { internos:0, moradores:0, pendentes:0, tarefas:0, concluidas:0, ultima_atividade:null },
    faturas,
    administradores,
  });
});

router.post('/condominios',
  body('nome').trim().notEmpty().isLength({ max: 120 }),
  body('slug').trim().notEmpty(),
  body('email_contato').optional({ nullable:true, checkFalsy:true }).isEmail(),
  body('dia_vencimento').optional({ nullable:true }).isInt({ min: 1, max: 28 }),
  val,
  async (req, res) => {
    const slug = normalizarSlug(req.body.slug);
    if (!ehSlugValido(slug)) return res.status(400).json({ erro: 'Endereço (slug) inválido ou reservado.' });

    const [[duplicado]] = await pool.query('SELECT id FROM condominios WHERE slug = ?', [slug]);
    if (duplicado) return res.status(409).json({ erro: 'Já existe um condomínio com este endereço.' });

    let planoId = req.body.plano_id || null;
    if (!planoId && req.body.plano_codigo) {
      const [[plano]] = await pool.query('SELECT id FROM planos WHERE codigo = ?', [req.body.plano_codigo]);
      planoId = plano?.id || null;
    }

    const status = STATUS_VALIDOS.includes(req.body.status) ? req.body.status : 'trial';
    const trialExpira = status === 'trial'
      ? (req.body.trial_expira_em || new Date(Date.now() + TRIAL_DIAS * 86400000).toISOString().slice(0, 10))
      : null;

    const id = uuidv4();
    const campos = {
      id,
      slug,
      nome: req.body.nome.trim(),
      razao_social: req.body.razao_social?.trim() || null,
      cnpj: req.body.cnpj?.trim() || null,
      email_contato: req.body.email_contato?.trim() || null,
      telefone: req.body.telefone?.trim() || null,
      responsavel: req.body.responsavel?.trim() || null,
      cep: req.body.cep?.trim() || null,
      logradouro: req.body.logradouro?.trim() || null,
      numero: req.body.numero?.trim() || null,
      complemento: req.body.complemento?.trim() || null,
      bairro: req.body.bairro?.trim() || null,
      cidade: req.body.cidade?.trim() || null,
      uf: req.body.uf?.trim().toUpperCase().slice(0, 2) || null,
      total_unidades: req.body.total_unidades ? parseInt(req.body.total_unidades, 10) : null,
      logo_url: req.body.logo_url?.trim() || null,
      cor_primaria: req.body.cor_primaria?.trim() || null,
      plano_id: planoId,
      valor_mensal: req.body.valor_mensal != null && req.body.valor_mensal !== '' ? Number(req.body.valor_mensal) : null,
      status,
      trial_expira_em: trialExpira,
      contrato_inicio: req.body.contrato_inicio || new Date().toISOString().slice(0, 10),
      contrato_fim: req.body.contrato_fim || null,
      dia_vencimento: req.body.dia_vencimento ? parseInt(req.body.dia_vencimento, 10) : 10,
      dias_tolerancia: req.body.dias_tolerancia != null ? parseInt(req.body.dias_tolerancia, 10) : 5,
      bloqueio_automatico: req.body.bloqueio_automatico === false ? 0 : 1,
      observacoes: req.body.observacoes?.trim() || null,
    };

    try {
      const colunas = Object.keys(campos);
      await pool.query(
        `INSERT INTO condominios (${colunas.join(',')}) VALUES (${colunas.map(() => '?').join(',')})`,
        Object.values(campos)
      );
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Endereço ou CNPJ já cadastrado.' });
      throw e;
    }

    const condominio = await carregarCondominio(id);
    await audit(req, 'condominio_criado', 'condominio', id, { slug, nome: campos.nome, status });

    const resultado = { condominio: comContrato(condominio) };

    // Onboarding em uma tacada só: catálogo inicial + primeiro administrador.
    if (req.body.provisionar && req.body.provisionar !== 'nao') {
      resultado.provisionamento = await provisionamento.provisionar(condominio, {
        modelo: req.body.provisionar === true ? 'padrao' : req.body.provisionar,
        gerarTarefas: req.body.gerar_tarefas === true,
      });
      await audit(req, 'condominio_provisionado', 'condominio', id, resultado.provisionamento);
    }

    if (req.body.administrador?.email) {
      try {
        resultado.administrador = await provisionamento.criarAdministrador(condominio, {
          login: req.body.administrador.login || `sindico_${slug}`.slice(0, 50),
          nome: req.body.administrador.nome || req.body.responsavel || 'Síndico',
          email: req.body.administrador.email,
          senha: req.body.administrador.senha,
          perfil: req.body.administrador.perfil || 'sindico',
          telefone: req.body.administrador.telefone || null,
        });
        await audit(req, 'admin_inicial_criado', 'condominio', id, { login: resultado.administrador.login });
      } catch (e) {
        resultado.administrador_erro = e.message;
      }
    }

    registry.invalidar(condominio);
    res.status(201).json(resultado);
  }
);

router.put('/condominios/:id',
  body('nome').trim().notEmpty().isLength({ max: 120 }),
  body('email_contato').optional({ nullable:true, checkFalsy:true }).isEmail(),
  body('dia_vencimento').optional({ nullable:true }).isInt({ min: 1, max: 28 }),
  val,
  async (req, res) => {
    const atual = await carregarCondominio(req.params.id);
    if (!atual) return res.status(404).json({ erro: 'Condomínio não encontrado.' });

    let slug = atual.slug;
    if (req.body.slug && normalizarSlug(req.body.slug) !== atual.slug) {
      slug = normalizarSlug(req.body.slug);
      if (!ehSlugValido(slug)) return res.status(400).json({ erro: 'Endereço (slug) inválido ou reservado.' });
      const [[dup]] = await pool.query('SELECT id FROM condominios WHERE slug = ? AND id <> ?', [slug, atual.id]);
      if (dup) return res.status(409).json({ erro: 'Já existe um condomínio com este endereço.' });
    }

    let planoId = atual.plano_id;
    if (req.body.plano_id !== undefined) planoId = req.body.plano_id || null;
    else if (req.body.plano_codigo) {
      const [[plano]] = await pool.query('SELECT id FROM planos WHERE codigo = ?', [req.body.plano_codigo]);
      planoId = plano?.id || null;
    }

    const num = (valor, padrao) => (valor === undefined || valor === null || valor === '' ? padrao : Number(valor));
    const txt = (valor, padrao) => (valor === undefined ? padrao : (String(valor).trim() || null));

    await pool.query(
      `UPDATE condominios SET
         slug=?, nome=?, razao_social=?, cnpj=?, email_contato=?, telefone=?, responsavel=?,
         cep=?, logradouro=?, numero=?, complemento=?, bairro=?, cidade=?, uf=?, total_unidades=?,
         logo_url=?, cor_primaria=?, plano_id=?, valor_mensal=?, trial_expira_em=?,
         contrato_inicio=?, contrato_fim=?, dia_vencimento=?, dias_tolerancia=?, bloqueio_automatico=?, observacoes=?
       WHERE id=?`,
      [
        slug, req.body.nome.trim(), txt(req.body.razao_social, atual.razao_social), txt(req.body.cnpj, atual.cnpj),
        txt(req.body.email_contato, atual.email_contato), txt(req.body.telefone, atual.telefone),
        txt(req.body.responsavel, atual.responsavel), txt(req.body.cep, atual.cep), txt(req.body.logradouro, atual.logradouro),
        txt(req.body.numero, atual.numero), txt(req.body.complemento, atual.complemento), txt(req.body.bairro, atual.bairro),
        txt(req.body.cidade, atual.cidade), req.body.uf === undefined ? atual.uf : (req.body.uf?.toUpperCase().slice(0,2) || null),
        num(req.body.total_unidades, atual.total_unidades),
        txt(req.body.logo_url, atual.logo_url), txt(req.body.cor_primaria, atual.cor_primaria),
        planoId, num(req.body.valor_mensal, atual.valor_mensal),
        req.body.trial_expira_em === undefined ? atual.trial_expira_em : (req.body.trial_expira_em || null),
        req.body.contrato_inicio === undefined ? atual.contrato_inicio : (req.body.contrato_inicio || null),
        req.body.contrato_fim === undefined ? atual.contrato_fim : (req.body.contrato_fim || null),
        num(req.body.dia_vencimento, atual.dia_vencimento), num(req.body.dias_tolerancia, atual.dias_tolerancia),
        req.body.bloqueio_automatico === undefined ? atual.bloqueio_automatico : (req.body.bloqueio_automatico ? 1 : 0),
        txt(req.body.observacoes, atual.observacoes),
        atual.id,
      ]
    );

    registry.invalidar(atual);
    const atualizado = await carregarCondominio(atual.id);
    await audit(req, 'condominio_atualizado', 'condominio', atual.id, { slug, nome: req.body.nome });
    res.json({ condominio: comContrato(atualizado) });
  }
);

router.patch('/condominios/:id/status',
  body('status').isIn(STATUS_VALIDOS),
  val,
  async (req, res) => {
    const condominio = await carregarCondominio(req.params.id);
    if (!condominio) return res.status(404).json({ erro: 'Condomínio não encontrado.' });

    await pool.query('UPDATE condominios SET status=? WHERE id=?', [req.body.status, condominio.id]);
    // Suspender ou cancelar derruba as sessões ativas do cliente na hora.
    if (['suspenso','cancelado'].includes(req.body.status)) {
      await pool.query('UPDATE sessoes SET revogado=1 WHERE condominio_id=?', [condominio.id]);
    }
    registry.invalidar(condominio);
    await audit(req, 'condominio_status', 'condominio', condominio.id, { de: condominio.status, para: req.body.status, motivo: req.body.motivo || null });

    const atualizado = await carregarCondominio(condominio.id);
    res.json({ condominio: comContrato(atualizado), mensagem: `Condomínio marcado como ${req.body.status}.` });
  }
);

router.delete('/condominios/:id', async (req, res) => {
  const condominio = await carregarCondominio(req.params.id);
  if (!condominio) return res.status(404).json({ erro: 'Condomínio não encontrado.' });

  // Exclusão definitiva apaga TODOS os dados do cliente (FKs em cascata).
  // Só acontece com confirmação explícita do slug; o padrão é arquivar.
  if (req.query.definitivo === 'true') {
    if (req.query.confirmacao !== condominio.slug) {
      return res.status(400).json({ erro: 'Para excluir definitivamente, confirme digitando o endereço do condomínio.' });
    }
    await pool.query('DELETE FROM condominios WHERE id=?', [condominio.id]);
    registry.invalidar(condominio);
    await audit(req, 'condominio_excluido', 'condominio', condominio.id, { slug: condominio.slug, nome: condominio.nome });
    logger.warn('Condominio excluido definitivamente', { slug: condominio.slug });
    return res.json({ mensagem: `Condomínio ${condominio.nome} e todos os seus dados foram excluídos.` });
  }

  await pool.query("UPDATE condominios SET ativo=0, status='cancelado' WHERE id=?", [condominio.id]);
  await pool.query('UPDATE sessoes SET revogado=1 WHERE condominio_id=?', [condominio.id]);
  registry.invalidar(condominio);
  await audit(req, 'condominio_arquivado', 'condominio', condominio.id, { slug: condominio.slug });
  res.json({ mensagem: `Condomínio ${condominio.nome} arquivado. Os dados foram preservados.` });
});

// ── Provisionamento ───────────────────────────────────────────
router.post('/condominios/:id/provisionar', async (req, res) => {
  const condominio = await carregarCondominio(req.params.id);
  if (!condominio) return res.status(404).json({ erro: 'Condomínio não encontrado.' });

  const resumo = await provisionamento.provisionar(condominio, {
    modelo: req.body.modelo || 'padrao',
    gerarTarefas: req.body.gerar_tarefas === true,
  });
  await audit(req, 'condominio_provisionado', 'condominio', condominio.id, resumo);
  res.json({ mensagem: 'Conteúdo inicial criado.', resumo });
});

router.post('/condominios/:id/administrador',
  body('nome').trim().notEmpty(),
  body('email').isEmail(),
  body('login').trim().isLength({ min: 3 }),
  body('senha').isLength({ min: 8 }).matches(/[A-Z]/).matches(/[0-9]/).matches(/[^A-Za-z0-9]/),
  val,
  async (req, res) => {
    const condominio = await carregarCondominio(req.params.id);
    if (!condominio) return res.status(404).json({ erro: 'Condomínio não encontrado.' });

    const usuario = await provisionamento.criarAdministrador(condominio, {
      login: req.body.login.trim(),
      nome: req.body.nome.trim(),
      email: req.body.email.trim().toLowerCase(),
      senha: req.body.senha,
      perfil: req.body.perfil || 'sindico',
      telefone: req.body.telefone || null,
    });
    await audit(req, 'admin_inicial_criado', 'condominio', condominio.id, { login: usuario.login, perfil: usuario.perfil });
    res.status(201).json({ usuario, url: urlDoCondominio(condominio.slug) });
  }
);

// ── Suporte: entrar no portal do cliente ──────────────────────
router.post('/condominios/:id/impersonar', async (req, res) => {
  const condominio = await carregarCondominio(req.params.id);
  if (!condominio) return res.status(404).json({ erro: 'Condomínio não encontrado.' });

  // Token curto e sem refresh: acesso de suporte expira sozinho.
  const token = jwt.sign(
    {
      id: req.usuario.id,
      login: req.usuario.login,
      nome: req.usuario.nome,
      perfil: 'superadmin',
      status: 'aprovado',
      condominio_id: condominio.id,
      condominio_slug: condominio.slug,
      impersonando: true,
      impersonado_por: req.usuario.id,
    },
    process.env.JWT_SECRET,
    { expiresIn: `${IMPERSONACAO_MIN}m` }
  );

  await audit(req, 'impersonacao_iniciada', 'condominio', condominio.id, { slug: condominio.slug, minutos: IMPERSONACAO_MIN });
  logger.warn('Acesso de suporte a condominio', { slug: condominio.slug, por: req.usuario.login });

  res.json({
    token,
    expira_em_minutos: IMPERSONACAO_MIN,
    url: urlDoCondominio(condominio.slug),
    condominio: { id: condominio.id, slug: condominio.slug, nome: condominio.nome },
  });
});

// ══════════════════════════════════════════════════════════════
// PLANOS
// ══════════════════════════════════════════════════════════════
router.get('/planos', async (req, res) => {
  const [planos] = await pool.query(
    `SELECT p.*, (SELECT COUNT(*) FROM condominios c WHERE c.plano_id = p.id AND c.ativo = 1) AS condominios
     FROM planos p ORDER BY p.ordem, p.preco_mensal`
  );
  res.json({ planos });
});

router.post('/planos',
  body('codigo').trim().isLength({ min: 2, max: 30 }),
  body('nome').trim().notEmpty().isLength({ max: 80 }),
  body('preco_mensal').isFloat({ min: 0 }),
  val,
  async (req, res) => {
    const id = uuidv4();
    const inteiroOuNulo = (v) => (v === '' || v === null || v === undefined ? null : parseInt(v, 10));
    try {
      await pool.query(
        `INSERT INTO planos (id,codigo,nome,descricao,preco_mensal,max_unidades,max_usuarios,max_moradores,recursos,ordem,ativo)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [id, req.body.codigo.trim().toLowerCase(), req.body.nome.trim(), req.body.descricao?.trim() || null,
         Number(req.body.preco_mensal), inteiroOuNulo(req.body.max_unidades), inteiroOuNulo(req.body.max_usuarios),
         inteiroOuNulo(req.body.max_moradores), req.body.recursos ? JSON.stringify(req.body.recursos) : null,
         parseInt(req.body.ordem || 0, 10), req.body.ativo === false ? 0 : 1]
      );
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Já existe um plano com este código.' });
      throw e;
    }
    const [[plano]] = await pool.query('SELECT * FROM planos WHERE id=?', [id]);
    await audit(req, 'plano_criado', 'plano', id, { codigo: plano.codigo });
    res.status(201).json({ plano });
  }
);

router.put('/planos/:id',
  body('nome').trim().notEmpty().isLength({ max: 80 }),
  body('preco_mensal').isFloat({ min: 0 }),
  val,
  async (req, res) => {
    const inteiroOuNulo = (v) => (v === '' || v === null || v === undefined ? null : parseInt(v, 10));
    const [r] = await pool.query(
      `UPDATE planos SET nome=?,descricao=?,preco_mensal=?,max_unidades=?,max_usuarios=?,max_moradores=?,recursos=?,ordem=?,ativo=?
       WHERE id=?`,
      [req.body.nome.trim(), req.body.descricao?.trim() || null, Number(req.body.preco_mensal),
       inteiroOuNulo(req.body.max_unidades), inteiroOuNulo(req.body.max_usuarios), inteiroOuNulo(req.body.max_moradores),
       req.body.recursos ? JSON.stringify(req.body.recursos) : null, parseInt(req.body.ordem || 0, 10),
       req.body.ativo === false ? 0 : 1, req.params.id]
    );
    if (!r.affectedRows) return res.status(404).json({ erro: 'Plano não encontrado.' });
    registry.invalidar(); // limites mudaram: refaz o cache de tenants
    const [[plano]] = await pool.query('SELECT * FROM planos WHERE id=?', [req.params.id]);
    await audit(req, 'plano_atualizado', 'plano', req.params.id, { nome: plano.nome });
    res.json({ plano });
  }
);

router.delete('/planos/:id', async (req, res) => {
  const [[emUso]] = await pool.query('SELECT COUNT(*) AS n FROM condominios WHERE plano_id=?', [req.params.id]);
  if (emUso.n) return res.status(409).json({ erro: `Plano em uso por ${emUso.n} condomínio(s). Desative-o em vez de excluir.` });
  const [r] = await pool.query('DELETE FROM planos WHERE id=?', [req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ erro: 'Plano não encontrado.' });
  await audit(req, 'plano_excluido', 'plano', req.params.id, null);
  res.json({ mensagem: 'Plano removido.' });
});

// ══════════════════════════════════════════════════════════════
// FATURAS
// ══════════════════════════════════════════════════════════════
router.get('/faturas', async (req, res) => {
  const { status, condominio_id, competencia } = req.query;
  let sql = `SELECT f.*, c.nome AS condominio_nome, c.slug
             FROM condominio_faturas f JOIN condominios c ON c.id = f.condominio_id WHERE 1=1`;
  const p = [];
  if (status) { sql += ' AND f.status = ?'; p.push(status); }
  if (condominio_id) { sql += ' AND f.condominio_id = ?'; p.push(condominio_id); }
  if (competencia) { sql += ' AND f.competencia = ?'; p.push(competencia); }
  sql += ' ORDER BY f.vencimento DESC LIMIT 200';
  const [faturas] = await pool.query(sql, p);
  res.json({ faturas });
});

router.post('/condominios/:id/faturas',
  body('competencia').matches(/^\d{4}-\d{2}$/),
  body('valor').isFloat({ min: 0 }),
  val,
  async (req, res) => {
    const condominio = await carregarCondominio(req.params.id);
    if (!condominio) return res.status(404).json({ erro: 'Condomínio não encontrado.' });

    const id = uuidv4();
    const vencimento = req.body.vencimento || faturamento.dataVencimento(req.body.competencia, condominio.dia_vencimento);
    try {
      await pool.query(
        `INSERT INTO condominio_faturas (id,condominio_id,competencia,descricao,valor,vencimento,status,observacao)
         VALUES (?,?,?,?,?,?, 'aberta', ?)`,
        [id, condominio.id, req.body.competencia, req.body.descricao || `Mensalidade ${req.body.competencia}`,
         Number(req.body.valor), vencimento, req.body.observacao || null]
      );
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Já existe fatura para esta competência.' });
      throw e;
    }
    const [[fatura]] = await pool.query('SELECT * FROM condominio_faturas WHERE id=?', [id]);
    await audit(req, 'fatura_criada', 'fatura', id, { condominio: condominio.slug, competencia: fatura.competencia });
    res.status(201).json({ fatura });
  }
);

router.patch('/faturas/:id/pagar', async (req, res) => {
  const resultado = await faturamento.registrarPagamento(req.params.id, {
    valor_pago: req.body.valor_pago,
    metodo: req.body.metodo,
    pago_em: req.body.pago_em,
    observacao: req.body.observacao,
  });
  const [[fatura]] = await pool.query('SELECT * FROM condominio_faturas WHERE id=?', [req.params.id]);
  await audit(req, 'fatura_paga', 'fatura', req.params.id, { competencia: fatura.competencia, regularizado: resultado.regularizado });
  res.json({
    fatura,
    mensagem: resultado.regularizado ? 'Pagamento registrado e acesso do condomínio liberado.' : 'Pagamento registrado.',
  });
});

router.patch('/faturas/:id/cancelar', async (req, res) => {
  const [r] = await pool.query("UPDATE condominio_faturas SET status='cancelada', observacao=COALESCE(?,observacao) WHERE id=?",
    [req.body.observacao || null, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ erro: 'Fatura não encontrada.' });
  await audit(req, 'fatura_cancelada', 'fatura', req.params.id, null);
  res.json({ mensagem: 'Fatura cancelada.' });
});

// ── Rotinas financeiras (podem ser chamadas por cron) ─────────
router.post('/faturamento/gerar', async (req, res) => {
  const resultado = await faturamento.gerarFaturas(req.body.competencia);
  await audit(req, 'faturas_geradas', 'faturamento', null, resultado);
  res.json(resultado);
});

router.post('/faturamento/atualizar', async (req, res) => {
  const resultado = await faturamento.atualizarInadimplencia();
  await audit(req, 'inadimplencia_atualizada', 'faturamento', null, resultado);
  res.json(resultado);
});

module.exports = router;
