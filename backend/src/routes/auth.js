const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const pool    = require('../config/database');
const mailer  = require('../config/mailer');
const storage = require('../config/storage');
const { autenticar, PERMISSOES, audit } = require('../middleware/auth');
const { exigirTenant } = require('../middleware/tenant');
const { verificarLimite, avaliarContrato } = require('../tenancy/acesso');

const val = (req,res,next) => { const e=validationResult(req); if(!e.isEmpty()) return res.status(400).json({erros:e.array()}); next(); };
const ip  = req => req.headers['x-forwarded-for']?.split(',')[0] || req.ip;

const BF_MAX  = parseInt(process.env.BRUTE_FORCE_MAX_ATTEMPTS || '5');
const BF_BLOCK = parseInt(process.env.BRUTE_FORCE_BLOCK_MINUTES || '30');
const OTP_MIN  = parseInt(process.env.OTP_EXPIRES_MINUTES || '10');

// ── Gera OTP 6 dígitos ──────────────────────────────────────────
function geraOTP() { return String(Math.floor(100000 + Math.random() * 900000)); }
function smtpReady() { return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS); }
function localRuntime() {
  const urls = `${process.env.CLIENT_URL || ''} ${process.env.APP_URL || ''}`;
  return /localhost|127\.0\.0\.1/.test(urls);
}

const ESCOPO_PROVEDOR = {
  db: pool,
  filtro: "condominio_id IS NULL AND perfil = 'superadmin'",
  params: [],
  condominio: null,
};

/**
 * Onde procurar os usuários que podem se autenticar neste endereço:
 *  - subdomínio de condomínio → usuários daquele condomínio
 *  - portal do provedor        → apenas superadmin (sem condomínio)
 */
function escopoAuth(req) {
  if (req.tenant) {
    return {
      db: req.db,
      filtro: 'condominio_id = ?',
      params: [req.tenant.id],
      condominio: req.tenant,
    };
  }
  if (req.contextoProvedor) return ESCOPO_PROVEDOR;
  return null;
}

/**
 * Onde vive o registro do usuário JÁ autenticado.
 *
 * Diferente de escopoAuth por causa do suporte: o provedor navega dentro do
 * condomínio do cliente, mas a linha dele em `usuarios` continua fora de
 * qualquer condomínio. Sem essa distinção, /me e as rotas de conta não
 * encontrariam o próprio usuário durante a impersonação.
 */
function escopoSessao(req) {
  if (req.usuario?.impersonando || (req.usuario?.perfil === 'superadmin' && !req.usuario?.condominio_id)) {
    return ESCOPO_PROVEDOR;
  }
  return escopoAuth(req);
}

// ── Emite tokens ────────────────────────────────────────────────
function emiteTokens(user, condominio) {
  const payload = {
    id: user.id,
    login: user.login,
    nome: user.nome,
    perfil: user.perfil,
    status: user.status,
    condominio_id: user.condominio_id || null,
    condominio_slug: condominio?.slug || null,
  };
  const access  = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN||'8h' });
  const refresh = crypto.randomBytes(48).toString('hex');
  return { access, refresh, payload };
}

function respostaUsuario(u, condominio) {
  return {
    id:u.id, login:u.login, nome:u.nome, perfil:u.perfil, status:u.status, email:u.email,
    unidade:u.unidade, telefone:u.telefone, cpf:u.cpf, twofa_habilitado:u.twofa_habilitado,
    ultimo_login:u.ultimo_login, permissoes: PERMISSOES[u.perfil],
    condominio: condominio ? {
      id: condominio.id, slug: condominio.slug, nome: condominio.nome,
      logo_url: condominio.logo_url, cor_primaria: condominio.cor_primaria,
      plano: condominio.plano_nome, status: condominio.status,
    } : null,
    contrato: condominio ? avaliarContrato(condominio) : null,
  };
}

