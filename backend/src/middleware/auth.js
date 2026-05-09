const jwt  = require('jsonwebtoken');
const db   = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// ── Permissões por perfil ───────────────────────────────────────
const PERMISSOES = {
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
  try {
    req.usuario    = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    req.permissoes = PERMISSOES[req.usuario.perfil] || {};
    // Rejeita usuários não aprovados (moradores pendentes)
    if (req.usuario.status === 'pendente') return res.status(403).json({ erro: 'Conta aguardando aprovação.' });
    if (req.usuario.status === 'suspenso') return res.status(403).json({ erro: 'Conta suspensa. Contate a administração.' });
    next();
  } catch(e) {
    res.status(401).json({ erro: 'Token inválido ou expirado.' });
  }
}

const exigir       = perm   => (req, res, next) => req.permissoes[perm] ? next() : res.status(403).json({ erro:'Acesso negado para seu perfil.' });
const exigirPerfil = (...p) => (req, res, next) => p.includes(req.usuario.perfil) ? next() : res.status(403).json({ erro:'Acesso restrito.' });

// ── Audit log helper ────────────────────────────────────────────
async function audit(req, acao, recurso, recurso_id, detalhe, resultado='sucesso') {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
    await db.query(
      `INSERT INTO audit_log (id,usuario_id,usuario_nome,acao,recurso,recurso_id,detalhe,ip,user_agent,resultado)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [uuidv4(), req.usuario?.id||null, req.usuario?.nome||null, acao, recurso||null, recurso_id||null,
       detalhe ? JSON.stringify(detalhe) : null, ip, req.headers['user-agent']||null, resultado]
    );
  } catch(e) { /* audit nunca quebra o fluxo */ }
}

module.exports = { autenticar, exigir, exigirPerfil, PERMISSOES, audit };
