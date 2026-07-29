const router  = require('express').Router();
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const storage = require('../config/storage');
const { autenticar, exigir, exigirPerfil, audit } = require('../middleware/auth');
const { exigirTenant, exigirContratoAtivo, bloquearEscritaInadimplente } = require('../middleware/tenant');

const val = (req,res,next) => { const e=validationResult(req); if(!e.isEmpty()) return res.status(400).json({erros:e.array()}); next(); };
const ok  = (res,data,c=200) => res.status(c).json(data);
const CICLOS_TAREFA = ['diario','semanal','mensal','anual','todas'];
const ADMIN_OPERACIONAL = ['superadmin','admin','supervisor','sindico'];

function isoDateOrNull(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function addDateFilters(req, sql, params, alias = 't') {
  const inicio = isoDateOrNull(req.query.data_inicio || req.query.inicio);
  const fim = isoDateOrNull(req.query.data_fim || req.query.fim);
  const expr = `COALESCE(${alias}.data_agendada, DATE(${alias}.criado_em))`;
  if (inicio) {
    sql += ` AND ${expr} >= ?`;
    params.push(inicio);
  }
  if (fim) {
    sql += ` AND ${expr} <= ?`;
    params.push(fim);
  }
  if (req.query.atrasadas === 'true') {
    sql += ` AND ${alias}.status <> 'Concluído' AND ${alias}.data_limite IS NOT NULL AND ${alias}.data_limite < CURDATE()`;
  }
  return sql;
}

function dashboardDateWhere(req, alias = 't') {
  const params = [];
  const where = addDateFilters(req, '', params, alias);
  return { where, params };
}

function prioridadeTarefa(value) {
  if (value === 'Media') return 'Média';
  return ['Alta','Média','Baixa'].includes(value) ? value : '';
}

function normalizaAtividades(input) {
  const rows = Array.isArray(input) ? input : [];
  return rows
    .map((item, index) => {
      const titulo = String(item?.titulo || '').trim();
      const descricao = String(item?.descricao || '').trim();
      if (!titulo && !descricao) return null;
      return {
        id: item?.id || uuidv4(),
        ordem: Number.isInteger(Number(item?.ordem)) ? Number(item.ordem) : index + 1,
        titulo: titulo || 'Atividade',
        descricao: descricao || titulo,
        equipe: String(item?.equipe || '').trim() || null,
        prioridade: String(item?.prioridade || '').trim(),
        ativo: item?.ativo === false || item?.ativo === 0 || item?.ativo === '0' ? 0 : 1,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.ordem - b.ordem)
    .map((item, index) => ({ ...item, ordem: index + 1 }));
}

async function listaCiclo(db) {
  const [dias] = await db.query(
    'SELECT id,dia_ciclo,setor,trecho FROM ciclo_8dias WHERE condominio_id=? ORDER BY dia_ciclo,setor',
    [db.id]
  );
  if (!dias.length) return [];
  const [atividades] = await db.query(
    `SELECT id,ciclo_id,ordem,titulo,descricao,equipe,prioridade,ativo
     FROM ciclo_atividades
     WHERE condominio_id=? AND ciclo_id IN (?)
     ORDER BY ciclo_id,ordem,titulo`,
    [db.id, dias.map((d) => d.id)]
  );
  const porDia = atividades.reduce((acc, atividade) => {
    (acc[atividade.ciclo_id] ||= []).push(atividade);
    return acc;
  }, {});
  return dias.map((dia) => ({ ...dia, atividades: porDia[dia.id] || [] }));
}

async function salvaAtividades(tx, condominioId, cicloId, atividades) {
  await tx.query('DELETE FROM ciclo_atividades WHERE condominio_id=? AND ciclo_id=?', [condominioId, cicloId]);
  for (const atividade of atividades) {
    await tx.query(
      `INSERT INTO ciclo_atividades
        (id,condominio_id,ciclo_id,ordem,titulo,descricao,equipe,prioridade,ativo)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        atividade.id,
        condominioId,
        cicloId,
        atividade.ordem,
        atividade.titulo,
        atividade.descricao,
        atividade.equipe,
        atividade.prioridade,
        atividade.ativo,
      ]
    );
  }
}

// Toda rota abaixo exige subdomínio de condomínio válido, sessão daquele
// condomínio, contrato que permita acesso e contrato que permita escrita.
router.use(exigirTenant);
router.use(autenticar);
router.use(exigirContratoAtivo);
router.use(bloquearEscritaInadimplente);

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
router.get('/dashboard', async (req, res) => {
  const db = req.db;
  try {
    const dateFilter = dashboardDateWhere(req, 't');
    const [totais] = await db.query(`
      SELECT ciclo,COUNT(*) total,
        SUM(status='Concluído') concluidas,
        SUM(status='Pendente') pendentes,
        SUM(prioridade='Alta' AND status!='Concluído') alta_pendente
      FROM tarefas t WHERE t.condominio_id=? ${dateFilter.where} GROUP BY ciclo`, [db.id, ...dateFilter.params]);

    const [recentes] = await db.query(`
      SELECT t.id,t.ciclo,t.setor,t.atividade,t.status,t.atualizado_em,u.nome AS por
      FROM tarefas t LEFT JOIN usuarios u ON u.id=t.atualizado_por
      WHERE t.condominio_id=? AND t.status='Concluído' ${dateFilter.where}
      ORDER BY t.atualizado_em DESC LIMIT 8`, [db.id, ...dateFilter.params]);

    const [alta] = await db.query(`
      SELECT id,ciclo,setor,atividade,equipe,status,prioridade,data_agendada,data_limite FROM tarefas t
      WHERE t.condominio_id=? AND prioridade='Alta' ${dateFilter.where}
      ORDER BY FIELD(status,'Pendente','Em Andamento','Em Revisão','Concluído') LIMIT 10`, [db.id, ...dateFilter.params]);

    // Pendentes de aprovação (só admin/síndico)
    let pendentes_aprovacao = 0;
    if (req.permissoes.canApprove) {
      const [[r]] = await db.query(
        `SELECT COUNT(*) AS n FROM usuarios WHERE condominio_id=? AND status='pendente'`, [db.id]);
      pendentes_aprovacao = r.n;
    }

    ok(res, { totais, recentes, alta, pendentes_aprovacao, contrato: req.contrato });
  } catch(e) { console.error(e); res.status(500).json({ erro:'Erro.' }); }
});

// ══════════════════════════════════════════════════════════════
// TAREFAS — CRUD
// ══════════════════════════════════════════════════════════════
router.get('/tarefas', async (req, res) => {
  const db = req.db;
  let sql = `SELECT t.*,u.nome AS atualizado_por_nome FROM tarefas t
             LEFT JOIN usuarios u ON u.id=t.atualizado_por WHERE t.condominio_id=?`;
  const p = [db.id];
  const cicloFiltro = req.usuario.perfil==='morador' ? 'diario' : req.query.ciclo;
  if (cicloFiltro) {
    if (!CICLOS_TAREFA.includes(cicloFiltro)) return res.status(400).json({ erro:'Ciclo invalido.' });
    if (cicloFiltro === 'todas') {
      sql+=' AND t.ciclo=?';
      p.push('todas');
    } else {
      sql+=' AND (t.ciclo=? OR t.ciclo=?)';
      p.push(cicloFiltro,'todas');
    }
  }
  if (req.query.setor)       { sql+=' AND t.setor LIKE ?';  p.push(`%${req.query.setor}%`); }
  if (req.query.status)      { sql+=' AND t.status=?';      p.push(req.query.status); }
  if (req.query.prioridade)  { sql+=' AND t.prioridade=?';  p.push(req.query.prioridade); }
  if (req.query.busca)       { sql+=' AND t.atividade LIKE ?'; p.push(`%${req.query.busca}%`); }
  sql = addDateFilters(req, sql, p, 't');
  sql+=" ORDER BY COALESCE(t.data_agendada, DATE(t.criado_em)) ASC,FIELD(t.prioridade,'Alta','Média','Baixa',''),t.setor ASC,t.criado_em ASC";
  const [rows] = await db.query(sql, p);
  ok(res, { tarefas: rows });
});

router.post('/tarefas', exigir('canAdd'),
  body('ciclo').isIn(CICLOS_TAREFA),
  body('setor').trim().notEmpty(),
  body('atividade').trim().notEmpty(),
  body('data_agendada').optional({ nullable:true, checkFalsy:true }).isISO8601().toDate(),
  body('data_limite').optional({ nullable:true, checkFalsy:true }).isISO8601().toDate(),
  val, async (req, res) => {
    const db = req.db;
    const { ciclo,setor,area,atividade,equipe,prioridade,status,observacoes } = req.body;
    const dataAgendada = isoDateOrNull(req.body.data_agendada);
    const dataLimite = isoDateOrNull(req.body.data_limite);
    const id = uuidv4();
    await db.query(
      `INSERT INTO tarefas (id,condominio_id,ciclo,setor,area,atividade,equipe,prioridade,status,observacoes,data_agendada,data_limite,origem_agendamento,atualizado_por)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id,db.id,ciclo,setor,area||'',atividade,equipe||'',prioridade||'',status||'Pendente',observacoes||'',dataAgendada,dataLimite,'manual',req.usuario.id]
    );
    await db.query('INSERT INTO historico_tarefas (id,condominio_id,tarefa_id,usuario_id,acao) VALUES (?,?,?,?,?)',
      [uuidv4(),db.id,id,req.usuario.id,'criado']);
    await audit(req,'tarefa_criada','tarefa',id,{ciclo,setor,atividade});
    const [[t]] = await db.query('SELECT * FROM tarefas WHERE id=? AND condominio_id=?',[id,db.id]);
    ok(res,{tarefa:t},201);
  }
);

router.put('/tarefas/:id', exigir('canEdit'),
  body('ciclo').optional().isIn(CICLOS_TAREFA),
  body('setor').trim().notEmpty(),
  body('atividade').trim().notEmpty(),
  body('data_agendada').optional({ nullable:true, checkFalsy:true }).isISO8601().toDate(),
  body('data_limite').optional({ nullable:true, checkFalsy:true }).isISO8601().toDate(),
  val, async (req, res) => {
  const db = req.db;
  const { ciclo,setor,area,atividade,equipe,prioridade,status,observacoes } = req.body;
  const dataAgendada = isoDateOrNull(req.body.data_agendada);
  const dataLimite = isoDateOrNull(req.body.data_limite);
  const [[antes]] = await db.query('SELECT status,ciclo FROM tarefas WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
  if (!antes) return res.status(404).json({erro:'Não encontrada.'});
  const novoCiclo = ciclo || antes.ciclo;
  const novoStatus = status || antes.status;
  await db.query(
    `UPDATE tarefas SET ciclo=?,setor=?,area=?,atividade=?,equipe=?,prioridade=?,status=?,observacoes=?,data_agendada=?,data_limite=?,atualizado_por=?
     WHERE id=? AND condominio_id=?`,
    [novoCiclo,setor,area||'',atividade,equipe||'',prioridade||'',novoStatus,observacoes||'',dataAgendada,dataLimite,req.usuario.id,req.params.id,db.id]
  );
  if (antes.status!==novoStatus) {
    await db.query('INSERT INTO historico_tarefas (id,condominio_id,tarefa_id,usuario_id,campo,valor_antes,valor_depois,acao) VALUES (?,?,?,?,?,?,?,?)',
      [uuidv4(),db.id,req.params.id,req.usuario.id,'status',antes.status,novoStatus,'status_alterado']);
    await audit(req,'status_alterado','tarefa',req.params.id,{de:antes.status,para:novoStatus});
  }
  const [[t]] = await db.query('SELECT * FROM tarefas WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
  ok(res,{tarefa:t});
});

router.patch('/tarefas/:id/status', exigir('canEdit'),
  body('status').isIn(['Pendente','Em Andamento','Concluído','Em Revisão']),
  val, async (req, res) => {
    const db = req.db;
    const [[antes]] = await db.query('SELECT status FROM tarefas WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
    if (!antes) return res.status(404).json({erro:'Não encontrada.'});
    await db.query('UPDATE tarefas SET status=?,atualizado_por=? WHERE id=? AND condominio_id=?',
      [req.body.status,req.usuario.id,req.params.id,db.id]);
    await db.query('INSERT INTO historico_tarefas (id,condominio_id,tarefa_id,usuario_id,campo,valor_antes,valor_depois,acao) VALUES (?,?,?,?,?,?,?,?)',
      [uuidv4(),db.id,req.params.id,req.usuario.id,'status',antes.status,req.body.status,'status_alterado']);
    await audit(req,'status_alterado','tarefa',req.params.id,{de:antes.status,para:req.body.status});
    const [[t]] = await db.query('SELECT * FROM tarefas WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
    ok(res,{tarefa:t});
  }
);

router.delete('/tarefas/:id', exigir('canDelete'), async (req, res) => {
  const db = req.db;
  const [r] = await db.query('DELETE FROM tarefas WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
  if (!r.affectedRows) return res.status(404).json({erro:'Não encontrada.'});
  await audit(req,'tarefa_excluida','tarefa',req.params.id,null);
  ok(res,{mensagem:'Excluída.'});
});

router.get('/tarefas/:id/historico', async (req, res) => {
  const db = req.db;
  const [rows] = await db.query(
    `SELECT h.*,u.nome AS usuario_nome FROM historico_tarefas h
     LEFT JOIN usuarios u ON u.id=h.usuario_id
     WHERE h.condominio_id=? AND h.tarefa_id=? ORDER BY h.criado_em DESC LIMIT 50`,
    [db.id, req.params.id]);
  ok(res,{historico:rows});
});

// ══════════════════════════════════════════════════════════════
// CICLO DINAMICO
// ══════════════════════════════════════════════════════════════
router.get('/ciclo', async (req, res) => {
  ok(res,{ciclo: await listaCiclo(req.db)});
});

router.post('/ciclo', exigirPerfil(...ADMIN_OPERACIONAL),
  body('dia_ciclo').isInt({ min: 1, max: 365 }),
  body('setor').trim().notEmpty().isLength({ max: 80 }),
  body('trecho').optional({ nullable:true }).trim().isLength({ max: 160 }),
  body('atividades').optional({ nullable:true }).isArray({ max: 50 }),
  val, async (req, res) => {
    const db = req.db;
    const { dia_ciclo,setor,trecho } = req.body;
    const atividades = normalizaAtividades(req.body.atividades);
    if (!atividades.length) return res.status(400).json({erro:'Inclua pelo menos uma atividade no ciclo.'});

    try {
      const novoId = await db.transaction(async (tx) => {
        const [insert] = await tx.query(
          `INSERT INTO ciclo_8dias (condominio_id,dia_ciclo,setor,trecho)
           VALUES (?,?,?,?)`,
          [db.id,parseInt(dia_ciclo, 10),setor.trim(),trecho?.trim()||null]
        );
        await salvaAtividades(tx, db.id, insert.insertId, atividades);
        return insert.insertId;
      });

      const cicloRows = await listaCiclo(db);
      const fullItem = cicloRows.find((row) => row.id === novoId);
      await audit(req,'ciclo_criado','ciclo_8dias',novoId,{dia_ciclo,setor,atividades:atividades.length});
      ok(res,{item: fullItem},201);
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Dia do ciclo ja cadastrado.'});
      console.error(e);
      return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.put('/ciclo/:id', exigirPerfil(...ADMIN_OPERACIONAL),
  body('dia_ciclo').isInt({ min: 1, max: 365 }),
  body('setor').trim().notEmpty().isLength({ max: 80 }),
  body('trecho').optional({ nullable:true }).trim().isLength({ max: 160 }),
  body('atividades').optional({ nullable:true }).isArray({ max: 50 }),
  val, async (req, res) => {
    const db = req.db;
    const { dia_ciclo,setor,trecho } = req.body;
    const atividades = normalizaAtividades(req.body.atividades);
    if (!atividades.length) return res.status(400).json({erro:'Inclua pelo menos uma atividade no ciclo.'});

    try {
      const encontrado = await db.transaction(async (tx) => {
        const [r] = await tx.query(
          `UPDATE ciclo_8dias
           SET dia_ciclo=?,setor=?,trecho=?
           WHERE id=? AND condominio_id=?`,
          [parseInt(dia_ciclo, 10),setor.trim(),trecho?.trim()||null,req.params.id,db.id]
        );
        if (!r.affectedRows) return false;
        await salvaAtividades(tx, db.id, req.params.id, atividades);
        return true;
      });
      if (!encontrado) return res.status(404).json({erro:'Item do ciclo nao encontrado.'});

      const ciclo = await listaCiclo(db);
      const item = ciclo.find((row) => String(row.id) === String(req.params.id));
      await audit(req,'ciclo_atualizado','ciclo_8dias',req.params.id,{dia_ciclo,setor,atividades:atividades.length});
      ok(res,{item});
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Dia do ciclo ja cadastrado.'});
      console.error(e);
      return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.delete('/ciclo/:id', exigirPerfil(...ADMIN_OPERACIONAL), async (req, res) => {
  const db = req.db;
  const [[item]] = await db.query('SELECT id,dia_ciclo,setor FROM ciclo_8dias WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
  if (!item) return res.status(404).json({erro:'Item do ciclo nao encontrado.'});
  await db.query('DELETE FROM ciclo_8dias WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
  await audit(req,'ciclo_removido','ciclo_8dias',req.params.id,{dia_ciclo:item.dia_ciclo,setor:item.setor});
  ok(res,{mensagem:'Dia do ciclo removido.'});
});

// Cadastro de quadras e ruas
router.get('/quadras', async (req, res) => {
  const db = req.db;
  const [quadras] = await db.query(`
    SELECT id,codigo,nome,descricao,ativo,criado_em,atualizado_em
    FROM quadras
    WHERE condominio_id=?
    ORDER BY codigo
  `, [db.id]);
  const [ruas] = await db.query(`
    SELECT id,quadra_id,nome,ordem,ativo,criado_em,atualizado_em
    FROM ruas
    WHERE condominio_id=?
    ORDER BY ordem,nome
  `, [db.id]);
  const porQuadra = ruas.reduce((acc, rua) => {
    (acc[rua.quadra_id] ||= []).push(rua);
    return acc;
  }, {});
  ok(res, { quadras: quadras.map(q => ({ ...q, ruas: porQuadra[q.id] || [] })) });
});

router.post('/quadras', exigirPerfil(...ADMIN_OPERACIONAL),
  body('codigo').trim().notEmpty().isLength({ max: 3 }),
  body('nome').optional({ nullable:true }).trim().isLength({ max: 80 }),
  body('descricao').optional({ nullable:true }).trim().isLength({ max: 255 }),
  val, async (req, res) => {
    const db = req.db;
    const codigo = req.body.codigo.trim().toUpperCase();
    const nome = req.body.nome?.trim() || `Quadra ${codigo}`;
    const descricao = req.body.descricao?.trim() || null;
    const id = uuidv4();
    try {
      await db.query('INSERT INTO quadras (id,condominio_id,codigo,nome,descricao) VALUES (?,?,?,?,?)', [id,db.id,codigo,nome,descricao]);
      const [[quadra]] = await db.query('SELECT * FROM quadras WHERE id=? AND condominio_id=?',[id,db.id]);
      await audit(req,'quadra_criada','quadra',quadra.id,{codigo,nome});
      ok(res,{quadra},201);
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Quadra ja cadastrada.'});
      console.error(e);
      return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.put('/quadras/:id', exigirPerfil(...ADMIN_OPERACIONAL),
  body('codigo').trim().notEmpty().isLength({ max: 3 }),
  body('nome').trim().notEmpty().isLength({ max: 80 }),
  body('descricao').optional({ nullable:true }).trim().isLength({ max: 255 }),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const db = req.db;
    const codigo = req.body.codigo.trim().toUpperCase();
    const descricao = req.body.descricao?.trim() || null;
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    try {
      const [r] = await db.query(
        'UPDATE quadras SET codigo=?,nome=?,descricao=?,ativo=? WHERE id=? AND condominio_id=?',
        [codigo,req.body.nome.trim(),descricao,ativo,req.params.id,db.id]
      );
      if (!r.affectedRows) return res.status(404).json({erro:'Quadra nao encontrada.'});
      const [[quadra]] = await db.query('SELECT * FROM quadras WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
      await audit(req,'quadra_atualizada','quadra',req.params.id,{codigo,nome:req.body.nome});
      ok(res,{quadra});
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Codigo de quadra ja cadastrado.'});
      console.error(e);
      return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.delete('/quadras/:id', exigirPerfil(...ADMIN_OPERACIONAL), async (req, res) => {
  const db = req.db;
  const [r] = await db.query('DELETE FROM quadras WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
  if (!r.affectedRows) return res.status(404).json({erro:'Quadra nao encontrada.'});
  await audit(req,'quadra_excluida','quadra',req.params.id,null);
  ok(res,{mensagem:'Quadra removida.'});
});

router.post('/quadras/:id/ruas', exigirPerfil(...ADMIN_OPERACIONAL),
  body('nome').trim().notEmpty().isLength({ max: 80 }),
  body('ordem').optional({ nullable:true }).isInt({ min: 1, max: 99 }),
  val, async (req, res) => {
    const db = req.db;
    const [[quadra]] = await db.query('SELECT id FROM quadras WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
    if (!quadra) return res.status(404).json({erro:'Quadra nao encontrada.'});
    let ordem = req.body.ordem ? parseInt(req.body.ordem) : null;
    if (!ordem) {
      const [[proxima]] = await db.query(
        'SELECT COALESCE(MAX(ordem),0)+1 AS proxima FROM ruas WHERE condominio_id=? AND quadra_id=?',
        [db.id, req.params.id]
      );
      ordem = proxima.proxima;
    }
    const id = uuidv4();
    try {
      await db.query('INSERT INTO ruas (id,condominio_id,quadra_id,nome,ordem) VALUES (?,?,?,?,?)',
        [id,db.id,req.params.id,req.body.nome.trim(),ordem]);
      const [[rua]] = await db.query('SELECT * FROM ruas WHERE id=? AND condominio_id=?',[id,db.id]);
      await audit(req,'rua_criada','rua',rua.id,{quadra_id:req.params.id,nome:rua.nome});
      ok(res,{rua},201);
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Rua ou ordem ja cadastrada nessa quadra.'});
      console.error(e);
      return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.put('/ruas/:id', exigirPerfil(...ADMIN_OPERACIONAL),
  body('nome').trim().notEmpty().isLength({ max: 80 }),
  body('ordem').isInt({ min: 1, max: 99 }),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const db = req.db;
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    try {
      const [r] = await db.query('UPDATE ruas SET nome=?,ordem=?,ativo=? WHERE id=? AND condominio_id=?',
        [req.body.nome.trim(),parseInt(req.body.ordem),ativo,req.params.id,db.id]);
      if (!r.affectedRows) return res.status(404).json({erro:'Rua nao encontrada.'});
      const [[rua]] = await db.query('SELECT * FROM ruas WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
      await audit(req,'rua_atualizada','rua',req.params.id,{nome:rua.nome,ordem:rua.ordem});
      ok(res,{rua});
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Rua ou ordem ja cadastrada nessa quadra.'});
      console.error(e);
      return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.delete('/ruas/:id', exigirPerfil(...ADMIN_OPERACIONAL), async (req, res) => {
  const db = req.db;
  const [r] = await db.query('DELETE FROM ruas WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
  if (!r.affectedRows) return res.status(404).json({erro:'Rua nao encontrada.'});
  await audit(req,'rua_excluida','rua',req.params.id,null);
  ok(res,{mensagem:'Rua removida.'});
});

// Responsaveis / equipes
router.get('/equipes', async (req, res) => {
  const db = req.db;
  const [equipes] = await db.query('SELECT * FROM equipes WHERE condominio_id=? ORDER BY ativo DESC,nome ASC',[db.id]);
  ok(res,{equipes});
});

router.post('/equipes', exigirPerfil(...ADMIN_OPERACIONAL),
  body('nome').trim().notEmpty().isLength({ max: 100 }),
  body('tipo').optional({ nullable:true }).trim().isLength({ max: 40 }),
  body('contato').optional({ nullable:true }).trim().isLength({ max: 120 }),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const db = req.db;
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    const id = uuidv4();
    try {
      await db.query('INSERT INTO equipes (id,condominio_id,nome,tipo,contato,ativo) VALUES (?,?,?,?,?,?)',
        [id,db.id,req.body.nome.trim(),req.body.tipo?.trim()||null,req.body.contato?.trim()||null,ativo]);
      const [[equipe]] = await db.query('SELECT * FROM equipes WHERE id=? AND condominio_id=?',[id,db.id]);
      await audit(req,'equipe_criada','equipe',equipe.id,{nome:equipe.nome});
      ok(res,{equipe},201);
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Responsavel ja cadastrado.'});
      console.error(e); return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.put('/equipes/:id', exigirPerfil(...ADMIN_OPERACIONAL),
  body('nome').trim().notEmpty().isLength({ max: 100 }),
  body('tipo').optional({ nullable:true }).trim().isLength({ max: 40 }),
  body('contato').optional({ nullable:true }).trim().isLength({ max: 120 }),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const db = req.db;
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    try {
      const [r] = await db.query('UPDATE equipes SET nome=?,tipo=?,contato=?,ativo=? WHERE id=? AND condominio_id=?',
        [req.body.nome.trim(),req.body.tipo?.trim()||null,req.body.contato?.trim()||null,ativo,req.params.id,db.id]);
      if (!r.affectedRows) return res.status(404).json({erro:'Responsavel nao encontrado.'});
      const [[equipe]] = await db.query('SELECT * FROM equipes WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
      await audit(req,'equipe_atualizada','equipe',req.params.id,{nome:equipe.nome});
      ok(res,{equipe});
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Responsavel ja cadastrado.'});
      console.error(e); return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.delete('/equipes/:id', exigirPerfil(...ADMIN_OPERACIONAL), async (req, res) => {
  const db = req.db;
  const [r] = await db.query('DELETE FROM equipes WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
  if (!r.affectedRows) return res.status(404).json({erro:'Responsavel nao encontrado.'});
  await audit(req,'equipe_excluida','equipe',req.params.id,null);
  ok(res,{mensagem:'Responsavel removido.'});
});

// Areas / locais
router.get('/locais', async (req, res) => {
  const db = req.db;
  const [locais] = await db.query('SELECT * FROM locais WHERE condominio_id=? ORDER BY ativo DESC,categoria ASC,nome ASC',[db.id]);
  ok(res,{locais});
});

router.post('/locais', exigirPerfil(...ADMIN_OPERACIONAL),
  body('nome').trim().notEmpty().isLength({ max: 120 }),
  body('categoria').optional({ nullable:true }).trim().isLength({ max: 60 }),
  body('descricao').optional({ nullable:true }).trim().isLength({ max: 255 }),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const db = req.db;
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    const id = uuidv4();
    try {
      await db.query('INSERT INTO locais (id,condominio_id,nome,categoria,descricao,ativo) VALUES (?,?,?,?,?,?)',
        [id,db.id,req.body.nome.trim(),req.body.categoria?.trim()||null,req.body.descricao?.trim()||null,ativo]);
      const [[local]] = await db.query('SELECT * FROM locais WHERE id=? AND condominio_id=?',[id,db.id]);
      await audit(req,'local_criado','local',local.id,{nome:local.nome});
      ok(res,{local},201);
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Area/local ja cadastrado.'});
      console.error(e); return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.put('/locais/:id', exigirPerfil(...ADMIN_OPERACIONAL),
  body('nome').trim().notEmpty().isLength({ max: 120 }),
  body('categoria').optional({ nullable:true }).trim().isLength({ max: 60 }),
  body('descricao').optional({ nullable:true }).trim().isLength({ max: 255 }),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const db = req.db;
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    try {
      const [r] = await db.query('UPDATE locais SET nome=?,categoria=?,descricao=?,ativo=? WHERE id=? AND condominio_id=?',
        [req.body.nome.trim(),req.body.categoria?.trim()||null,req.body.descricao?.trim()||null,ativo,req.params.id,db.id]);
      if (!r.affectedRows) return res.status(404).json({erro:'Area/local nao encontrado.'});
      const [[local]] = await db.query('SELECT * FROM locais WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
      await audit(req,'local_atualizado','local',req.params.id,{nome:local.nome});
      ok(res,{local});
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Area/local ja cadastrado.'});
      console.error(e); return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.delete('/locais/:id', exigirPerfil(...ADMIN_OPERACIONAL), async (req, res) => {
  const db = req.db;
  const [r] = await db.query('DELETE FROM locais WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
  if (!r.affectedRows) return res.status(404).json({erro:'Area/local nao encontrado.'});
  await audit(req,'local_excluido','local',req.params.id,null);
  ok(res,{mensagem:'Area/local removido.'});
});

// Modelos de tarefas / rotinas
router.get('/modelos-tarefas', async (req, res) => {
  const db = req.db;
  const [modelos] = await db.query('SELECT * FROM tarefa_modelos WHERE condominio_id=? ORDER BY ativo DESC,ciclo,setor,atividade',[db.id]);
  ok(res,{modelos});
});

router.post('/modelos-tarefas', exigirPerfil(...ADMIN_OPERACIONAL),
  body('ciclo').isIn(CICLOS_TAREFA),
  body('setor').trim().notEmpty().isLength({ max: 60 }),
  body('area').optional({ nullable:true }).trim().isLength({ max: 120 }),
  body('atividade').trim().notEmpty(),
  body('equipe').optional({ nullable:true }).trim().isLength({ max: 100 }),
  body('prioridade').optional({ nullable:true }).isIn(['Alta','Media','Média','Baixa','']),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const db = req.db;
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    const id = uuidv4();
    try {
      const { ciclo,setor,area,atividade,equipe,prioridade } = req.body;
      await db.query(
        'INSERT INTO tarefa_modelos (id,condominio_id,ciclo,setor,area,atividade,equipe,prioridade,ativo) VALUES (?,?,?,?,?,?,?,?,?)',
        [id,db.id,ciclo,setor.trim(),area?.trim()||'',atividade.trim(),equipe?.trim()||'',prioridade||'',ativo]
      );
      const [[modelo]] = await db.query('SELECT * FROM tarefa_modelos WHERE id=? AND condominio_id=?',[id,db.id]);
      await audit(req,'modelo_tarefa_criado','tarefa_modelo',modelo.id,{ciclo,setor});
      ok(res,{modelo},201);
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Modelo de tarefa ja cadastrado.'});
      console.error(e); return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.put('/modelos-tarefas/:id', exigirPerfil(...ADMIN_OPERACIONAL),
  body('ciclo').isIn(CICLOS_TAREFA),
  body('setor').trim().notEmpty().isLength({ max: 60 }),
  body('area').optional({ nullable:true }).trim().isLength({ max: 120 }),
  body('atividade').trim().notEmpty(),
  body('equipe').optional({ nullable:true }).trim().isLength({ max: 100 }),
  body('prioridade').optional({ nullable:true }).isIn(['Alta','Media','Média','Baixa','']),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const db = req.db;
    const { ciclo,setor,area,atividade,equipe,prioridade } = req.body;
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    try {
      const [r] = await db.query(
        'UPDATE tarefa_modelos SET ciclo=?,setor=?,area=?,atividade=?,equipe=?,prioridade=?,ativo=? WHERE id=? AND condominio_id=?',
        [ciclo,setor.trim(),area?.trim()||'',atividade.trim(),equipe?.trim()||'',prioridade||'',ativo,req.params.id,db.id]
      );
      if (!r.affectedRows) return res.status(404).json({erro:'Modelo de tarefa nao encontrado.'});
      const [[modelo]] = await db.query('SELECT * FROM tarefa_modelos WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
      await audit(req,'modelo_tarefa_atualizado','tarefa_modelo',req.params.id,{ciclo,setor});
      ok(res,{modelo});
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Modelo de tarefa ja cadastrado.'});
      console.error(e); return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.delete('/modelos-tarefas/:id', exigirPerfil(...ADMIN_OPERACIONAL), async (req, res) => {
  const db = req.db;
  const [r] = await db.query('DELETE FROM tarefa_modelos WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
  if (!r.affectedRows) return res.status(404).json({erro:'Modelo de tarefa nao encontrado.'});
  await audit(req,'modelo_tarefa_excluido','tarefa_modelo',req.params.id,null);
  ok(res,{mensagem:'Modelo de tarefa removido.'});
});

router.get('/agendamentos', async (req, res) => {
  const db = req.db;
  const params = [db.id];
  let sql = `SELECT t.*,u.nome AS atualizado_por_nome
             FROM tarefas t
             LEFT JOIN usuarios u ON u.id=t.atualizado_por
             WHERE t.condominio_id=?`;
  if (req.query.ciclo) {
    if (!CICLOS_TAREFA.includes(req.query.ciclo)) return res.status(400).json({erro:'Ciclo invalido.'});
    sql += ' AND t.ciclo=?';
    params.push(req.query.ciclo);
  }
  sql = addDateFilters(req, sql, params, 't');
  sql += ' ORDER BY COALESCE(t.data_agendada, DATE(t.criado_em)) ASC,t.setor ASC,t.atividade ASC';
  const [tarefas] = await db.query(sql, params);
  const resumoPorDia = tarefas.reduce((acc, tarefa) => {
    const raw = tarefa.data_agendada || tarefa.criado_em;
    const data = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
    const row = acc[data] || { data, total: 0, concluidas: 0, pendentes: 0 };
    row.total += 1;
    if (tarefa.status === 'Concluído') row.concluidas += 1;
    else row.pendentes += 1;
    acc[data] = row;
    return acc;
  }, {});
  ok(res,{tarefas,resumo:Object.values(resumoPorDia)});
});

router.post('/agendamentos/gerar', exigirPerfil(...ADMIN_OPERACIONAL),
  body('data_agendada').isISO8601(),
  body('data_limite').optional({ nullable:true, checkFalsy:true }).isISO8601(),
  body('ciclos').optional({ nullable:true }).isArray({ min: 1 }),
  body('ciclos.*').optional().isIn(CICLOS_TAREFA),
  val, async (req, res) => {
    const db = req.db;
    const dataAgendada = isoDateOrNull(req.body.data_agendada);
    const dataLimite = isoDateOrNull(req.body.data_limite) || dataAgendada;
    const ciclos = Array.isArray(req.body.ciclos) && req.body.ciclos.length
      ? req.body.ciclos.filter((ciclo) => CICLOS_TAREFA.includes(ciclo))
      : ['diario','semanal','mensal','anual','todas'];
    if (!ciclos.length) return res.status(400).json({erro:'Selecione ao menos um ciclo.'});

    const [modelos] = await db.query(
      `SELECT * FROM tarefa_modelos
       WHERE condominio_id=? AND ativo=1 AND ciclo IN (?)
       ORDER BY ciclo,setor,atividade`,
      [db.id, ciclos]
    );
    if (!modelos.length) return res.status(404).json({erro:'Nenhum modelo ativo encontrado para os ciclos selecionados.'});

    try {
      const resultado = await db.transaction(async (tx) => {
        let criadas = 0;
        let ignoradas = 0;
        const tarefas = [];
        for (const modelo of modelos) {
          const [[existente]] = await tx.query(
            `SELECT id FROM tarefas
             WHERE condominio_id=? AND ciclo=? AND setor=? AND COALESCE(area,'')=? AND atividade=?
               AND COALESCE(data_agendada, DATE(criado_em))=?`,
            [db.id,modelo.ciclo,modelo.setor,modelo.area || '',modelo.atividade,dataAgendada]
          );
          if (existente) {
            ignoradas += 1;
            continue;
          }
          const id = uuidv4();
          await tx.query(
            `INSERT INTO tarefas
              (id,condominio_id,ciclo,setor,area,atividade,equipe,prioridade,status,observacoes,data_agendada,data_limite,origem_agendamento,atualizado_por)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              id,
              db.id,
              modelo.ciclo,
              modelo.setor,
              modelo.area || '',
              modelo.atividade,
              modelo.equipe || '',
              prioridadeTarefa(modelo.prioridade),
              'Pendente',
              'Gerada pelo modulo de agendamento.',
              dataAgendada,
              dataLimite,
              'modelo',
              req.usuario.id,
            ]
          );
          tarefas.push(id);
          criadas += 1;
        }
        return { criadas, ignoradas, tarefas };
      });

      await audit(req,'agendamento_gerado','tarefa',null,{data_agendada:dataAgendada,data_limite:dataLimite,ciclos,...resultado});
      ok(res,{mensagem:`${resultado.criadas} tarefa(s) agendada(s).`,...resultado});
    } catch(e) {
      console.error(e);
      res.status(500).json({erro:'Erro ao gerar agendamento.'});
    }
  }
);

// ══════════════════════════════════════════════════════════════
// COMPROVAÇÕES FOTOGRÁFICAS
// ══════════════════════════════════════════════════════════════
// FIX: DELETE /foto/:id ANTES de GET /:tarefaId (evita captura de "foto" como tarefaId)
router.delete('/comprovacoes/foto/:id', async (req, res) => {
  const db = req.db;
  const [[f]] = await db.query('SELECT * FROM comprovacoes WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
  if (!f) return res.status(404).json({erro:'Não encontrada.'});
  if (f.usuario_id!==req.usuario.id && !ADMIN_OPERACIONAL.includes(req.usuario.perfil))
    return res.status(403).json({erro:'Sem permissão.'});
  await storage.del(f.storage_key);
  await db.query('DELETE FROM comprovacoes WHERE id=? AND condominio_id=?',[req.params.id,db.id]);
  await audit(req,'foto_excluida','comprovacao',req.params.id,null);
  ok(res,{mensagem:'Foto removida.'});
});


router.get('/comprovacoes/:tarefaId', async (req, res) => {
  const db = req.db;
  const [rows] = await db.query(
    `SELECT c.*,u.nome AS usuario_nome FROM comprovacoes c
     JOIN usuarios u ON u.id=c.usuario_id
     WHERE c.condominio_id=? AND c.tarefa_id=? ORDER BY c.enviado_em DESC`,
    [db.id, req.params.tarefaId]);
  const fotos = await Promise.all(rows.map(async f => ({...f, url: await storage.getUrl(f.storage_key)})));
  ok(res,{fotos});
});

router.post('/comprovacoes/:tarefaId',
  exigir('canPhoto'),
  (req,res,next) => storage.createUpload('comprovacoes')(req,res, e => e ? res.status(400).json({erro:e.message}) : next()),
  async (req, res) => {
    const db = req.db;
    if (!req.files?.length) return res.status(400).json({erro:'Nenhum arquivo.'});
    const [[t]] = await db.query('SELECT id FROM tarefas WHERE id=? AND condominio_id=?',[req.params.tarefaId,db.id]);
    if (!t) return res.status(404).json({erro:'Tarefa não encontrada.'});
    const obs = req.body.observacao?.trim()||null;
    const inseridas = [];
    for (const f of req.files) {
      const key  = storage.getKey(f);
      const url  = f.location || storage.pubUrl(key);
      const id   = uuidv4();
      await db.query(
        `INSERT INTO comprovacoes
          (id,condominio_id,tarefa_id,usuario_id,storage_driver,storage_key,url_publica,filename_orig,mime_type,tamanho_bytes,enviado_por_nome,observacao)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id,db.id,req.params.tarefaId,req.usuario.id,storage.DRIVER,key,url,f.originalname,f.mimetype,f.size,req.usuario.nome,obs]
      );
      inseridas.push({id, url: url || await storage.getUrl(key), enviado_por_nome: req.usuario.nome});
    }
    await db.query('INSERT INTO historico_tarefas (id,condominio_id,tarefa_id,usuario_id,campo,valor_depois,acao) VALUES (?,?,?,?,?,?,?)',
      [uuidv4(),db.id,req.params.tarefaId,req.usuario.id,'comprovacao',`${inseridas.length} foto(s)`,'foto_enviada']);
    await audit(req,'fotos_enviadas','comprovacao',req.params.tarefaId,{qtd:inseridas.length});
    ok(res,{mensagem:`${inseridas.length} foto(s) enviada(s).`,fotos:inseridas},201);
  }
);

// ══════════════════════════════════════════════════════════════
// OBSERVAÇÕES DE MORADORES
// ══════════════════════════════════════════════════════════════
router.post('/observacoes',
  body('setor').trim().notEmpty(),
  body('mensagem').trim().notEmpty().isLength({max:500}),
  val, async (req, res) => {
    const db = req.db;
    const { setor,mensagem,tarefa_id } = req.body;
    const id = uuidv4();
    await db.query('INSERT INTO observacoes_moradores (id,condominio_id,tarefa_id,usuario_id,setor,mensagem) VALUES (?,?,?,?,?,?)',
      [id,db.id,tarefa_id||null,req.usuario.id,setor,mensagem]);
    ok(res,{mensagem:'Observação registrada.'},201);
  }
);

router.get('/observacoes', async (req, res) => {
  const db = req.db;
  const podeVer = req.permissoes.seeAll;
  const params = [db.id];
  if (!podeVer) params.push(req.usuario.id);
  const [rows] = await db.query(
    `SELECT o.*,u.nome AS usuario_nome FROM observacoes_moradores o
     LEFT JOIN usuarios u ON u.id=o.usuario_id
     WHERE o.condominio_id=? ${podeVer?'':'AND o.usuario_id=?'} ORDER BY o.criado_em DESC LIMIT 50`,
    params);
  ok(res,{observacoes:rows});
});

module.exports = router;