async function registrarSessao(db, usuario, condominioId, refresh, req) {
  const exp = new Date(Date.now() + 7*24*3600*1000);
  const rHash = await bcrypt.hash(refresh, 10);
  await db.query(
    'INSERT INTO sessoes (id,usuario_id,condominio_id,refresh_hash,ip,user_agent,expira_em) VALUES (?,?,?,?,?,?,?)',
    [uuidv4(),usuario.id,condominioId,rHash,ip(req),req.headers['user-agent']||null,exp]
  );
}

// ══════════════════════════════════════════════════════════════
// GET /api/auth/contexto — identidade pública do subdomínio
// Usado pela tela de login para exibir nome/logo/cor do condomínio.
// ══════════════════════════════════════════════════════════════
router.get('/contexto', (req, res) => {
  if (req.contextoProvedor) {
    return res.json({ tipo: 'provedor', condominio: null });
  }
  if (!req.tenant) {
    return res.status(404).json({
      tipo: 'desconhecido',
      erro: `Condomínio "${req.tenantSlug || ''}" não encontrado.`,
    });
  }
  const contrato = avaliarContrato(req.tenant);
  res.json({
    tipo: 'condominio',
    condominio: {
      slug: req.tenant.slug,
      nome: req.tenant.nome,
      logo_url: req.tenant.logo_url,
      cor_primaria: req.tenant.cor_primaria,
    },
    // Só informa que há bloqueio; detalhes financeiros ficam para o login.
    acesso: { permiteLogin: contrato.permiteLogin, mensagem: contrato.permiteLogin ? null : contrato.mensagem },
  });
});

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

    const escopo = escopoAuth(req);
    if (!escopo) {
      return res.status(404).json({ erro: 'Condomínio não identificado neste endereço.', codigo: 'TENANT_NAO_ENCONTRADO' });
    }

    // Contrato bloqueado derruba o login antes de qualquer verificação.
    if (escopo.condominio) {
      const contrato = avaliarContrato(escopo.condominio);
      if (!contrato.permiteLogin) {
        return res.status(403).json({ erro: contrato.mensagem, codigo: 'CONTRATO_BLOQUEADO', estado: contrato.estado });
      }
    }

    try {
      const [[u]] = await escopo.db.query(
        `SELECT * FROM usuarios WHERE ${escopo.filtro} AND (login=? OR email=?) AND ativo=1`,
        [...escopo.params, login, login]
      );

      // Usuário não existe → audit genérico (não revelamos motivo)
      if (!u) {
        await pool.query(
          `INSERT INTO audit_log (id,condominio_id,acao,detalhe,ip,resultado) VALUES (?,?,?,?,?,?)`,
          [uuidv4(),escopo.condominio?.id||null,'login_falha',JSON.stringify({login}),clientIp,'falha']
        );
        return res.status(401).json({ erro: 'Credenciais inválidas.' });
      }

      // Verifica bloqueio por brute force
      if (u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()) {
        const restMin = Math.ceil((new Date(u.bloqueado_ate)-Date.now())/60000);
        await pool.query(`INSERT INTO audit_log (id,condominio_id,usuario_id,usuario_nome,acao,ip,resultado) VALUES (?,?,?,?,?,?,?)`,
          [uuidv4(),u.condominio_id,u.id,u.nome,'login_bloqueado',clientIp,'bloqueado']);
        return res.status(429).json({ erro: `Conta bloqueada por ${restMin} min. por excesso de tentativas.` });
      }

      // Verifica senha
      const ok = await bcrypt.compare(senha, u.senha_hash);
      if (!ok) {
        const novas = u.tentativas_login + 1;
        const bloquear = novas >= BF_MAX;
        await escopo.db.query(
          `UPDATE usuarios SET tentativas_login=?, bloqueado_ate=? WHERE id=? AND ${escopo.filtro}`,
          [bloquear ? 0 : novas,
           bloquear ? new Date(Date.now() + BF_BLOCK*60000) : null,
           u.id, ...escopo.params]
        );
        await pool.query(`INSERT INTO audit_log (id,condominio_id,usuario_id,usuario_nome,acao,detalhe,ip,resultado) VALUES (?,?,?,?,?,?,?,?)`,
          [uuidv4(),u.condominio_id,u.id,u.nome,'login_senha_errada',JSON.stringify({tentativa:novas}),clientIp,'falha']);

        const restantes = BF_MAX - novas;
        return res.status(401).json({
          erro: bloquear
            ? `Muitas tentativas. Conta bloqueada por ${BF_BLOCK} minutos.`
            : `Credenciais inválidas. ${restantes} tentativa(s) restante(s).`
        });
      }

      // Reseta tentativas
      await escopo.db.query(
        `UPDATE usuarios SET tentativas_login=0, bloqueado_ate=NULL, ultimo_login=NOW(), ultimo_ip=? WHERE id=? AND ${escopo.filtro}`,
        [clientIp, u.id, ...escopo.params]);

      // Verifica status
      if (u.status === 'pendente') return res.status(403).json({ erro: 'Cadastro aguardando aprovação da administração.' });
      if (u.status === 'rejeitado') return res.status(403).json({ erro: 'Cadastro rejeitado. Contate a administração.' });
      if (u.status === 'suspenso')  return res.status(403).json({ erro: 'Conta suspensa. Contate a administração.' });

      // 2FA ativo? Envia OTP e aguarda validação
      if (u.twofa_habilitado) {
        const otp = geraOTP();
        const exp = new Date(Date.now() + OTP_MIN * 60000);
        await escopo.db.query(
          `UPDATE usuarios SET otp_code=?, otp_expires_em=?, otp_tentativas=0 WHERE id=? AND ${escopo.filtro}`,
          [otp, exp, u.id, ...escopo.params]);
        try {
          await mailer.sendOTP(u.email, u.nome, otp);
        } catch(e) {
          console.error('Erro ao enviar OTP:', e.message);
          return res.status(500).json({ erro: 'Erro ao enviar código por e-mail. Tente novamente.' });
        }
        await pool.query(`INSERT INTO audit_log (id,condominio_id,usuario_id,usuario_nome,acao,ip,resultado) VALUES (?,?,?,?,?,?,?)`,
          [uuidv4(),u.condominio_id,u.id,u.nome,'otp_enviado',clientIp,'sucesso']);
        return res.json({ twofa: true, userId: u.id, mensagem: `Código enviado para ${u.email.replace(/(?<=.).(?=[^@]*@)/g,'*')}` });
      }

      // Sem 2FA → emite tokens direto
      const { access, refresh } = emiteTokens(u, escopo.condominio);
      await registrarSessao(escopo.db, u, u.condominio_id, refresh, req);

      await pool.query(`INSERT INTO audit_log (id,condominio_id,usuario_id,usuario_nome,acao,ip,resultado) VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(),u.condominio_id,u.id,u.nome,'login_sucesso',clientIp,'sucesso']);

      return res.json({
        token: access, refreshToken: refresh,
        usuario: respostaUsuario(u, escopo.condominio),
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

    const escopo = escopoAuth(req);
    if (!escopo) return res.status(404).json({ erro: 'Condomínio não identificado neste endereço.' });

    try {
      const [[u]] = await escopo.db.query(
        `SELECT * FROM usuarios WHERE id=? AND ${escopo.filtro} AND ativo=1`, [userId, ...escopo.params]);
      if (!u) return res.status(404).json({ erro:'Usuário não encontrado.' });
      if (!u.otp_code || !u.otp_expires_em) return res.status(400).json({ erro:'Nenhum código pendente.' });
      if (new Date(u.otp_expires_em) < new Date()) return res.status(400).json({ erro:'Código expirado. Faça login novamente.' });

      // Max 3 tentativas no OTP
      if (u.otp_tentativas >= 3) {
        await escopo.db.query(
          `UPDATE usuarios SET otp_code=NULL, otp_expires_em=NULL WHERE id=? AND ${escopo.filtro}`, [u.id, ...escopo.params]);
        return res.status(429).json({ erro:'Muitas tentativas. Faça login novamente.' });
      }

      if (u.otp_code !== otp) {
        await escopo.db.query(
          `UPDATE usuarios SET otp_tentativas=otp_tentativas+1 WHERE id=? AND ${escopo.filtro}`, [u.id, ...escopo.params]);
        return res.status(401).json({ erro:`Código inválido. ${2-u.otp_tentativas} tentativa(s) restante(s).` });
      }

      // OTP válido
      await escopo.db.query(
        `UPDATE usuarios SET otp_code=NULL, otp_expires_em=NULL, otp_tentativas=0, ultimo_login=NOW(), ultimo_ip=?
         WHERE id=? AND ${escopo.filtro}`, [clientIp, u.id, ...escopo.params]);

      const { access, refresh } = emiteTokens(u, escopo.condominio);
      await registrarSessao(escopo.db, u, u.condominio_id, refresh, req);

      await pool.query(`INSERT INTO audit_log (id,condominio_id,usuario_id,usuario_nome,acao,ip,resultado) VALUES (?,?,?,?,?,?,?)`,
        [uuidv4(),u.condominio_id,u.id,u.nome,'otp_validado',clientIp,'sucesso']);

      return res.json({
        token: access, refreshToken: refresh,
        usuario: respostaUsuario(u, escopo.condominio),
      });
    } catch(e) { console.error(e); res.status(500).json({ erro:'Erro interno.' }); }
  }
);

// ══════════════════════════════════════════════════════════════
// POST /api/auth/refresh
// ══════════════════════════════════════════════════════════════
router.post('/refresh', body('refreshToken').notEmpty(), val, async (req, res) => {
  const { refreshToken } = req.body;
  const escopo = escopoAuth(req);
  if (!escopo) return res.status(404).json({ erro: 'Condomínio não identificado neste endereço.' });

  try {
    // <=> compara com segurança contra NULL (sessões do superadmin).
    const [sessoes] = await escopo.db.query(
      `SELECT s.*,u.login,u.nome,u.perfil,u.status,u.ativo FROM sessoes s
       JOIN usuarios u ON u.id=s.usuario_id
       WHERE s.condominio_id <=> ? AND s.revogado=0 AND s.expira_em > NOW() AND u.ativo=1`,
      [escopo.condominio?.id || null]
    );
    let sessao = null;
    for (const s of sessoes) {
      if (await bcrypt.compare(refreshToken, s.refresh_hash)) { sessao = s; break; }
    }
    if (!sessao) return res.status(401).json({ erro:'Sessão inválida ou expirada.' });

    const [[u]] = await escopo.db.query(
      `SELECT * FROM usuarios WHERE id=? AND ${escopo.filtro}`, [sessao.usuario_id, ...escopo.params]);
    if (!u) return res.status(401).json({ erro:'Sessão inválida ou expirada.' });

    const { access, refresh: newRefresh } = emiteTokens(u, escopo.condominio);
    const newHash = await bcrypt.hash(newRefresh, 10);
    const exp = new Date(Date.now() + 7*24*3600*1000);
    await escopo.db.query(
      'UPDATE sessoes SET refresh_hash=?, expira_em=? WHERE id=? AND condominio_id <=> ?',
      [newHash, exp, sessao.id, escopo.condominio?.id || null]);

    res.json({ token: access, refreshToken: newRefresh });
  } catch(e) { console.error(e); res.status(500).json({ erro:'Erro interno.' }); }
});

// ══════════════════════════════════════════════════════════════
// POST /api/auth/logout
// ══════════════════════════════════════════════════════════════
router.post('/logout', autenticar, async (req, res) => {
  const { refreshToken } = req.body;
  const escopo = escopoSessao(req);
  if (refreshToken && escopo) {
    const [sessoes] = await escopo.db.query(
      `SELECT * FROM sessoes WHERE usuario_id=? AND condominio_id <=> ? AND revogado=0`,
      [req.usuario.id, escopo.condominio?.id || null]);
    for (const s of sessoes) {
      if (await bcrypt.compare(refreshToken, s.refresh_hash)) {
        await escopo.db.query('UPDATE sessoes SET revogado=1 WHERE id=? AND condominio_id <=> ?',
          [s.id, escopo.condominio?.id || null]);
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
  exigirTenant,
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
    const db = req.db;
    const { nome, email, cpf, telefone, unidade, senha } = req.body;
    const arquivos = req.files || [];
    const clientIp = ip(req);

    const contrato = avaliarContrato(req.tenant);
    if (!contrato.permiteLogin || contrato.somenteLeitura) {
      return res.status(403).json({ erro: 'Cadastros temporariamente indisponíveis neste condomínio.' });
    }

    try {
      const limite = await verificarLimite(db, req.tenant, 'moradores');
      if (!limite.permitido) {
        return res.status(402).json({ erro: 'Limite de moradores do plano atingido. Contate a administração do condomínio.' });
      }

      // Verifica duplicidade dentro do condomínio
      const [[exist]] = await db.query(
        'SELECT id FROM usuarios WHERE condominio_id=? AND (email=? OR cpf=?)', [db.id, email, cpf]);
      if (exist) return res.status(409).json({ erro:'E-mail ou CPF já cadastrado.' });

      // Gera login único a partir do nome (único dentro do condomínio)
      const baseLogin = nome.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'').slice(0,20);
      let login = baseLogin;
      let suffix = 1;
      while (true) {
        const [[ex]] = await db.query('SELECT id FROM usuarios WHERE condominio_id=? AND login=?', [db.id, login]);
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
          (id,condominio_id,login,nome,email,cpf,telefone,unidade,senha_hash,perfil,status,
           doc_frente_key,doc_verso_key,doc_url_frente,doc_url_verso,twofa_habilitado)
         VALUES (?,?,?,?,?,?,?,?,?,'morador','pendente',?,?,?,?,0)`,
        [id,db.id,login,nome,email,cpf,telefone,unidade,hash,docFrente,docVerso,urlFrente,urlVerso]
      );

      await pool.query(`INSERT INTO audit_log (id,condominio_id,usuario_id,usuario_nome,acao,detalhe,ip,resultado) VALUES (?,?,?,?,?,?,?,?)`,
        [uuidv4(),db.id,id,nome,'registro_morador',JSON.stringify({unidade,email}),clientIp,'sucesso']);

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
  const escopo = escopoSessao(req);
  if (!escopo) return res.status(404).json({ erro: 'Condomínio não identificado neste endereço.' });
  const [[u]] = await escopo.db.query(
    `SELECT id,login,nome,email,perfil,status,unidade,telefone,cpf,twofa_habilitado,ultimo_login,condominio_id
     FROM usuarios WHERE id=? AND ${escopo.filtro}`,
    [req.usuario.id, ...escopo.params]);
  if (!u) return res.status(404).json({ erro:'Não encontrado.' });
  // Durante o suporte, o condomínio mostrado é o do subdomínio, não o do usuário.
  res.json({ usuario: { ...respostaUsuario(u, req.tenant || escopo.condominio), impersonando: Boolean(req.usuario.impersonando) } });
});

