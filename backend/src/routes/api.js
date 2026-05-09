const router  = require('express').Router();
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db      = require('../config/database');
const storage = require('../config/storage');
const { autenticar, exigir, exigirPerfil, audit } = require('../middleware/auth');

const val = (req,res,next) => { const e=validationResult(req); if(!e.isEmpty()) return res.status(400).json({erros:e.array()}); next(); };
const ok  = (res,data,c=200) => res.status(c).json(data);
const CICLOS_TAREFA = ['diario','semanal','mensal','anual','todas'];

router.use(autenticar);

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
router.get('/dashboard', async (req, res) => {
  try {
    const [totais] = await db.query(`
      SELECT ciclo,COUNT(*) total,
        SUM(status='Concluído') concluidas,
        SUM(status='Pendente') pendentes,
        SUM(prioridade='Alta' AND status!='Concluído') alta_pendente
      FROM tarefas GROUP BY ciclo`);

    const [recentes] = await db.query(`
      SELECT t.id,t.ciclo,t.setor,t.atividade,t.status,t.atualizado_em,u.nome AS por
      FROM tarefas t LEFT JOIN usuarios u ON u.id=t.atualizado_por
      WHERE t.status='Concluído' ORDER BY t.atualizado_em DESC LIMIT 8`);

    const [alta] = await db.query(`
      SELECT id,ciclo,setor,atividade,equipe,status,prioridade FROM tarefas
      WHERE prioridade='Alta'
      ORDER BY FIELD(status,'Pendente','Em Andamento','Em Revisão','Concluído') LIMIT 10`);

    // Pendentes de aprovação (só admin/síndico)
    let pendentes_aprovacao = 0;
    if (['admin','sindico','subsindico'].includes(req.usuario.perfil)) {
      const [[r]] = await db.query(`SELECT COUNT(*) AS n FROM usuarios WHERE status='pendente'`);
      pendentes_aprovacao = r.n;
    }

    ok(res, { totais, recentes, alta, pendentes_aprovacao });
  } catch(e) { console.error(e); res.status(500).json({ erro:'Erro.' }); }
});

// ══════════════════════════════════════════════════════════════
// TAREFAS — CRUD
// ══════════════════════════════════════════════════════════════
router.get('/tarefas', async (req, res) => {
  let sql = `SELECT t.*,u.nome AS atualizado_por_nome FROM tarefas t
             LEFT JOIN usuarios u ON u.id=t.atualizado_por WHERE 1=1`;
  const p = [];
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
  sql+=" ORDER BY FIELD(t.prioridade,'Alta','Média','Baixa',''),t.criado_em ASC";
  sql = sql.replace('t.criado_em ASC', 't.setor ASC,t.criado_em ASC');
  const [rows] = await db.query(sql, p);
  ok(res, { tarefas: rows });
});

