// utils/auth.js - Perfis e permissoes (espelho do backend)
export const ROLES = {
  superadmin: { label:'Provedor',      emoji:'PR', short:'Provedor',   color:'#0f766e', rgb:'15 118 110', surface:'#dcfaf5', ink:'#032420', signature:'Gestao do SaaS' },
  admin:      { label:'Administrador', emoji:'AD', short:'Admin',      color:'#5148f5', rgb:'81 72 245', surface:'#ebeaff', ink:'#12113a', signature:'Gestao total' },
  supervisor: { label:'Supervisor',    emoji:'SV', short:'Supervisor', color:'#2f7cf6', rgb:'47 124 246', surface:'#e8f1ff', ink:'#06183a', signature:'Operacao' },
  sindico:    { label:'Sindico',       emoji:'SI', short:'Sindico',    color:'#18a874', rgb:'24 168 116', surface:'#e4f8ef', ink:'#052417', signature:'Administracao' },
  subsindico: { label:'Subsindico',    emoji:'SS', short:'Subsindico', color:'#13a8b4', rgb:'19 168 180', surface:'#dff7f9', ink:'#042326', signature:'Apoio' },
  conselho:   { label:'Conselho',      emoji:'CO', short:'Conselho',   color:'#6c5ce7', rgb:'108 92 231', surface:'#eeebff', ink:'#17123b', signature:'Fiscalizacao' },
  morador:    { label:'Morador',       emoji:'MO', short:'Morador',    color:'#667085', rgb:'102 112 133', surface:'#edf1f6', ink:'#121822', signature:'Minha area' },
  campo:      { label:'Equipe Campo',  emoji:'EC', short:'Campo',      color:'#f06f3a', rgb:'240 111 58', surface:'#fff0e9', ink:'#2f1208', signature:'Execucao' },
};

export const PERMISSOES = {
  superadmin: { canEdit:true,  canAdd:true,  canDelete:true,  seeAll:true,  seeUsers:true,  canPhoto:true,  canApprove:true,  canProvider:true },
  admin:      { canEdit:true,  canAdd:true,  canDelete:true,  seeAll:true,  seeUsers:true,  canPhoto:true,  canApprove:true  },
  supervisor: { canEdit:true,  canAdd:true,  canDelete:true,  seeAll:true,  seeUsers:true,  canPhoto:true,  canApprove:true  },
  sindico:    { canEdit:true,  canAdd:true,  canDelete:true,  seeAll:true,  seeUsers:true,  canPhoto:true,  canApprove:true  },
  subsindico: { canEdit:false, canAdd:false, canDelete:false, seeAll:true,  seeUsers:false, canPhoto:true,  canApprove:false },
  conselho:   { canEdit:false, canAdd:false, canDelete:false, seeAll:true,  seeUsers:false, canPhoto:true,  canApprove:true  },
  morador:    { canEdit:false, canAdd:false, canDelete:false, seeAll:false, seeUsers:false, canPhoto:false, canApprove:false },
  campo:      { canEdit:false, canAdd:false, canDelete:false, seeAll:true,  seeUsers:false, canPhoto:true,  canApprove:false },
};

export function getRoleInfo(perfil) { return ROLES[perfil] || ROLES.morador; }
export function getPerms(perfil)    { return PERMISSOES[perfil] || {}; }

// O superadmin logado no portal do provedor vai para /provedor; quando entra
// num condomínio para dar suporte, o token traz condominio_id e ele cai no /app.
export function getHomePath(perfil, usuario) {
  if (perfil === 'superadmin' && !usuario?.condominio) return '/provedor';
  return perfil === 'morador' ? '/app/morador' : '/app';
}

export function saveSession(usuario, token, refresh) {
  localStorage.setItem('pm_token', token);
  // Acesso de suporte do provedor vem sem refresh: a sessao expira sozinha.
  if (refresh) localStorage.setItem('pm_refresh', refresh);
  else localStorage.removeItem('pm_refresh');
  localStorage.setItem('pm_user', JSON.stringify(usuario));
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