// ══════════════════════════════════════════════════════════════
// PATCH /api/auth/profile
// ══════════════════════════════════════════════════════════════
router.patch('/profile', autenticar,
  body('nome').trim().notEmpty().isLength({ max: 120 }),
  body('email').isEmail().isLength({ max: 120 }),
  body('telefone').optional({ nullable:true }).trim().isLength({ max: 20 }),
  body('unidade').optional({ nullable:true }).trim().isLength({ max: 30 }),
  val,
  async (req, res) => {
    const escopo = escopoSessao(req);
    if (!escopo) return res.status(404).json({ erro: 'Condomínio não identificado neste endereço.' });

    const nome = req.body.nome.trim();
    const email = req.body.email.trim().toLowerCase();
    const telefone = req.body.telefone?.trim() || null;
    const unidade = req.body.unidade?.trim() || null;

    try {
      const [[existing]] = await escopo.db.query(
        `SELECT id FROM usuarios WHERE ${escopo.filtro} AND email=? AND id<>?`,
        [...escopo.params, email, req.usuario.id]
      );
      if (existing) return res.status(409).json({ erro:'E-mail já cadastrado em outra conta.' });

      await escopo.db.query(
        `UPDATE usuarios SET nome=?, email=?, telefone=?, unidade=? WHERE id=? AND ${escopo.filtro}`,
        [nome,email,telefone,unidade,req.usuario.id, ...escopo.params]
      );

      const [[u]] = await escopo.db.query(
        `SELECT id,login,nome,email,perfil,status,unidade,telefone,cpf,twofa_habilitado,ultimo_login,condominio_id
         FROM usuarios WHERE id=? AND ${escopo.filtro}`,
        [req.usuario.id, ...escopo.params]
      );
      await audit(req, 'perfil_atualizado', 'usuario', req.usuario.id, { email, telefone, unidade });
      res.json({ usuario: respostaUsuario(u, escopo.condominio) });
    } catch(e) {
      console.error(e);
      res.status(500).json({ erro:'Erro ao atualizar perfil.' });
    }
  }
);

