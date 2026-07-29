// FIX: todos os imports no topo do arquivo
import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';

// Pages
import Login      from './pages/Login';
import Register   from './pages/Register';
import TaskList   from './pages/TaskList';
import Aprovacoes from './pages/Aprovacoes';
import Dashboard  from './pages/Dashboard';
import Kanban     from './pages/Kanban';
import Ciclo      from './pages/Ciclo';
import Morador    from './pages/Morador';
import Auditoria  from './pages/Auditoria';
import QuadrasRuas from './pages/QuadrasRuas';
import Observacoes from './pages/Observacoes';
import Cadastros from './pages/Cadastros';
import Perfil from './pages/Perfil';
import Agendamento from './pages/Agendamento';

// Portal do provedor (superadmin)
import ProvedorDashboard from './pages/provedor/Dashboard';
import ProvedorCondominios from './pages/provedor/Condominios';
import ProvedorCondominioDetalhe from './pages/provedor/CondominioDetalhe';
import ProvedorPlanos from './pages/provedor/Planos';
import ProvedorFaturas from './pages/provedor/Faturas';

// Components
import Layout from './components/Layout';
import { Spinner, StatusBadge, ConfirmDialog } from './components/UI';
import { useToast } from './hooks/useToast';
import api from './utils/api';
import { ROLES, getHomePath } from './utils/auth';

// ── Guards ────────────────────────────────────────────────────
function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <div id="loading"><div className="spinner"/></div>;
  if (!user)   return <Navigate to="/login" replace/>;
  // O superadmin em suporte a um condomínio passa por qualquer exigência de perfil.
  if (roles && !roles.includes(user.perfil) && user.perfil !== 'superadmin') {
    return <Navigate to={getHomePath(user.perfil, user)} replace/>;
  }
  return children;
}

/** Rotas do portal comercial: só o provedor, e só fora de um condomínio. */
function ProvedorRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div id="loading"><div className="spinner"/></div>;
  if (!user) return <Navigate to="/login" replace/>;
  if (user.perfil !== 'superadmin') return <Navigate to={getHomePath(user.perfil, user)} replace/>;
  // Sessão de suporte dentro de um condomínio não abre o painel comercial.
  if (user.condominio) return <Navigate to="/app" replace/>;
  return children;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div id="loading"><div className="spinner"/></div>;
  if (user)    return <Navigate to={getHomePath(user.perfil, user)} replace/>;
  return children;
}

