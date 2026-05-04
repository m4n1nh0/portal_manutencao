// utils/auth.js — Perfis e permissões (espelho do backend)
export const ROLES = {
  admin:      { label:'Administrador', emoji:'👑', color:'#f0b429' },
  supervisor: { label:'Supervisor',    emoji:'🔧', color:'#58a6ff' },
  sindico:    { label:'Síndico',       emoji:'📋', color:'#3fb950' },
  subsindico: { label:'Subsíndico',    emoji:'📋', color:'#3fb950' },
  conselho:   { label:'Conselho',      emoji:'👥', color:'#bc8cff' },
  morador:    { label:'Morador',       emoji:'🏠', color:'#7d8590' },
  campo:      { label:'Equipe Campo',  emoji:'⛏',  color:'#ff9500' },
};

export const PERMISSOES = {
  admin:      { canEdit:true,  canAdd:true,  canDelete:true,  seeAll:true,  seeUsers:true,  canPhoto:true,  canApprove:true  },
  supervisor: { canEdit:true,  canAdd:true,  canDelete:false, seeAll:true,  seeUsers:false, canPhoto:true,  canApprove:false },
  sindico:    { canEdit:false, canAdd:false, canDelete:false, seeAll:true,  seeUsers:false, canPhoto:true,  canApprove:true  },
  subsindico: { canEdit:false, canAdd:false, canDelete:false, seeAll:true,  seeUsers:false, canPhoto:true,  canApprove:false },
  conselho:   { canEdit:false, canAdd:false, canDelete:false, seeAll:true,  seeUsers:false, canPhoto:false, canApprove:false },
  morador:    { canEdit:false, canAdd:false, canDelete:false, seeAll:false, seeUsers:false, canPhoto:false, canApprove:false },
  campo:      { canEdit:false, canAdd:false, canDelete:false, seeAll:true,  seeUsers:false, canPhoto:true,  canApprove:false },
};

export function getRoleInfo(perfil) { return ROLES[perfil] || ROLES.morador; }
export function getPerms(perfil)    { return PERMISSOES[perfil] || {}; }

export function saveSession(usuario, token, refresh) {
  localStorage.setItem('pm_token',   token);
  localStorage.setItem('pm_refresh', refresh);
  localStorage.setItem('pm_user',    JSON.stringify(usuario));
}

export function loadSession() {
  try {
    const u = localStorage.getItem('pm_user');
    return u ? JSON.parse(u) : null;
  } catch { return null; }
}

export function clearSession() {
  ['pm_token','pm_refresh','pm_user'].forEach(k => localStorage.removeItem(k));
}

// Valida força da senha
export function validaSenha(senha) {
  const erros = [];
  if (senha.length < 8)          erros.push('Mínimo 8 caracteres');
  if (!/[A-Z]/.test(senha))      erros.push('Uma letra maiúscula');
  if (!/[0-9]/.test(senha))      erros.push('Um número');
  if (!/[^A-Za-z0-9]/.test(senha)) erros.push('Um caractere especial (!@#$%...)');
  return erros;
}

// Mascara CPF
export function mascaraCPF(v) {
  return v.replace(/\D/g,'')
    .replace(/(\d{3})(\d)/,'$1.$2')
    .replace(/(\d{3})(\d)/,'$1.$2')
    .replace(/(\d{3})(\d{1,2})$/,'$1-$2')
    .slice(0,14);
}

// Mascara telefone
export function mascaraTel(v) {
  return v.replace(/\D/g,'')
    .replace(/(\d{2})(\d)/,'($1) $2')
    .replace(/(\d{5})(\d{1,4})$/,'$1-$2')
    .slice(0,15);
}
