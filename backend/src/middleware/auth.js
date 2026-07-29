const jwt  = require('jsonwebtoken');
const db   = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// ── Permissões por perfil ───────────────────────────────────────
// `superadmin` é o provedor do SaaS: opera o portal comercial e não
// pertence a nenhum condomínio.
const PERMISSOES = {
  superadmin: { canEdit:true,  canAdd:true,  canDelete:true,  seeAll:true,  seeUsers:true,  canPhoto:true,  canApprove:true,  canProvider:true },
  admin:      { canEdit:true,  canAdd:true,  canDelete:true,  seeAll:true,  seeUsers:true,  canPhoto:true,  canApprove:true  },
  supervisor: { canEdit:true,  canAdd:true,  canDelete:true,  seeAll:true,  seeUsers:true,  canPhoto:true,  canApprove:true  },
  sindico:    { canEdit:true,  canAdd:true,  canDelete:true,  seeAll:true,  seeUsers:true,  canPhoto:true,  canApprove:true  },
  subsindico: { canEdit:false, canAdd:false, canDelete:false, seeAll:true,  seeUsers:false, canPhoto:true,  canApprove:false },
  conselho:   { canEdit:false, canAdd:false, canDelete:false, seeAll:true,  seeUsers:false, canPhoto:true,  canApprove:true  },
  morador:    { canEdit:false, canAdd:false, canDelete:false, seeAll:false, seeUsers:false, canPhoto:false, canApprove:false },
  campo:      { canEdit:false, canAdd:false, canDelete:false, seeAll:true,  seeUsers:false, canPhoto:true,  canApprove:false },
};

// ── Verifica JWT ────────────────────────────────────────────────
function autenticar(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ erro: 'Token não fornecido.' });

  let payload;
  try {
    payload = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
  } catch(e) {
    return res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }

  req.usuario    = payload;
  req.permissoes = PERMISSOES[payload.perfil] || {};

  // Rejeita usuários não aprovados (moradores pendentes)
  if (payload.status === 'pendente') return res.status(403).json({ erro: 'Conta aguardando aprovação.' });
  if (payload.status === 'suspenso') return res.status(403).json({ erro: 'Conta suspensa. Contate a administração.' });

  // ── Amarração do token ao condomínio do subdomínio ────────────
  // Um token emitido para o condomínio A não vale no subdomínio de B.
  if (payload.condominio_id) {
    if (!req.tenant || req.tenant.id !== payload.condominio_id) {
      return res.status(401).json({
        erro: 'Sessão pertence a outro condomínio. Faça login pelo endereço correto.',
        codigo: 'TENANT_INCOMPATIVEL',
      });
    }
  } else if (payload.perfil !== 'superadmin') {
    return res.status(401).json({ erro: 'Sessão sem condomínio. Faça login novamente.' });
  }

  next();
}

const exigir       = perm   => (req, res, next) => req.permissoes[perm] ? next() : res.status(403).json({ erro:'Acesso negado para seu perfil.' });
// O superadmin está acima da hierarquia do condomínio: quando entra num
// cliente para dar suporte, passa por qualquer exigência de perfil.
const exigirPerfil = (...p) => (req, res, next) =>
  (req.usuario.perfil === 'superadmin' || p.includes(req.usuario.perfil))
    ? next()
    : res.status(403).json({ erro:'Acesso restrito.' });
const exigirSuperadmin = (req, res, next) =>
  req.usuario?.perfil === 'superadmin' ? next() : res.status(403).json({ erro:'Acesso restrito ao provedor.' });

// ── Audit log helper ────────────────────────────────────────────
async function audit(req, acao, recurso, recurso_id, detalhe, resultado='sucesso') {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    const condominioId = req.usuario?.condominio_id || req.tenant?.id || null;
    // Acesso de suporte do provedor fica marcado no próprio registro.
    const contexto = req.usuario?.impersonando
      ? { ...(detalhe || {}), _impersonado_por: req.usuario.impersonado_por }
      : detalhe;
    // Grava no mesmo banco de onde a auditoria é lida: o do condomínio
    // quando há um, o principal para ações do provedor.
    const destino = req.db || db;
    await destino.query(
      `INSERT INTO audit_log (id,condominio_id,usuario_id,usuario_nome,acao,recurso,recurso_id,detalhe,ip,user_agent,resultado)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), condominioId, req.usuario?.id||null, req.usuario?.nome||null, acao, recurso||null, recurso_id||null,
       contexto ? JSON.stringify(contexto) : null, ip, req.headers['user-agent']||null, resultado]
    );
  } catch(e) { /* audit nunca quebra o fluxo */ }
}

module.exports = { autenticar, exigir, exigirPerfil, exigirSuperadmin, PERMISSOES, audit };