// ── Usuários Admin Page ───────────────────────────────────────
function UsuariosAdmin() {
  const toast    = useToast();
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [busca,    setBusca]    = useState('');
  const [confirm,  setConfirm]  = useState(null);
  const [showNew,  setShowNew]  = useState(false);
  const [form,     setForm]     = useState({
    login:'', nome:'', email:'', senha:'', perfil:'campo', telefone:''
  });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { usuarios } = await api.usuarios();
      setUsuarios(usuarios);
    } catch(e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }

  const rows = busca
    ? usuarios.filter(u => (u.nome + u.email + u.login).toLowerCase().includes(busca.toLowerCase()))
    : usuarios;

  async function criarUsuario(e) {
    e.preventDefault();
    try {
      await api.criarUsuario(form);
      toast('Usuário criado!', 'success');
      setShowNew(false);
      setForm({ login:'', nome:'', email:'', senha:'', perfil:'campo', telefone:'' });
      load();
    } catch(e) { toast(e.message, 'error'); }
  }

  async function alterarStatus(id, status) {
    try {
      await api.alterarStatus(id, status);
      toast(`Usuário ${status}.`, 'info');
      load();
    } catch(e) { toast(e.message, 'error'); }
  }

  async function resetSenha(id) {
    try {
      const { senha_temp } = await api.resetSenha(id);
      toast(`Nova senha temporária: ${senha_temp}`, 'info');
    } catch(e) { toast(e.message, 'error'); }
  }

  return (
    <Layout title="Usuários">
      <div className="filter-row" style={{marginBottom:'16px'}}>
        <input className="filter-select" type="text" placeholder="🔍 Buscar por nome, e-mail ou login…"
          value={busca} onChange={e => setBusca(e.target.value)} style={{minWidth:'200px'}}/>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>+ Novo usuário</button>
      </div>

      {loading ? <Spinner/> : (
        <div className="task-list">
          {rows.map(u => {
            const role = ROLES[u.perfil] || ROLES.morador;
            return (
              <div key={u.id} className="task-card">
                <div className="task-card-top">
                  <div className="task-card-title">{u.nome}</div>
                  <span style={{background:role.color+'22',color:role.color,padding:'3px 10px',
                    borderRadius:'20px',fontSize:'11px',fontWeight:600}}>
                    {role.emoji} {role.label}
                  </span>
                </div>
                <div className="task-card-meta">
                  <span className="stag" style={{color:'var(--blu)'}}>{u.login}</span>
                  <span className="muted-sm">{u.email}</span>
                  {u.unidade && <span className="muted-sm">🏠 {u.unidade}</span>}
                  <span className="badge" style={{
                    background: u.status==='aprovado'?'rgba(63,185,80,.12)':'rgba(248,81,73,.12)',
                    color: u.status==='aprovado'?'var(--grn)':'var(--red)',
                    border: `1px solid ${u.status==='aprovado'?'rgba(63,185,80,.3)':'rgba(248,81,73,.3)'}`,
                  }}>
                    {u.status === 'aprovado' ? '● Ativo' : `⊘ ${u.status}`}
                  </span>
                </div>
                {u.ultimo_login && (
                  <div className="muted-sm" style={{marginTop:'4px'}}>
                    Último acesso: {new Date(u.ultimo_login).toLocaleString('pt-BR')}
                  </div>
                )}
                <div className="task-actions">
                  {u.id !== user?.id && (
                    u.status === 'suspenso'
                      ? <button className="btn btn-success btn-sm" onClick={() => alterarStatus(u.id,'aprovado')}>↩ Reativar</button>
                      : <button className="btn btn-warning btn-sm" onClick={() => setConfirm({id:u.id, nome:u.nome})}>⊘ Suspender</button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => resetSenha(u.id)}>🔑 Reset senha</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal novo usuário */}
      {showNew && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',zIndex:200,
          display:'flex',alignItems:'flex-end',justifyContent:'center'}}
          onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background:'var(--s)',borderRadius:'20px 20px 0 0',
            width:'100%',maxWidth:'500px',padding:'20px',
            paddingBottom:'calc(20px + env(safe-area-inset-bottom))',
          }}>
            <div style={{width:'36px',height:'4px',background:'var(--bd)',borderRadius:'2px',margin:'0 auto 14px'}}/>
            <h3 style={{fontFamily:'Syne,sans-serif',marginBottom:'14px'}}>Novo Usuário Interno</h3>
            <form onSubmit={criarUsuario}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                {[['login','Login *'],['nome','Nome completo *'],['email','E-mail *'],['telefone','Telefone']].map(([k,l]) => (
                  <div key={k} className="form-group">
                    <label className="form-label">{l}</label>
                    <input className="form-control" value={form[k]}
                      onChange={e => setForm(p => ({...p,[k]:e.target.value}))}
                      required={l.includes('*')}/>
                  </div>
                ))}
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <div className="form-group">
                  <label className="form-label">Senha *</label>
                  <input className="form-control" type="password" value={form.senha}
                    onChange={e => setForm(p => ({...p, senha: e.target.value}))} required/>
                </div>
                <div className="form-group">
                  <label className="form-label">Perfil</label>
                  <select className="form-control" value={form.perfil}
                    onChange={e => setForm(p => ({...p, perfil: e.target.value}))}>
                    {['admin','supervisor','sindico','subsindico','conselho','campo'].map(p => (
                      <option key={p} value={p}>{ROLES[p]?.emoji} {ROLES[p]?.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{display:'flex',gap:'10px',marginTop:'10px'}}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{flex:1}}>Criar usuário</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!confirm} danger
        title="Suspender usuário?"
        message={`Suspender "${confirm?.nome}"? Todas as sessões ativas serão encerradas.`}
        onConfirm={() => { alterarStatus(confirm.id, 'suspenso'); setConfirm(null); }}
        onCancel={() => setConfirm(null)}/>
    </Layout>
  );
}

// ── Router ────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <Routes>
      <Route path="/login"    element={<PublicRoute><Login/></PublicRoute>}/>
      <Route path="/register" element={<PublicRoute><Register/></PublicRoute>}/>
      <Route path="/"         element={<Navigate to="/login" replace/>}/>

      {/* Portal do provedor — admin.<dominio> */}
      <Route path="/provedor"                   element={<ProvedorRoute><ProvedorDashboard/></ProvedorRoute>}/>
      <Route path="/provedor/condominios"       element={<ProvedorRoute><ProvedorCondominios/></ProvedorRoute>}/>
      <Route path="/provedor/condominios/:id"   element={<ProvedorRoute><ProvedorCondominioDetalhe/></ProvedorRoute>}/>
      <Route path="/provedor/planos"            element={<ProvedorRoute><ProvedorPlanos/></ProvedorRoute>}/>
      <Route path="/provedor/faturas"           element={<ProvedorRoute><ProvedorFaturas/></ProvedorRoute>}/>

      <Route path="/app" element={
        <PrivateRoute roles={['admin','supervisor','sindico','subsindico','conselho','campo']}>
          <Dashboard/>
        </PrivateRoute>
      }/>
      <Route path="/app/diario"     element={<PrivateRoute><TaskList ciclo="diario"/></PrivateRoute>}/>
      <Route path="/app/semanal"    element={<PrivateRoute><TaskList ciclo="semanal"/></PrivateRoute>}/>
      <Route path="/app/mensal"     element={<PrivateRoute><TaskList ciclo="mensal"/></PrivateRoute>}/>
      <Route path="/app/anual"      element={<PrivateRoute><TaskList ciclo="anual"/></PrivateRoute>}/>
      <Route path="/app/ciclo"      element={<PrivateRoute><Ciclo/></PrivateRoute>}/>
      <Route path="/app/agendamento" element={<PrivateRoute roles={['admin','supervisor','sindico']}><Agendamento/></PrivateRoute>}/>
      <Route path="/app/kanban"     element={<PrivateRoute><Kanban/></PrivateRoute>}/>
      <Route path="/app/morador"    element={<PrivateRoute roles={['morador']}><Morador/></PrivateRoute>}/>
      <Route path="/app/perfil"     element={<PrivateRoute><Perfil/></PrivateRoute>}/>
      <Route path="/app/aprovacoes" element={<PrivateRoute roles={['admin','supervisor','sindico','conselho']}><Aprovacoes/></PrivateRoute>}/>
      <Route path="/app/auditoria"  element={<PrivateRoute roles={['admin','supervisor','sindico']}><Auditoria/></PrivateRoute>}/>
      <Route path="/app/usuarios"   element={<PrivateRoute roles={['admin','supervisor','sindico']}><UsuariosAdmin/></PrivateRoute>}/>
      <Route path="/app/quadras"    element={<PrivateRoute roles={['admin','supervisor','sindico']}><QuadrasRuas/></PrivateRoute>}/>
      <Route path="/app/observacoes" element={<PrivateRoute roles={['admin','supervisor','sindico','subsindico','conselho']}><Observacoes/></PrivateRoute>}/>
      <Route path="/app/cadastros"  element={<PrivateRoute roles={['admin','supervisor','sindico']}><Cadastros/></PrivateRoute>}/>

      <Route path="*" element={<RedirecionaParaHome/>}/>
    </Routes>
  );
}

/** Rota desconhecida: leva cada perfil para a sua casa (provedor ou condomínio). */
function RedirecionaParaHome() {
  const { user, loading } = useAuth();
  if (loading) return <div id="loading"><div className="spinner"/></div>;
  if (!user) return <Navigate to="/login" replace/>;
  return <Navigate to={getHomePath(user.perfil, user)} replace/>;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes/>
      </ToastProvider>
    </AuthProvider>
  );
}