router.post('/tarefas', exigir('canAdd'),
  body('ciclo').isIn(CICLOS_TAREFA),
  body('setor').trim().notEmpty(),
  body('atividade').trim().notEmpty(),
  val, async (req, res) => {
    const { ciclo,setor,area,atividade,equipe,prioridade,status,observacoes } = req.body;
    const id = uuidv4();
    await db.query(
      `INSERT INTO tarefas (id,ciclo,setor,area,atividade,equipe,prioridade,status,observacoes,atualizado_por)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id,ciclo,setor,area||'',atividade,equipe||'',prioridade||'',status||'Pendente',observacoes||'',req.usuario.id]
    );
    await db.query('INSERT INTO historico_tarefas (id,tarefa_id,usuario_id,acao) VALUES (?,?,?,?)',
      [uuidv4(),id,req.usuario.id,'criado']);
    await audit(req,'tarefa_criada','tarefa',id,{ciclo,setor,atividade});
    const [[t]] = await db.query('SELECT * FROM tarefas WHERE id=?',[id]);
    ok(res,{tarefa:t},201);
  }
);

router.put('/tarefas/:id', exigir('canEdit'),
  body('ciclo').optional().isIn(CICLOS_TAREFA),
  body('setor').trim().notEmpty(),
  body('atividade').trim().notEmpty(),
  val, async (req, res) => {
  const { ciclo,setor,area,atividade,equipe,prioridade,status,observacoes } = req.body;
  const [[antes]] = await db.query('SELECT status,ciclo FROM tarefas WHERE id=?',[req.params.id]);
  const novoCiclo = ciclo || antes?.ciclo;
  const novoStatus = status || antes?.status;
  if (!antes) return res.status(404).json({erro:'Não encontrada.'});
  await db.query(
    `UPDATE tarefas SET ciclo=?,setor=?,area=?,atividade=?,equipe=?,prioridade=?,status=?,observacoes=?,atualizado_por=? WHERE id=?`,
    [novoCiclo,setor,area||'',atividade,equipe||'',prioridade||'',novoStatus,observacoes||'',req.usuario.id,req.params.id]
  );
  if (antes.status!==novoStatus) {
    await db.query('INSERT INTO historico_tarefas (id,tarefa_id,usuario_id,campo,valor_antes,valor_depois,acao) VALUES (?,?,?,?,?,?,?)',
      [uuidv4(),req.params.id,req.usuario.id,'status',antes.status,novoStatus,'status_alterado']);
    await audit(req,'status_alterado','tarefa',req.params.id,{de:antes.status,para:novoStatus});
  }
  const [[t]] = await db.query('SELECT * FROM tarefas WHERE id=?',[req.params.id]);
  ok(res,{tarefa:t});
});

router.patch('/tarefas/:id/status', exigir('canEdit'),
  body('status').isIn(['Pendente','Em Andamento','Concluído','Em Revisão']),
  val, async (req, res) => {
    const [[antes]] = await db.query('SELECT status FROM tarefas WHERE id=?',[req.params.id]);
    if (!antes) return res.status(404).json({erro:'Não encontrada.'});
    await db.query('UPDATE tarefas SET status=?,atualizado_por=? WHERE id=?',
      [req.body.status,req.usuario.id,req.params.id]);
    await db.query('INSERT INTO historico_tarefas (id,tarefa_id,usuario_id,campo,valor_antes,valor_depois,acao) VALUES (?,?,?,?,?,?,?)',
      [uuidv4(),req.params.id,req.usuario.id,'status',antes.status,req.body.status,'status_alterado']);
    await audit(req,'status_alterado','tarefa',req.params.id,{de:antes.status,para:req.body.status});
    const [[t]] = await db.query('SELECT * FROM tarefas WHERE id=?',[req.params.id]);
    ok(res,{tarefa:t});
  }
);

router.delete('/tarefas/:id', exigir('canDelete'), async (req, res) => {
  const [r] = await db.query('DELETE FROM tarefas WHERE id=?',[req.params.id]);
  if (!r.affectedRows) return res.status(404).json({erro:'Não encontrada.'});
  await audit(req,'tarefa_excluida','tarefa',req.params.id,null);
  ok(res,{mensagem:'Excluída.'});
});

router.get('/tarefas/:id/historico', async (req, res) => {
  const [rows] = await db.query(
    `SELECT h.*,u.nome AS usuario_nome FROM historico_tarefas h
     LEFT JOIN usuarios u ON u.id=h.usuario_id
     WHERE h.tarefa_id=? ORDER BY h.criado_em DESC LIMIT 50`,
    [req.params.id]);
  ok(res,{historico:rows});
});

// ══════════════════════════════════════════════════════════════
// CICLO DINAMICO
// ══════════════════════════════════════════════════════════════
router.get('/ciclo', async (_, res) => {
  const [rows] = await db.query('SELECT * FROM ciclo_8dias ORDER BY dia_ciclo,setor');
  ok(res,{ciclo:rows});
});

router.post('/ciclo', exigirPerfil('admin','supervisor'),
  body('dia_ciclo').isInt({ min: 1, max: 365 }),
  body('setor').trim().notEmpty().isLength({ max: 80 }),
  body('trecho').optional({ nullable:true }).trim().isLength({ max: 160 }),
  body('limpeza').optional({ nullable:true }).trim(),
  body('rocagem').optional({ nullable:true }).trim(),
  body('inspecao').optional({ nullable:true }).trim(),
  val, async (req, res) => {
    const { dia_ciclo,setor,trecho,limpeza,rocagem,inspecao } = req.body;
    try {
      await db.query(
        `INSERT INTO ciclo_8dias (dia_ciclo,setor,trecho,limpeza,rocagem,inspecao)
         VALUES (?,?,?,?,?,?)`,
        [parseInt(dia_ciclo, 10),setor.trim(),trecho?.trim()||null,limpeza?.trim()||null,rocagem?.trim()||null,inspecao?.trim()||null]
      );
      const [[item]] = await db.query('SELECT * FROM ciclo_8dias WHERE dia_ciclo=?',[parseInt(dia_ciclo, 10)]);
      await audit(req,'ciclo_criado','ciclo_8dias',item.id,{dia_ciclo,setor});
      ok(res,{item},201);
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Dia do ciclo ja cadastrado.'});
      console.error(e);
      return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.put('/ciclo/:id', exigirPerfil('admin','supervisor'),
  body('dia_ciclo').isInt({ min: 1, max: 365 }),
  body('setor').trim().notEmpty().isLength({ max: 80 }),
  body('trecho').optional({ nullable:true }).trim().isLength({ max: 160 }),
  body('limpeza').optional({ nullable:true }).trim(),
  body('rocagem').optional({ nullable:true }).trim(),
  body('inspecao').optional({ nullable:true }).trim(),
  val, async (req, res) => {
    const { dia_ciclo,setor,trecho,limpeza,rocagem,inspecao } = req.body;
    try {
      const [r] = await db.query(
        `UPDATE ciclo_8dias
         SET dia_ciclo=?,setor=?,trecho=?,limpeza=?,rocagem=?,inspecao=?
         WHERE id=?`,
        [parseInt(dia_ciclo, 10),setor.trim(),trecho?.trim()||null,limpeza?.trim()||null,rocagem?.trim()||null,inspecao?.trim()||null,req.params.id]
      );
      if (!r.affectedRows) return res.status(404).json({erro:'Item do ciclo nao encontrado.'});
      const [[item]] = await db.query('SELECT * FROM ciclo_8dias WHERE id=?',[req.params.id]);
      await audit(req,'ciclo_atualizado','ciclo_8dias',req.params.id,{dia_ciclo,setor});
      ok(res,{item});
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Dia do ciclo ja cadastrado.'});
      console.error(e);
      return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.delete('/ciclo/:id', exigirPerfil('admin','supervisor'), async (req, res) => {
  const [[item]] = await db.query('SELECT id,dia_ciclo,setor FROM ciclo_8dias WHERE id=?',[req.params.id]);
  if (!item) return res.status(404).json({erro:'Item do ciclo nao encontrado.'});
  await db.query('DELETE FROM ciclo_8dias WHERE id=?',[req.params.id]);
  await audit(req,'ciclo_removido','ciclo_8dias',req.params.id,{dia_ciclo:item.dia_ciclo,setor:item.setor});
  ok(res,{mensagem:'Dia do ciclo removido.'});
});

// Cadastro de quadras e ruas
router.get('/quadras', async (_, res) => {
  const [quadras] = await db.query(`
    SELECT id,codigo,nome,descricao,ativo,criado_em,atualizado_em
    FROM quadras
    ORDER BY codigo
  `);
  const [ruas] = await db.query(`
    SELECT id,quadra_id,nome,ordem,ativo,criado_em,atualizado_em
    FROM ruas
    ORDER BY ordem,nome
  `);
  const porQuadra = ruas.reduce((acc, rua) => {
    (acc[rua.quadra_id] ||= []).push(rua);
    return acc;
  }, {});
  ok(res, { quadras: quadras.map(q => ({ ...q, ruas: porQuadra[q.id] || [] })) });
});

router.post('/quadras', exigirPerfil('admin','supervisor'),
  body('codigo').trim().notEmpty().isLength({ max: 3 }),
  body('nome').optional({ nullable:true }).trim().isLength({ max: 80 }),
  body('descricao').optional({ nullable:true }).trim().isLength({ max: 255 }),
  val, async (req, res) => {
    const codigo = req.body.codigo.trim().toUpperCase();
    const nome = req.body.nome?.trim() || `Quadra ${codigo}`;
    const descricao = req.body.descricao?.trim() || null;
    try {
      await db.query('INSERT INTO quadras (codigo,nome,descricao) VALUES (?,?,?)', [codigo,nome,descricao]);
      const [[quadra]] = await db.query('SELECT * FROM quadras WHERE codigo=?',[codigo]);
      await audit(req,'quadra_criada','quadra',quadra.id,{codigo,nome});
      ok(res,{quadra},201);
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Quadra ja cadastrada.'});
      console.error(e);
      return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.put('/quadras/:id', exigirPerfil('admin','supervisor'),
  body('codigo').trim().notEmpty().isLength({ max: 3 }),
  body('nome').trim().notEmpty().isLength({ max: 80 }),
  body('descricao').optional({ nullable:true }).trim().isLength({ max: 255 }),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const codigo = req.body.codigo.trim().toUpperCase();
    const descricao = req.body.descricao?.trim() || null;
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    try {
      const [r] = await db.query(
        'UPDATE quadras SET codigo=?,nome=?,descricao=?,ativo=? WHERE id=?',
        [codigo,req.body.nome.trim(),descricao,ativo,req.params.id]
      );
      if (!r.affectedRows) return res.status(404).json({erro:'Quadra nao encontrada.'});
      const [[quadra]] = await db.query('SELECT * FROM quadras WHERE id=?',[req.params.id]);
      await audit(req,'quadra_atualizada','quadra',req.params.id,{codigo,nome:req.body.nome});
      ok(res,{quadra});
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Codigo de quadra ja cadastrado.'});
      console.error(e);
      return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.delete('/quadras/:id', exigirPerfil('admin','supervisor'), async (req, res) => {
  const [r] = await db.query('DELETE FROM quadras WHERE id=?',[req.params.id]);
  if (!r.affectedRows) return res.status(404).json({erro:'Quadra nao encontrada.'});
  await audit(req,'quadra_excluida','quadra',req.params.id,null);
  ok(res,{mensagem:'Quadra removida.'});
});

router.post('/quadras/:id/ruas', exigirPerfil('admin','supervisor'),
  body('nome').trim().notEmpty().isLength({ max: 80 }),
  body('ordem').optional({ nullable:true }).isInt({ min: 1, max: 99 }),
  val, async (req, res) => {
    const [[quadra]] = await db.query('SELECT id FROM quadras WHERE id=?',[req.params.id]);
    if (!quadra) return res.status(404).json({erro:'Quadra nao encontrada.'});
    const ordem = req.body.ordem
      ? parseInt(req.body.ordem)
      : (await db.query('SELECT COALESCE(MAX(ordem),0)+1 AS proxima FROM ruas WHERE quadra_id=?',[req.params.id]))[0][0].proxima;
    try {
      await db.query('INSERT INTO ruas (quadra_id,nome,ordem) VALUES (?,?,?)',[req.params.id,req.body.nome.trim(),ordem]);
      const [[rua]] = await db.query('SELECT * FROM ruas WHERE quadra_id=? AND ordem=?',[req.params.id,ordem]);
      await audit(req,'rua_criada','rua',rua.id,{quadra_id:req.params.id,nome:rua.nome});
      ok(res,{rua},201);
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Rua ou ordem ja cadastrada nessa quadra.'});
      console.error(e);
      return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.put('/ruas/:id', exigirPerfil('admin','supervisor'),
  body('nome').trim().notEmpty().isLength({ max: 80 }),
  body('ordem').isInt({ min: 1, max: 99 }),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    try {
      const [r] = await db.query('UPDATE ruas SET nome=?,ordem=?,ativo=? WHERE id=?',
        [req.body.nome.trim(),parseInt(req.body.ordem),ativo,req.params.id]);
      if (!r.affectedRows) return res.status(404).json({erro:'Rua nao encontrada.'});
      const [[rua]] = await db.query('SELECT * FROM ruas WHERE id=?',[req.params.id]);
      await audit(req,'rua_atualizada','rua',req.params.id,{nome:rua.nome,ordem:rua.ordem});
      ok(res,{rua});
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Rua ou ordem ja cadastrada nessa quadra.'});
      console.error(e);
      return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.delete('/ruas/:id', exigirPerfil('admin','supervisor'), async (req, res) => {
  const [r] = await db.query('DELETE FROM ruas WHERE id=?',[req.params.id]);
  if (!r.affectedRows) return res.status(404).json({erro:'Rua nao encontrada.'});
  await audit(req,'rua_excluida','rua',req.params.id,null);
  ok(res,{mensagem:'Rua removida.'});
});

// Responsaveis / equipes
router.get('/equipes', async (_, res) => {
  const [equipes] = await db.query('SELECT * FROM equipes ORDER BY ativo DESC,nome ASC');
  ok(res,{equipes});
});

router.post('/equipes', exigirPerfil('admin','supervisor'),
  body('nome').trim().notEmpty().isLength({ max: 100 }),
  body('tipo').optional({ nullable:true }).trim().isLength({ max: 40 }),
  body('contato').optional({ nullable:true }).trim().isLength({ max: 120 }),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    try {
      await db.query('INSERT INTO equipes (nome,tipo,contato,ativo) VALUES (?,?,?,?)',
        [req.body.nome.trim(),req.body.tipo?.trim()||null,req.body.contato?.trim()||null,ativo]);
      const [[equipe]] = await db.query('SELECT * FROM equipes WHERE nome=?',[req.body.nome.trim()]);
      await audit(req,'equipe_criada','equipe',equipe.id,{nome:equipe.nome});
      ok(res,{equipe},201);
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Responsavel ja cadastrado.'});
      console.error(e); return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.put('/equipes/:id', exigirPerfil('admin','supervisor'),
  body('nome').trim().notEmpty().isLength({ max: 100 }),
  body('tipo').optional({ nullable:true }).trim().isLength({ max: 40 }),
  body('contato').optional({ nullable:true }).trim().isLength({ max: 120 }),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    try {
      const [r] = await db.query('UPDATE equipes SET nome=?,tipo=?,contato=?,ativo=? WHERE id=?',
        [req.body.nome.trim(),req.body.tipo?.trim()||null,req.body.contato?.trim()||null,ativo,req.params.id]);
      if (!r.affectedRows) return res.status(404).json({erro:'Responsavel nao encontrado.'});
      const [[equipe]] = await db.query('SELECT * FROM equipes WHERE id=?',[req.params.id]);
      await audit(req,'equipe_atualizada','equipe',req.params.id,{nome:equipe.nome});
      ok(res,{equipe});
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Responsavel ja cadastrado.'});
      console.error(e); return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.delete('/equipes/:id', exigirPerfil('admin','supervisor'), async (req, res) => {
  const [r] = await db.query('DELETE FROM equipes WHERE id=?',[req.params.id]);
  if (!r.affectedRows) return res.status(404).json({erro:'Responsavel nao encontrado.'});
  await audit(req,'equipe_excluida','equipe',req.params.id,null);
  ok(res,{mensagem:'Responsavel removido.'});
});

// Areas / locais
router.get('/locais', async (_, res) => {
  const [locais] = await db.query('SELECT * FROM locais ORDER BY ativo DESC,categoria ASC,nome ASC');
  ok(res,{locais});
});

router.post('/locais', exigirPerfil('admin','supervisor'),
  body('nome').trim().notEmpty().isLength({ max: 120 }),
  body('categoria').optional({ nullable:true }).trim().isLength({ max: 60 }),
  body('descricao').optional({ nullable:true }).trim().isLength({ max: 255 }),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    try {
      await db.query('INSERT INTO locais (nome,categoria,descricao,ativo) VALUES (?,?,?,?)',
        [req.body.nome.trim(),req.body.categoria?.trim()||null,req.body.descricao?.trim()||null,ativo]);
      const [[local]] = await db.query('SELECT * FROM locais WHERE nome=?',[req.body.nome.trim()]);
      await audit(req,'local_criado','local',local.id,{nome:local.nome});
      ok(res,{local},201);
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Area/local ja cadastrado.'});
      console.error(e); return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.put('/locais/:id', exigirPerfil('admin','supervisor'),
  body('nome').trim().notEmpty().isLength({ max: 120 }),
  body('categoria').optional({ nullable:true }).trim().isLength({ max: 60 }),
  body('descricao').optional({ nullable:true }).trim().isLength({ max: 255 }),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    try {
      const [r] = await db.query('UPDATE locais SET nome=?,categoria=?,descricao=?,ativo=? WHERE id=?',
        [req.body.nome.trim(),req.body.categoria?.trim()||null,req.body.descricao?.trim()||null,ativo,req.params.id]);
      if (!r.affectedRows) return res.status(404).json({erro:'Area/local nao encontrado.'});
      const [[local]] = await db.query('SELECT * FROM locais WHERE id=?',[req.params.id]);
      await audit(req,'local_atualizado','local',req.params.id,{nome:local.nome});
      ok(res,{local});
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Area/local ja cadastrado.'});
      console.error(e); return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.delete('/locais/:id', exigirPerfil('admin','supervisor'), async (req, res) => {
  const [r] = await db.query('DELETE FROM locais WHERE id=?',[req.params.id]);
  if (!r.affectedRows) return res.status(404).json({erro:'Area/local nao encontrado.'});
  await audit(req,'local_excluido','local',req.params.id,null);
  ok(res,{mensagem:'Area/local removido.'});
});

// Modelos de tarefas / rotinas
router.get('/modelos-tarefas', async (_, res) => {
  const [modelos] = await db.query('SELECT * FROM tarefa_modelos ORDER BY ativo DESC,ciclo,setor,atividade');
  ok(res,{modelos});
});

router.post('/modelos-tarefas', exigirPerfil('admin','supervisor'),
  body('ciclo').isIn(CICLOS_TAREFA),
  body('setor').trim().notEmpty().isLength({ max: 60 }),
  body('area').optional({ nullable:true }).trim().isLength({ max: 120 }),
  body('atividade').trim().notEmpty(),
  body('equipe').optional({ nullable:true }).trim().isLength({ max: 100 }),
  body('prioridade').optional({ nullable:true }).isIn(['Alta','Media','Média','Baixa','']),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    try {
      const { ciclo,setor,area,atividade,equipe,prioridade } = req.body;
      await db.query(
        'INSERT INTO tarefa_modelos (ciclo,setor,area,atividade,equipe,prioridade,ativo) VALUES (?,?,?,?,?,?,?)',
        [ciclo,setor.trim(),area?.trim()||'',atividade.trim(),equipe?.trim()||'',prioridade||'',ativo]
      );
      const [[modelo]] = await db.query(
        'SELECT * FROM tarefa_modelos WHERE ciclo=? AND setor=? AND area=? AND atividade=?',
        [ciclo,setor.trim(),area?.trim()||'',atividade.trim()]
      );
      await audit(req,'modelo_tarefa_criado','tarefa_modelo',modelo.id,{ciclo,setor});
      ok(res,{modelo},201);
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Modelo de tarefa ja cadastrado.'});
      console.error(e); return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.put('/modelos-tarefas/:id', exigirPerfil('admin','supervisor'),
  body('ciclo').isIn(CICLOS_TAREFA),
  body('setor').trim().notEmpty().isLength({ max: 60 }),
  body('area').optional({ nullable:true }).trim().isLength({ max: 120 }),
  body('atividade').trim().notEmpty(),
  body('equipe').optional({ nullable:true }).trim().isLength({ max: 100 }),
  body('prioridade').optional({ nullable:true }).isIn(['Alta','Media','Média','Baixa','']),
  body('ativo').optional().isBoolean(),
  val, async (req, res) => {
    const { ciclo,setor,area,atividade,equipe,prioridade } = req.body;
    const ativo = req.body.ativo === undefined ? 1 : (req.body.ativo ? 1 : 0);
    try {
      const [r] = await db.query(
        'UPDATE tarefa_modelos SET ciclo=?,setor=?,area=?,atividade=?,equipe=?,prioridade=?,ativo=? WHERE id=?',
        [ciclo,setor.trim(),area?.trim()||'',atividade.trim(),equipe?.trim()||'',prioridade||'',ativo,req.params.id]
      );
      if (!r.affectedRows) return res.status(404).json({erro:'Modelo de tarefa nao encontrado.'});
      const [[modelo]] = await db.query('SELECT * FROM tarefa_modelos WHERE id=?',[req.params.id]);
      await audit(req,'modelo_tarefa_atualizado','tarefa_modelo',req.params.id,{ciclo,setor});
      ok(res,{modelo});
    } catch(e) {
      if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({erro:'Modelo de tarefa ja cadastrado.'});
      console.error(e); return res.status(500).json({erro:'Erro interno.'});
    }
  }
);

router.delete('/modelos-tarefas/:id', exigirPerfil('admin','supervisor'), async (req, res) => {
  const [r] = await db.query('DELETE FROM tarefa_modelos WHERE id=?',[req.params.id]);
  if (!r.affectedRows) return res.status(404).json({erro:'Modelo de tarefa nao encontrado.'});
  await audit(req,'modelo_tarefa_excluido','tarefa_modelo',req.params.id,null);
  ok(res,{mensagem:'Modelo de tarefa removido.'});
});

// ══════════════════════════════════════════════════════════════
// COMPROVAÇÕES FOTOGRÁFICAS
// ══════════════════════════════════════════════════════════════
const FOTO_PERFIS = ['admin','supervisor','sindico','subsindico','campo'];

// FIX: DELETE /foto/:id ANTES de GET /:tarefaId (evita captura de "foto" como tarefaId)
router.delete('/comprovacoes/foto/:id', async (req, res) => {
  const [[f]] = await db.query('SELECT * FROM comprovacoes WHERE id=?',[req.params.id]);
  if (!f) return res.status(404).json({erro:'Não encontrada.'});
  if (f.usuario_id!==req.usuario.id && req.usuario.perfil!=='admin')
    return res.status(403).json({erro:'Sem permissão.'});
  await storage.del(f.storage_key);
  await db.query('DELETE FROM comprovacoes WHERE id=?',[req.params.id]);
  await audit(req,'foto_excluida','comprovacao',req.params.id,null);
  ok(res,{mensagem:'Foto removida.'});
});


router.get('/comprovacoes/:tarefaId', async (req, res) => {
  const [rows] = await db.query(
    `SELECT c.*,u.nome AS usuario_nome FROM comprovacoes c
     JOIN usuarios u ON u.id=c.usuario_id
     WHERE c.tarefa_id=? ORDER BY c.enviado_em DESC`,
    [req.params.tarefaId]);
  const fotos = await Promise.all(rows.map(async f => ({...f, url: await storage.getUrl(f.storage_key)})));
  ok(res,{fotos});
});

router.post('/comprovacoes/:tarefaId',
  (req,res,next) => !FOTO_PERFIS.includes(req.usuario.perfil) ? res.status(403).json({erro:'Sem permissão.'}) : next(),
  (req,res,next) => storage.createUpload('comprovacoes')(req,res, e => e ? res.status(400).json({erro:e.message}) : next()),
  async (req, res) => {
    if (!req.files?.length) return res.status(400).json({erro:'Nenhum arquivo.'});
    const [[t]] = await db.query('SELECT id FROM tarefas WHERE id=?',[req.params.tarefaId]);
    if (!t) return res.status(404).json({erro:'Tarefa não encontrada.'});
    const obs = req.body.observacao?.trim()||null;
    const inseridas = [];
    for (const f of req.files) {
      const key  = storage.getKey(f);
      const url  = f.location || storage.pubUrl(key);
      const id   = uuidv4();
      await db.query(
        `INSERT INTO comprovacoes
          (id,tarefa_id,usuario_id,storage_driver,storage_key,url_publica,filename_orig,mime_type,tamanho_bytes,enviado_por_nome,observacao)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [id,req.params.tarefaId,req.usuario.id,storage.DRIVER,key,url,f.originalname,f.mimetype,f.size,req.usuario.nome,obs]
      );
      inseridas.push({id, url: url || await storage.getUrl(key), enviado_por_nome: req.usuario.nome});
    }
    await db.query('INSERT INTO historico_tarefas (id,tarefa_id,usuario_id,campo,valor_depois,acao) VALUES (?,?,?,?,?,?)',
      [uuidv4(),req.params.tarefaId,req.usuario.id,'comprovacao',`${inseridas.length} foto(s)`,'foto_enviada']);
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
    const { setor,mensagem,tarefa_id } = req.body;
    const id = uuidv4();
    await db.query('INSERT INTO observacoes_moradores (id,tarefa_id,usuario_id,setor,mensagem) VALUES (?,?,?,?,?)',
      [id,tarefa_id||null,req.usuario.id,setor,mensagem]);
    ok(res,{mensagem:'Observação registrada.'},201);
  }
);

router.get('/observacoes', async (req, res) => {
  const podeVer = ['admin','supervisor','sindico','subsindico','conselho'].includes(req.usuario.perfil);
  const [rows] = await db.query(
    `SELECT o.*,u.nome AS usuario_nome FROM observacoes_moradores o
     LEFT JOIN usuarios u ON u.id=o.usuario_id
     ${podeVer?'':'WHERE o.usuario_id=?'} ORDER BY o.criado_em DESC LIMIT 50`,
    podeVer?[]:[req.usuario.id]);
  ok(res,{observacoes:rows});
});

module.exports = router;
