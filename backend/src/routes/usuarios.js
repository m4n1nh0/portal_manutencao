const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto'); // FIX: movido para o topo
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db      = require('../config/database');
const storage = require('../config/storage');
const mailer  = require('../config/mailer');
const { autenticar, exigir, exigirPerfil, audit } = require('../middleware/auth');

const val = (req,res,next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(400).json({ erros: e.array() });
  next();
};
const ADMIN_PERFIS = ['admin','supervisor','sindico'];
const APROVADORES = ['admin','supervisor','sindico','conselho','subsindico'];

router.use(autenticar);

// ── LISTAR ────────────────────────────────────────────────────
router.get('/', exigirPerfil(...APROVADORES), async (req, res) => {
  const { status, perfil, busca } = req.query;
  let sql = `SELECT id,login,nome,email,cpf,telefone,perfil,status,unidade,
                    criado_em,aprovado_em,ultimo_login,ativo,
                    doc_url_frente,doc_url_verso
             FROM usuarios WHERE 1=1`;
  const p = [];
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
  const [rows] = await db.query(
    `SELECT id,login,nome,email,cpf,telefone,unidade,criado_em,doc_url_frente,doc_url_verso
     FROM usuarios WHERE status='pendente' AND perfil='morador' ORDER BY criado_em ASC`
  );
  res.json({ pendentes: rows, total: rows.length });
});

// FIX 11: auditoria/geral ANTES de /:id/auditoria para não ser capturado como :id
router.get('/auditoria/geral', exigirPerfil(...ADMIN_PERFIS), async (req, res) => {
  const { acao, resultado, limite = 50 } = req.query;
  let sql = `SELECT a.*,u.login FROM audit_log a LEFT JOIN usuarios u ON u.id=a.usuario_id WHERE 1=1`;
  const p = [];
  if (acao)      { sql += ' AND a.acao=?';      p.push(acao); }
  if (resultado) { sql += ' AND a.resultado=?'; p.push(resultado); }
  sql += ` ORDER BY a.criado_em DESC LIMIT ?`; p.push(parseInt(limite));
  const [rows] = await db.query(sql, p);
  res.json({ log: rows });
});

// ── APROVAR ───────────────────────────────────────────────────
router.patch('/:id/aprovar', exigir('canApprove'), async (req, res) => {
  const [[u]] = await db.query('SELECT * FROM usuarios WHERE id=? AND status="pendente"', [req.params.id]);
  if (!u) return res.status(404).json({ erro: 'Usuário não encontrado ou já processado.' });
  await db.query(
    `UPDATE usuarios SET status='aprovado', aprovado_por=?, aprovado_em=NOW(), twofa_habilitado=1 WHERE id=?`,
    [req.usuario.id, req.params.id]
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
    const { motivo } = req.body;
    const [[u]] = await db.query('SELECT * FROM usuarios WHERE id=?', [req.params.id]);
    if (!u) return res.status(404).json({ erro: 'Não encontrado.' });
    await db.query(`UPDATE usuarios SET status='rejeitado', motivo_rejeicao=? WHERE id=?`, [motivo, req.params.id]);
    try { await mailer.sendRejeicao(u.email, u.nome, motivo); } catch(e) { console.error('Email rejeição:', e.message); }
    await audit(req, 'usuario_rejeitado', 'usuario', req.params.id, { motivo });
    res.json({ mensagem: 'Usuário rejeitado. E-mail enviado.' });
  }
);

// ── SUSPENDER / REATIVAR ──────────────────────────────────────
router.patch('/:id/status', exigirPerfil(...ADMIN_PERFIS), async (req, res) => {
  const { status } = req.body;
  if (!['aprovado','suspenso'].includes(status)) return res.status(400).json({ erro: 'Status inválido.' });
  if (req.params.id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode alterar seu próprio status.' });
  await db.query('UPDATE usuarios SET status=? WHERE id=?', [status, req.params.id]);
  if (status === 'suspenso') await db.query('UPDATE sessoes SET revogado=1 WHERE usuario_id=?', [req.params.id]);
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
    const { login, nome, email, senha, perfil, telefone } = req.body;
    const [[ex]] = await db.query('SELECT id FROM usuarios WHERE login=? OR email=?', [login, email]);
    if (ex) return res.status(409).json({ erro: 'Login ou e-mail já existe.' });
    const hash = await bcrypt.hash(senha, 12);
    const id   = uuidv4();
    await db.query(
      `INSERT INTO usuarios (id,login,nome,email,telefone,senha_hash,perfil,status) VALUES (?,?,?,?,?,?,?,'aprovado')`,
      [id, login, nome, email, telefone || null, hash, perfil]
    );
    await audit(req, 'usuario_criado', 'usuario', id, { login, perfil });
    const [[u]] = await db.query('SELECT id,login,nome,email,perfil,status FROM usuarios WHERE id=?', [id]);
    res.status(201).json({ usuario: u });
  }
);

// ── EDITAR ────────────────────────────────────────────────────
router.put('/:id', exigirPerfil(...ADMIN_PERFIS), async (req, res) => {
  const { nome, email, perfil, telefone, unidade } = req.body;
  await db.query('UPDATE usuarios SET nome=?,email=?,perfil=?,telefone=?,unidade=? WHERE id=?',
    [nome, email, perfil, telefone || null, unidade || null, req.params.id]);
  await audit(req, 'usuario_editado', 'usuario', req.params.id, { nome, perfil });
  const [[u]] = await db.query('SELECT id,login,nome,email,perfil,status,unidade FROM usuarios WHERE id=?', [req.params.id]);
  res.json({ usuario: u });
});

// ── RESETAR SENHA ─────────────────────────────────────────────
router.patch('/:id/reset-senha', exigirPerfil(...ADMIN_PERFIS), async (req, res) => {
  // FIX: crypto já importado no topo
  const nova = crypto.randomBytes(6).toString('hex') + '@1A';
  const hash = await bcrypt.hash(nova, 12);
  await db.query('UPDATE usuarios SET senha_hash=? WHERE id=?', [hash, req.params.id]);
  await db.query('UPDATE sessoes SET revogado=1 WHERE usuario_id=?', [req.params.id]);
  await audit(req, 'senha_resetada', 'usuario', req.params.id, null);
  res.json({ mensagem: 'Senha resetada.', senha_temp: nova });
});

// ── AUDIT LOG DO USUÁRIO ──────────────────────────────────────
router.get('/:id/auditoria', exigirPerfil(...ADMIN_PERFIS), async (req, res) => {
  const [rows] = await db.query(
    `SELECT id,acao,recurso,detalhe,ip,resultado,criado_em FROM audit_log
     WHERE usuario_id=? ORDER BY criado_em DESC LIMIT 100`,
    [req.params.id]
  );
  res.json({ log: rows });
});

module.exports = router;
