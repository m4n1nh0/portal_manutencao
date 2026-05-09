// utils/auth.js - Perfis e permissoes (espelho do backend)
export const ROLES = {
  admin:      { label:'Administrador', emoji:'AD', short:'Admin',      color:'#d99a18', rgb:'217 154 24', surface:'#fff4d6', ink:'#201404', signature:'Gestao total' },
  supervisor: { label:'Supervisor',    emoji:'SV', short:'Supervisor', color:'#2f7bdc', rgb:'47 123 220', surface:'#e5f0ff', ink:'#06182f', signature:'Operacao' },
  sindico:    { label:'Sindico',       emoji:'SI', short:'Sindico',    color:'#168a55', rgb:'22 138 85', surface:'#e2f7ed', ink:'#062115', signature:'Administracao' },
  subsindico: { label:'Subsindico',    emoji:'SS', short:'Subsindico', color:'#0f8b8d', rgb:'15 139 141', surface:'#ddf7f7', ink:'#041f20', signature:'Apoio' },
  conselho:   { label:'Conselho',      emoji:'CO', short:'Conselho',   color:'#7b5bd6', rgb:'123 91 214', surface:'#eee9ff', ink:'#17112d', signature:'Fiscalizacao' },
  morador:    { label:'Morador',       emoji:'MO', short:'Morador',    color:'#4f6776', rgb:'79 103 118', surface:'#e8eef1', ink:'#101a20', signature:'Minha area' },
  campo:      { label:'Equipe Campo',  emoji:'EC', short:'Campo',      color:'#d66f1f', rgb:'214 111 31', surface:'#fff0e2', ink:'#241105', signature:'Execucao' },
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

// Valida forca da senha
export function validaSenha(senha) {
  const erros = [];
  if (senha.length < 8)          erros.push('Minimo 8 caracteres');
  if (!/[A-Z]/.test(senha))      erros.push('Uma letra maiuscula');
  if (!/[0-9]/.test(senha))      erros.push('Um numero');
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
