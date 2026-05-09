// utils/api.js — Cliente HTTP centralizado
const BASE = '/api';

function getToken() { return localStorage.getItem('pm_token') || ''; }
function setTokens(access, refresh) {
  localStorage.setItem('pm_token', access);
  if (refresh) localStorage.setItem('pm_refresh', refresh);
}
function clearTokens() {
  localStorage.removeItem('pm_token');
  localStorage.removeItem('pm_refresh');
  localStorage.removeItem('pm_user');
}

async function request(method, path, body, isFormData = false) {
  const headers = {};
  if (!isFormData) headers['Content-Type'] = 'application/json';
  if (getToken())  headers['Authorization'] = 'Bearer ' + getToken();

  const opts = { method, headers };
  if (body) opts.body = isFormData ? body : JSON.stringify(body);

  let res = await fetch(BASE + path, opts);

  // Tenta refresh se 401
  if (res.status === 401) {
    const refresh = localStorage.getItem('pm_refresh');
    if (refresh) {
      const rRes = await fetch(BASE + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (rRes.ok) {
        const { token, refreshToken: newRefresh } = await rRes.json();
        setTokens(token, newRefresh);
        headers['Authorization'] = 'Bearer ' + token;
        res = await fetch(BASE + path, { ...opts, headers });
      } else {
        clearTokens();
        window.location.href = '/login';
        return;
      }
    }
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || `Erro ${res.status}`);
  return data;
}

const api = {
  // Auth
  login:          (login, senha)     => request('POST', '/auth/login',          { login, senha }),
  verifyOtp:      (userId, otp)      => request('POST', '/auth/verify-otp',     { userId, otp }),
  refresh:        (refreshToken)     => request('POST', '/auth/refresh',         { refreshToken }),
  logout:         (refreshToken)     => request('POST', '/auth/logout',          { refreshToken }),
  me:             ()                 => request('GET',  '/auth/me'),
  updateProfile:  (perfil)           => request('PATCH','/auth/profile', perfil),
  toggle2fa:      ()                 => request('PATCH','/auth/toggle-2fa'),
  changePassword: (senhaAtual, novaSenha) => request('PATCH','/auth/change-password',{senhaAtual,novaSenha}),

  // Registro de morador (multipart)
  register: (formData) => request('POST', '/auth/register', formData, true),

  // Dashboard
  dashboard: () => request('GET', '/dashboard'),

  // Tarefas
  tarefas:      (params={})   => request('GET',    '/tarefas?' + new URLSearchParams(params)),
  criarTarefa:  (t)           => request('POST',   '/tarefas', t),
  editarTarefa: (id, t)       => request('PUT',    `/tarefas/${id}`, t),
  patchStatus:  (id, status)  => request('PATCH',  `/tarefas/${id}/status`, { status }),
  deletarTarefa:(id)          => request('DELETE', `/tarefas/${id}`),
  historico:    (id)          => request('GET',    `/tarefas/${id}/historico`),

  // Ciclo
  ciclo:       ()      => request('GET', '/ciclo'),
  criarCiclo:  (c)     => request('POST', '/ciclo', c),
  editarCiclo: (id, c) => request('PUT', `/ciclo/${id}`, c),
  deletarCiclo:(id)    => request('DELETE', `/ciclo/${id}`),

  // Quadras e ruas
  quadras:       ()            => request('GET',    '/quadras'),
  criarQuadra:   (q)           => request('POST',   '/quadras', q),
  editarQuadra:  (id, q)       => request('PUT',    `/quadras/${id}`, q),
  deletarQuadra: (id)          => request('DELETE', `/quadras/${id}`),
  criarRua:      (quadraId, r) => request('POST',   `/quadras/${quadraId}/ruas`, r),
  editarRua:     (id, r)       => request('PUT',    `/ruas/${id}`, r),
  deletarRua:    (id)          => request('DELETE', `/ruas/${id}`),

  // Cadastros operacionais
  equipes:       ()      => request('GET',    '/equipes'),
  criarEquipe:   (e)     => request('POST',   '/equipes', e),
  editarEquipe:  (id,e)  => request('PUT',    `/equipes/${id}`, e),
  deletarEquipe: (id)    => request('DELETE', `/equipes/${id}`),
  locais:        ()      => request('GET',    '/locais'),
  criarLocal:    (l)     => request('POST',   '/locais', l),
  editarLocal:   (id,l)  => request('PUT',    `/locais/${id}`, l),
  deletarLocal:  (id)    => request('DELETE', `/locais/${id}`),
  modelosTarefas:       ()      => request('GET',    '/modelos-tarefas'),
  criarModeloTarefa:    (m)     => request('POST',   '/modelos-tarefas', m),
  editarModeloTarefa:   (id,m)  => request('PUT',    `/modelos-tarefas/${id}`, m),
  deletarModeloTarefa:  (id)    => request('DELETE', `/modelos-tarefas/${id}`),

  // Comprovações
  listarFotos:  (tid)         => request('GET',    `/comprovacoes/${tid}`),
  deletarFoto:  (id)          => request('DELETE', `/comprovacoes/foto/${id}`),
  uploadFotos: async (tarefaId, files, obs) => {
    const fd = new FormData();
    files.forEach(f => fd.append('arquivo', f));
    if (obs) fd.append('observacao', obs);
    return request('POST', `/comprovacoes/${tarefaId}`, fd, true);
  },

  // Usuários
  usuarios:       (params={}) => request('GET',    '/usuarios?' + new URLSearchParams(params)),
  pendentes:      ()          => request('GET',    '/usuarios/pendentes'),
  criarUsuario:   (u)         => request('POST',   '/usuarios', u),
  editarUsuario:  (id, u)     => request('PUT',    `/usuarios/${id}`, u),
  aprovar:        (id)        => request('PATCH',  `/usuarios/${id}/aprovar`),
  rejeitar:       (id, motivo)=> request('PATCH',  `/usuarios/${id}/rejeitar`, { motivo }),
  alterarStatus:  (id, status)=> request('PATCH',  `/usuarios/${id}/status`, { status }),
  resetSenha:     (id)        => request('PATCH',  `/usuarios/${id}/reset-senha`),
  auditoria:      (id)        => request('GET',    `/usuarios/${id}/auditoria`),
  auditoriaGeral: (params={}) => request('GET',    '/usuarios/auditoria/geral?' + new URLSearchParams(params)),

  // Observações
  criarObs: (o)  => request('POST', '/observacoes', o),
  listarObs: ()  => request('GET',  '/observacoes'),

  setTokens, clearTokens, getToken,
};

export default api;
