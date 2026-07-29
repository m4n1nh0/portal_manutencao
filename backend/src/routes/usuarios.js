const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto'); // FIX: movido para o topo
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const mailer  = require('../config/mailer');
const { autenticar, exigir, exigirPerfil, audit } = require('../middleware/auth');
const { exigirTenant, exigirContratoAtivo, bloquearEscritaInadimplente } = require('../middleware/tenant');
const { verificarLimite } = require('../tenancy/acesso');

const val = (req,res,next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(400).json({ erros: e.array() });
  next();
};
const ADMIN_PERFIS = ['superadmin','admin','supervisor','sindico'];
const APROVADORES = ['superadmin','admin','supervisor','sindico','conselho','subsindico'];

router.use(exigirTenant);
router.use(autenticar);
router.use(exigirContratoAtivo);
router.use(bloquearEscritaInadimplente);

// ── LISTAR ────────────────────────────────────────────────────
router.get('/', exigirPerfil(...APROVADORES), async (req, res) => {
  const db = req.db;
  const { status, perfil, busca } = req.query;
  let sql = `SELECT id,login,nome,email,cpf,telefone,perfil,status,unidade,
                    criado_em,aprovado_em,ultimo_login,ativo,
                    doc_url_frente,doc_url_verso
             FROM usuarios WHERE condominio_id=?`;
  const p = [db.id];
  if (status) { sql += ' AND status=?'; p.push(status); }
  if (perfil) { sql += ' AND perfil=?'; p.push(perfil); }
  if (busca)  { sql += ' AND (nome LIKE ? OR email LIKE ? OR unidade LIKE ?)'; p.push(`%${busca}%`,`%${busca}%`,`%${busca}%`); }
  if (!ADMIN_PERFIS.includes(req.usuario.perfil)) { sql += ' AND perfil=? AND status=?'; p.push('morador','pendente'); }
  sql += ' ORDER BY FIELD(status,"pendente","aprovado","suspenso","rejeitado"), criado_em DESC';
  const [rows] = await db.query(sql, p);
  res.json({ usuarios: rows });
});

// FIX 11: rotas estáticas ANTES das rotas com parâmetro /:id
// ── PENDENTES ─────────────────────────────────────────────────
router.get('/pendentes', exigir('canApprove'), async (req, res) => {
  const db = req.db;
  const [rows] = await db.query(
    `SELECT id,login,nome,email,cpf,telefone,unidade,criado_em,doc_url_frente,doc_url_verso
     FROM usuarios WHERE condominio_id=? AND status='pendente' AND perfil='morador' ORDER BY criado_em ASC`,
    [db.id]
  );
  res.json({ pendentes: rows, total: rows.length });
});

// FIX 11: auditoria/geral ANTES de /:id/auditoria para não ser capturado como :id
router.get('/auditoria/geral', exigirPerfil(...ADMIN_PERFIS), async (req, res) => {
  const db = req.db;
  const { acao, resultado, limite = 50 } = req.query;
  let sql = `SELECT a.*,u.login FROM audit_log a LEFT JOIN usuarios u ON u.id=a.usuario_id
             WHERE a.condominio_id=?`;
  const p = [db.id];
  if (acao)      { sql += ' AND a.acao=?';      p.push(acao); }
  if (resultado) { sql += ' AND a.resultado=?'; p.push(resultado); }
  sql += ` ORDER BY a.criado_em DESC LIMIT ?`; p.push(parseInt(limite));
  const [rows] = await db.query(sql, p);
  res.json({ log: rows });
});

// ── APROVAR ───────────────────────────────────────────────────
router.patch('/:id/aprovar', exigir('canApprove'), async (req, res) => {
  const db = req.db;
  const [[u]] = await db.query(
    'SELECT * FROM usuarios WHERE id=? AND condominio_id=? AND status="pendente"', [req.params.id, db.id]);
  if (!u) return res.status(404).json({ erro: 'Usuário não encontrado ou já processado.' });

  const limite = await verificarLimite(db, req.tenant, 'moradores');
  if (!limite.permitido) {
    return res.status(402).json({
      erro: `Plano ${req.tenant.plano_nome || ''} limitado a ${limite.limite} moradores (em uso: ${limite.uso}). Faça upgrade para aprovar novos cadastros.`,
      codigo: 'LIMITE_PLANO',
    });
  }

  await db.query(
    `UPDATE usuarios SET status='aprovado', aprovado_por=?, aprovado_em=NOW(), twofa_habilitado=1
     WHERE id=? AND condominio_id=?`,
    [req.usuario.id, req.params.id, db.id]
  );
  try { await mailer.sendAprovacao(u.email, u.nome, u.login, null); } catch(e) { console.error('Email aprovação:', e.message); }
  await audit(req, 'usuario_aprovado', 'usuario', req.params.id, { login: u.login, unidade: u.unidade });
  res.json({ mensagem: `${u.nome} aprovado. E-mail enviado.` });
});

// ── REJEITAR ──────────────────────────────────────────────────
router.patch('/:id/rejeitar', exigir('canApprove'),
  body('motivo').trim().notEmpty().withMessage('Motivo obrigatório.'),
  val,
  async (req, res) => {
    const db = req.db;
    const { motivo } = req.body;
    const [[u]] = await db.query('SELECT * FROM usuarios WHERE id=? AND condominio_id=?', [req.params.id, db.id]);
    if (!u) return res.status(404).json({ erro: 'Não encontrado.' });
    await db.query(`UPDATE usuarios SET status='rejeitado', motivo_rejeicao=? WHERE id=? AND condominio_id=?`,
      [motivo, req.params.id, db.id]);
    try { await mailer.sendRejeicao(u.email, u.nome, motivo); } catch(e) { console.error('Email rejeição:', e.message); }
    await audit(req, 'usuario_rejeitado', 'usuario', req.params.id, { motivo });
    res.json({ mensagem: 'Usuário rejeitado. E-mail enviado.' });
  }
);

