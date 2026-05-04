const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db      = require('../config/database');
const mailer  = require('../config/mailer');
const storage = require('../config/storage');
const { autenticar, PERMISSOES, audit } = require('../middleware/auth');

const val = (req,res,next) => { const e=validationResult(req); if(!e.isEmpty()) return res.status(400).json({erros:e.array()}); next(); };
const ip  = req => req.headers['x-forwarded-for']?.split(',')[0] || req.ip;

const BF_MAX  = parseInt(process.env.BRUTE_FORCE_MAX_ATTEMPTS || '5');
const BF_BLOCK = parseInt(process.env.BRUTE_FORCE_BLOCK_MINUTES || '30');
const OTP_MIN  = parseInt(process.env.OTP_EXPIRES_MINUTES || '10');

// ── Gera OTP 6 dígitos ──────────────────────────────────────────
function geraOTP() { return String(Math.floor(100000 + Math.random() * 900000)); }

// ── Emite tokens ────────────────────────────────────────────────
function emiteTokens(user) {
  const payload = { id:user.id, login:user.login, nome:user.nome, perfil:user.perfil, status:user.status };
  const access  = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN||'8h' });
  const refresh = crypto.randomBytes(48).toString('hex');
  return { access, refresh, payload };
}

// ══════════════════════════════════════════════════════════════
// POST /api/auth/login  — passo 1 (senha)
// ══════════════════════════════════════════════════════════════
router.post('/login',
  body('login').trim().notEmpty(),
  body('senha').notEmpty(),
  val,
  async (req, res) => {
    const clientIp = ip(req);
    const { login, senha } = req.body;

    try {
      const [[u]] = await db.query('SELECT * FROM usuarios WHERE (login=? OR email=?) AND ativo=1', [login, login]);

      // Usuário não existe → audit genérico (não revelamos motivo)
      if (!u) {
        await db.query(
          `INSERT INTO audit_log (id,acao,detalhe,ip,resultado) VALUES (?,?,?,?,?)`,
          [uuidv4(),'login_falha',JSON.stringify({login}),clientIp,'falha']
        );
        return res.status(401).json({ erro: 'Credenciais inválidas.' });
      }

      // Verifica bloqueio por brute force
      if (u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()) {
        const restMin = Math.ceil((new Date(u.bloqueado_ate)-Date.now())/60000);
        await db.query(`INSERT INTO audit_log (id,usuario_id,usuario_nome,acao,ip,resultado) VALUES (?,?,?,?,?,?)`,
          [uuidv4(),u.id,u.nome,'login_bloqueado',clientIp,'bloqueado']);
        return res.status(429).json({ erro: `Conta bloqueada por ${restMin} min. por excesso de tentativas.` });
      }

      // Verifica senha
      const ok = await bcrypt.compare(senha, u.senha_hash);
      if (!ok) {
        const novas = u.tentativas_login + 1;
        const bloquear = novas >= BF_MAX;
        await db.query(
          `UPDATE usuarios SET tentativas_login=?, bloqueado_ate=? WHERE id=?`,
          [bloquear ? 0 : novas,
           bloquear ? new Date(Date.now() + BF_BLOCK*60000) : null,
           u.id]
        );
        await db.query(`INSERT INTO audit_log (id,usuario_id,usuario_nome,acao,detalhe,ip,resultado) VALUES (?,?,?,?,?,?,?)`,
          [uuidv4(),u.id,u.nome,'login_senha_errada',JSON.stringify({tentativa:novas}),clientIp,'falha']);

        const restantes = BF_MAX - novas;
        return res.status(401).json({
          erro: bloquear
            ? `Muitas tentativas. Conta bloqueada por ${BF_BLOCK} minutos.`
            : `Credenciais inválidas. ${restantes} tentativa(s) restante(s).`
        });
      }

      // Reseta tentativas
      await db.query('UPDATE usuarios SET tentativas_login=0, bloqueado_ate=NULL, ultimo_login=NOW(), ultimo_ip=? WHERE id=?', [clientIp, u.id]);

      // Verifica status
      if (u.status === 'pendente') return res.status(403).json({ erro: 'Cadastro aguardando aprovação da administração.' });
      if (u.status === 'rejeitado') return res.status(403).json({ erro: 'Cadastro rejeitado. Contate a administração.' });
      if (u.status === 'suspenso')  return res.status(403).json({ erro: 'Conta suspensa. Contate a administração.' });

      // 2FA ativo? Envia OTP e aguarda validação
      if (u.twofa_habilitado) {
        const otp = geraOTP();
        const exp = new Date(Date.now() + OTP_MIN * 60000);
        await db.query('UPDATE usuarios SET otp_code=?, otp_expires_em=?, otp_tentativas=0 WHERE id=?', [otp, exp, u.id]);
        try {
          await mailer.sendOTP(u.email, u.nome, otp);
        } catch(e) {
          console.error('Erro ao enviar OTP:', e.message);
          return res.status(500).json({ erro: 'Erro ao enviar código por e-mail. Tente novamente.' });
        }
        await db.query(`INSERT INTO audit_log (id,usuario_id,usuario_nome,acao,ip,resultado) VALUES (?,?,?,?,?,?)`,
          [uuidv4(),u.id,u.nome,'otp_enviado',clientIp,'sucesso']);
        return res.json({ twofa: true, userId: u.id, mensagem: `Código enviado para ${u.email.replace(/(?<=.).(?=[^@]*@)/g,'*')}` });
      }

      // Sem 2FA → emite tokens direto
      const { access, refresh } = emiteTokens(u);
      const exp = new Date(Date.now() + 7*24*3600*1000);
      const rHash = await bcrypt.hash(refresh, 10);
      await db.query('INSERT INTO sessoes (id,usuario_id,refresh_hash,ip,user_agent,expira_em) VALUES (?,?,?,?,?,?)',
        [uuidv4(),u.id,rHash,clientIp,req.headers['user-agent']||null,exp]);

      await db.query(`INSERT INTO audit_log (id,usuario_id,usuario_nome,acao,ip,resultado) VALUES (?,?,?,?,?,?)`,
        [uuidv4(),u.id,u.nome,'login_sucesso',clientIp,'sucesso']);

      return res.json({
        token: access, refreshToken: refresh,
        usuario: { id:u.id, login:u.login, nome:u.nome, perfil:u.perfil, status:u.status, email:u.email,
                   unidade:u.unidade, permissoes: PERMISSOES[u.perfil] }
      });
    } catch(e) { console.error(e); res.status(500).json({ erro:'Erro interno.' }); }
  }
);

