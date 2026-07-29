// utils/tenant.js — identificacao do condominio pelo subdominio.
//
// Producao: jardins.seudominio.com.br  -> slug "jardins"
//           admin.seudominio.com.br    -> portal do provedor
// Dev:      jardins.localhost:5173     -> slug "jardins"
//           admin.localhost:5173       -> portal do provedor
//           localhost:5173             -> cai no slug padrao do backend

const SUBDOMINIOS_PROVEDOR = new Set(['admin', 'painel']);
const RESERVADOS = new Set(['www', 'api', 'app', 'portal', 'cdn', 'static']);

function rotulos() {
  const host = window.location.hostname.toLowerCase();
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return [];
  return host.split('.');
}

/** Slug do condominio atual, ou null quando estamos no portal do provedor. */
export function getTenantSlug() {
  const partes = rotulos();
  if (partes.length < 2) return null;            // localhost puro
  const primeiro = partes[0];
  if (SUBDOMINIOS_PROVEDOR.has(primeiro)) return null;
  if (RESERVADOS.has(primeiro)) return null;
  return primeiro;
}

export function ehPortalProvedor() {
  const partes = rotulos();
  if (!partes.length) return false;
  if (partes.length < 2) return false;
  return SUBDOMINIOS_PROVEDOR.has(partes[0]);
}

/** Dominio base da aplicacao — usado para montar links entre condominios. */
export function getDominioBase() {
  const partes = rotulos();
  if (partes.length <= 1) return window.location.host;
  const porta = window.location.port ? `:${window.location.port}` : '';
  return partes.slice(1).join('.') + porta;
}

export function urlDoCondominio(slug) {
  return `${window.location.protocol}//${slug}.${getDominioBase()}`;
}

export function urlDoProvedor() {
  return `${window.location.protocol}//admin.${getDominioBase()}`;
}