// ══════════════════════════════════════════════════════════════
// PATCH /api/auth/toggle-2fa
// ══════════════════════════════════════════════════════════════
router.patch('/toggle-2fa', autenticar, async (req, res) => {
  const escopo = escopoSessao(req);
  if (!escopo) return res.status(404).json({ erro: 'Condomínio não identificado neste endereço.' });
  const [[u]] = await escopo.db.query(
    `SELECT twofa_habilitado FROM usuarios WHERE id=? AND ${escopo.filtro}`, [req.usuario.id, ...escopo.params]);
  if (!u) return res.status(404).json({ erro:'Não encontrado.' });
  const novo = u.twofa_habilitado ? 0 : 1;
  if (novo && process.env.NODE_ENV === 'production' && !smtpReady() && !localRuntime()) {
    return res.status(400).json({ erro:'Configure SMTP_USER e SMTP_PASS antes de ativar o duplo fator.' });
  }
  await escopo.db.query(
    `UPDATE usuarios SET twofa_habilitado=? WHERE id=? AND ${escopo.filtro}`, [novo, req.usuario.id, ...escopo.params]);
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
    const escopo = escopoSessao(req);
    if (!escopo) return res.status(404).json({ erro: 'Condomínio não identificado neste endereço.' });

    const { senhaAtual, novaSenha } = req.body;
    const [[u]] = await escopo.db.query(
      `SELECT senha_hash FROM usuarios WHERE id=? AND ${escopo.filtro}`, [req.usuario.id, ...escopo.params]);
    if (!u) return res.status(404).json({ erro:'Não encontrado.' });
    if (!await bcrypt.compare(senhaAtual, u.senha_hash)) return res.status(401).json({ erro:'Senha atual incorreta.' });
    const hash = await bcrypt.hash(novaSenha, 12);
    await escopo.db.query(
      `UPDATE usuarios SET senha_hash=? WHERE id=? AND ${escopo.filtro}`, [hash, req.usuario.id, ...escopo.params]);
    // Revoga todas as sessões (segurança)
    await escopo.db.query('UPDATE sessoes SET revogado=1 WHERE usuario_id=? AND condominio_id <=> ?',
      [req.usuario.id, escopo.condominio?.id || null]);
    await audit(req, 'senha_alterada', 'usuario', req.usuario.id, null);
    res.json({ mensagem:'Senha alterada. Faça login novamente.' });
  }
);

module.exports = router;