// ══════════════════════════════════════════════════════════════
// POST /api/auth/verify-otp  — passo 2 (2FA)
// ══════════════════════════════════════════════════════════════
router.post('/verify-otp',
  body('userId').notEmpty(),
  body('otp').isLength({ min:6, max:6 }),
  val,
  async (req, res) => {
    const clientIp = ip(req);
    const { userId, otp } = req.body;
    try {
      const [[u]] = await db.query('SELECT * FROM usuarios WHERE id=? AND ativo=1', [userId]);
      if (!u) return res.status(404).json({ erro:'Usuário não encontrado.' });
      if (!u.otp_code || !u.otp_expires_em) return res.status(400).json({ erro:'Nenhum código pendente.' });
      if (new Date(u.otp_expires_em) < new Date()) return res.status(400).json({ erro:'Código expirado. Faça login novamente.' });

      // Max 3 tentativas no OTP
      if (u.otp_tentativas >= 3) {
        await db.query('UPDATE usuarios SET otp_code=NULL, otp_expires_em=NULL WHERE id=?', [u.id]);
        return res.status(429).json({ erro:'Muitas tentativas. Faça login novamente.' });
      }

      if (u.otp_code !== otp) {
        await db.query('UPDATE usuarios SET otp_tentativas=otp_tentativas+1 WHERE id=?', [u.id]);
        return res.status(401).json({ erro:`Código inválido. ${2-u.otp_tentativas} tentativa(s) restante(s).` });
      }

      // OTP válido
      await db.query('UPDATE usuarios SET otp_code=NULL, otp_expires_em=NULL, otp_tentativas=0, ultimo_login=NOW(), ultimo_ip=? WHERE id=?', [clientIp, u.id]);

      const { access, refresh } = emiteTokens(u);
      const exp   = new Date(Date.now() + 7*24*3600*1000);
      const rHash = await bcrypt.hash(refresh, 10);
      await db.query('INSERT INTO sessoes (id,usuario_id,refresh_hash,ip,user_agent,expira_em) VALUES (?,?,?,?,?,?)',
        [uuidv4(),u.id,rHash,clientIp,req.headers['user-agent']||null,exp]);

      await db.query(`INSERT INTO audit_log (id,usuario_id,usuario_nome,acao,ip,resultado) VALUES (?,?,?,?,?,?)`,
        [uuidv4(),u.id,u.nome,'otp_validado',clientIp,'sucesso']);

      return res.json({
        token: access, refreshToken: refresh,
        usuario: { id:u.id, login:u.login, nome:u.nome, perfil:u.perfil, status:u.status, email:u.email,
                   unidade:u.unidade, permissoes: PERMISSOES[u.perfil] }
      });
    } catch(e) { console.error(e); res.status(500).json({ erro:'Erro interno.' }); }
  }
);