// ── SUSPENDER / REATIVAR ──────────────────────────────────────
router.patch('/:id/status', exigirPerfil(...ADMIN_PERFIS), async (req, res) => {
  const db = req.db;
  const { status } = req.body;
  if (!['aprovado','suspenso'].includes(status)) return res.status(400).json({ erro: 'Status inválido.' });
  if (req.params.id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode alterar seu próprio status.' });
  const [r] = await db.query('UPDATE usuarios SET status=? WHERE id=? AND condominio_id=?', [status, req.params.id, db.id]);
  if (!r.affectedRows) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  if (status === 'suspenso') {
    await db.query('UPDATE sessoes SET revogado=1 WHERE usuario_id=? AND condominio_id=?', [req.params.id, db.id]);
  }
  await audit(req, `usuario_${status}`, 'usuario', req.params.id, null);
  res.json({ mensagem: `Usuário ${status}.` });
});

// ── CRIAR USUÁRIO INTERNO ─────────────────────────────────────
router.post('/', exigirPerfil(...ADMIN_PERFIS),
  body('login').trim().isLength({ min: 3 }),
  body('nome').trim().notEmpty(),
  body('email').isEmail(),
  body('senha').isLength({ min: 8 }).matches(/[A-Z]/).matches(/[0-9]/).matches(/[^A-Za-z0-9]/),
  body('perfil').isIn(['admin','supervisor','sindico','subsindico','conselho','campo']),
  val,
  async (req, res) => {
    const db = req.db;
    const { login, nome, email, senha, perfil, telefone } = req.body;

    const limite = await verificarLimite(db, req.tenant, 'usuarios');
    if (!limite.permitido) {
      return res.status(402).json({
        erro: `Plano limitado a ${limite.limite} usuários internos (em uso: ${limite.uso}). Faça upgrade para adicionar mais.`,
        codigo: 'LIMITE_PLANO',
      });
    }

    const [[ex]] = await db.query(
      'SELECT id FROM usuarios WHERE condominio_id=? AND (login=? OR email=?)', [db.id, login, email]);
    if (ex) return res.status(409).json({ erro: 'Login ou e-mail já existe neste condomínio.' });
    const hash = await bcrypt.hash(senha, 12);
    const id   = uuidv4();
    await db.query(
      `INSERT INTO usuarios (id,condominio_id,login,nome,email,telefone,senha_hash,perfil,status)
       VALUES (?,?,?,?,?,?,?,?,'aprovado')`,
      [id, db.id, login, nome, email, telefone || null, hash, perfil]
    );
    await audit(req, 'usuario_criado', 'usuario', id, { login, perfil });
    const [[u]] = await db.query(
      'SELECT id,login,nome,email,perfil,status FROM usuarios WHERE id=? AND condominio_id=?', [id, db.id]);
    res.status(201).json({ usuario: u });
  }
);

// ── EDITAR ────────────────────────────────────────────────────
router.put('/:id', exigirPerfil(...ADMIN_PERFIS), async (req, res) => {
  const db = req.db;
  const { nome, email, perfil, telefone, unidade } = req.body;
  const [r] = await db.query(
    'UPDATE usuarios SET nome=?,email=?,perfil=?,telefone=?,unidade=? WHERE id=? AND condominio_id=?',
    [nome, email, perfil, telefone || null, unidade || null, req.params.id, db.id]);
  if (!r.affectedRows) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  await audit(req, 'usuario_editado', 'usuario', req.params.id, { nome, perfil });
  const [[u]] = await db.query(
    'SELECT id,login,nome,email,perfil,status,unidade FROM usuarios WHERE id=? AND condominio_id=?', [req.params.id, db.id]);
  res.json({ usuario: u });
});

// ── RESETAR SENHA ─────────────────────────────────────────────
router.patch('/:id/reset-senha', exigirPerfil(...ADMIN_PERFIS), async (req, res) => {
  const db = req.db;
  // FIX: crypto já importado no topo
  const nova = crypto.randomBytes(6).toString('hex') + '@1A';
  const hash = await bcrypt.hash(nova, 12);
  const [r] = await db.query('UPDATE usuarios SET senha_hash=? WHERE id=? AND condominio_id=?', [hash, req.params.id, db.id]);
  if (!r.affectedRows) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  await db.query('UPDATE sessoes SET revogado=1 WHERE usuario_id=? AND condominio_id=?', [req.params.id, db.id]);
  await audit(req, 'senha_resetada', 'usuario', req.params.id, null);
  res.json({ mensagem: 'Senha resetada.', senha_temp: nova });
});

// ── AUDIT LOG DO USUÁRIO ──────────────────────────────────────
router.get('/:id/auditoria', exigirPerfil(...ADMIN_PERFIS), async (req, res) => {
  const db = req.db;
  const [rows] = await db.query(
    `SELECT id,acao,recurso,detalhe,ip,resultado,criado_em FROM audit_log
     WHERE condominio_id=? AND usuario_id=? ORDER BY criado_em DESC LIMIT 100`,
    [db.id, req.params.id]
  );
  res.json({ log: rows });
});

module.exports = router;