// ══════════════════════════════════════════════════════════════
// POST /api/auth/refresh
// ══════════════════════════════════════════════════════════════
router.post('/refresh', body('refreshToken').notEmpty(), val, async (req, res) => {
  const { refreshToken } = req.body;
  try {
    const [sessoes] = await db.query(
      `SELECT s.*,u.login,u.nome,u.perfil,u.status,u.ativo FROM sessoes s
       JOIN usuarios u ON u.id=s.usuario_id
       WHERE s.revogado=0 AND s.expira_em > NOW() AND u.ativo=1`
    );
    let sessao = null;
    for (const s of sessoes) {
      if (await bcrypt.compare(refreshToken, s.refresh_hash)) { sessao = s; break; }
    }
    if (!sessao) return res.status(401).json({ erro:'Sessão inválida ou expirada.' });

    const [[u]] = await db.query('SELECT * FROM usuarios WHERE id=?', [sessao.usuario_id]);
    const { access, refresh: newRefresh } = emiteTokens(u);
    const newHash = await bcrypt.hash(newRefresh, 10);
    const exp = new Date(Date.now() + 7*24*3600*1000);
    await db.query('UPDATE sessoes SET refresh_hash=?, expira_em=? WHERE id=?', [newHash, exp, sessao.id]);

    res.json({ token: access, refreshToken: newRefresh });
  } catch(e) { res.status(500).json({ erro:'Erro interno.' }); }
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/logout
// ══════════════════════════════════════════════════════════════
router.post('/logout', autenticar, async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const [sessoes] = await db.query(`SELECT * FROM sessoes WHERE usuario_id=? AND revogado=0`, [req.usuario.id]);
    for (const s of sessoes) {
      if (await bcrypt.compare(refreshToken, s.refresh_hash)) {
        await db.query('UPDATE sessoes SET revogado=1 WHERE id=?', [s.id]);
        break;
      }
    }
  }
  await audit(req, 'logout', 'sessao', null, null);
  res.json({ mensagem:'Logout realizado.' });
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/register  — Registro público de morador
// ══════════════════════════════════════════════════════════════
router.post('/register',
  (req, res, next) => storage.createUpload('documentos', 2)(req, res, e => e ? res.status(400).json({erro:e.message}) : next()),
  body('nome').trim().notEmpty().withMessage('Nome obrigatório.'),
  body('email').isEmail().withMessage('E-mail inválido.'),
  body('cpf').trim().notEmpty().withMessage('CPF obrigatório.'),
  body('telefone').trim().notEmpty().withMessage('Telefone obrigatório.'),
  body('unidade').trim().notEmpty().withMessage('Número da unidade/lote obrigatório.'),
  body('senha').isLength({min:8}).withMessage('Senha: mínimo 8 caracteres.')
    .matches(/[A-Z]/).withMessage('Senha deve conter letra maiúscula.')
    .matches(/[0-9]/).withMessage('Senha deve conter número.')
    .matches(/[^A-Za-z0-9]/).withMessage('Senha deve conter caractere especial.'),
  val,
  async (req, res) => {
    const { nome, email, cpf, telefone, unidade, senha } = req.body;
    const arquivos = req.files || [];
    const clientIp = ip(req);

    try {
      // Verifica duplicidade
      const [[exist]] = await db.query('SELECT id FROM usuarios WHERE email=? OR cpf=?', [email, cpf]);
      if (exist) return res.status(409).json({ erro:'E-mail ou CPF já cadastrado.' });

      // Gera login único a partir do nome
      const baseLogin = nome.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'').slice(0,20);
      let login = baseLogin;
      let suffix = 1;
      while (true) {
        const [[ex]] = await db.query('SELECT id FROM usuarios WHERE login=?', [login]);
        if (!ex) break;
        login = `${baseLogin}${suffix++}`;
      }

      const hash = await bcrypt.hash(senha, 12);

      // Documentos
      const docFrente = arquivos[0] ? storage.getKey(arquivos[0]) : null;
      const docVerso  = arquivos[1] ? storage.getKey(arquivos[1]) : null;
      const urlFrente = docFrente ? storage.pubUrl(docFrente) : null;
      const urlVerso  = docVerso  ? storage.pubUrl(docVerso)  : null;

      const id = uuidv4();
      await db.query(
        `INSERT INTO usuarios
          (id,login,nome,email,cpf,telefone,unidade,senha_hash,perfil,status,
           doc_frente_key,doc_verso_key,doc_url_frente,doc_url_verso,twofa_habilitado)
         VALUES (?,?,?,?,?,?,?,?,'morador','pendente',?,?,?,?,0)`,
        [id,login,nome,email,cpf,telefone,unidade,hash,docFrente,docVerso,urlFrente,urlVerso]
      );

      await db.query(`INSERT INTO audit_log (id,usuario_id,usuario_nome,acao,detalhe,ip,resultado) VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(),id,nome,'registro_morador',JSON.stringify({unidade,email}),clientIp,'sucesso']);

      res.status(201).json({
        mensagem: 'Cadastro enviado! Aguarde a aprovação da administração. Você receberá um e-mail.',
        login
      });
    } catch(e) { console.error(e); res.status(500).json({ erro:'Erro ao registrar.' }); }
  }
);

// ══════════════════════════════════════════════════════════════
// GET /api/auth/me
// ══════════════════════════════════════════════════════════════
router.get('/me', autenticar, async (req, res) => {
  const [[u]] = await db.query(
    'SELECT id,login,nome,email,perfil,status,unidade,telefone,twofa_habilitado,ultimo_login FROM usuarios WHERE id=?',
    [req.usuario.id]);
  if (!u) return res.status(404).json({ erro:'Não encontrado.' });
  res.json({ usuario: { ...u, permissoes: PERMISSOES[u.perfil] } });
});

// ══════════════════════════════════════════════════════════════
// PATCH /api/auth/toggle-2fa
// ══════════════════════════════════════════════════════════════
router.patch('/toggle-2fa', autenticar, async (req, res) => {
  const [[u]] = await db.query('SELECT twofa_habilitado FROM usuarios WHERE id=?', [req.usuario.id]);
  const novo = u.twofa_habilitado ? 0 : 1;
  await db.query('UPDATE usuarios SET twofa_habilitado=? WHERE id=?', [novo, req.usuario.id]);
  await audit(req, '2fa_toggle', 'usuario', req.usuario.id, { novo });
  res.json({ twofa_habilitado: novo, mensagem: novo ? '2FA ativado.' : '2FA desativado.' });
});

// ══════════════════════════════════════════════════════════════
// PATCH /api/auth/change-password
// ══════════════════════════════════════════════════════════════
router.patch('/change-password', autenticar,
  body('senhaAtual').notEmpty(),
  body('novaSenha').isLength({min:8}).matches(/[A-Z]/).matches(/[0-9]/).matches(/[^A-Za-z0-9]/),
  val,
  async (req, res) => {
    const { senhaAtual, novaSenha } = req.body;
    const [[u]] = await db.query('SELECT senha_hash FROM usuarios WHERE id=?', [req.usuario.id]);
    if (!await bcrypt.compare(senhaAtual, u.senha_hash)) return res.status(401).json({ erro:'Senha atual incorreta.' });
    const hash = await bcrypt.hash(novaSenha, 12);
    await db.query('UPDATE usuarios SET senha_hash=? WHERE id=?', [hash, req.usuario.id]);
    // Revoga todas as sessões (segurança)
    await db.query('UPDATE sessoes SET revogado=1 WHERE usuario_id=?', [req.usuario.id]);
    await audit(req, 'senha_alterada', 'usuario', req.usuario.id, null);
    res.json({ mensagem:'Senha alterada. Faça login novamente.' });
  }
);

module.exports = router;
