// components/Layout.jsx — Shell principal da aplicação
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { getRoleInfo } from '../utils/auth';

const PAGES = [
  { id:'dashboard', path:'/app',           icon:'📊', label:'Dashboard',         roles:['admin','supervisor','sindico','subsindico','conselho','campo'] },
  { id:'diario',    path:'/app/diario',    icon:'📅', label:'Diário',            roles:['admin','supervisor','sindico','subsindico','conselho','campo'], badge:true },
  { id:'semanal',   path:'/app/semanal',   icon:'📆', label:'Semanal',           roles:['admin','supervisor','sindico','subsindico','conselho','campo'], badge:true },
  { id:'mensal',    path:'/app/mensal',    icon:'🗓️', label:'Mensal',            roles:['admin','supervisor','sindico','subsindico','conselho','campo'], badge:true },
  { id:'anual',     path:'/app/anual',     icon:'📋', label:'Anual',             roles:['admin','supervisor','sindico','subsindico','conselho','campo'], badge:true },
  { id:'ciclo',     path:'/app/ciclo',     icon:'🔄', label:'Ciclo 8 Dias',      roles:['admin','supervisor','sindico','subsindico','conselho','campo'] },
  { id:'kanban',    path:'/app/kanban',    icon:'🗂️', label:'Kanban',            roles:['admin','supervisor','sindico','subsindico','conselho','campo'] },
  { id:'aprovacoes',path:'/app/aprovacoes',icon:'✅', label:'Aprovações',        roles:['admin','sindico'], badge:true },
  { id:'auditoria', path:'/app/auditoria', icon:'🔍', label:'Auditoria',         roles:['admin'] },
  { id:'usuarios',  path:'/app/usuarios',  icon:'👤', label:'Usuários',          roles:['admin'] },
  { id:'morador',   path:'/app/morador',   icon:'🏠', label:'Status do Dia',     roles:['morador'] },
  { id:'quadras',   path:'/app/quadras',   icon:'Q', label:'Quadras/Ruas',       roles:['admin','supervisor'] },
  { id:'observacoes',path:'/app/observacoes',icon:'!', label:'Observacoes',      roles:['admin','supervisor','sindico','subsindico','conselho'] },
  { id:'cadastros', path:'/app/cadastros', icon:'+', label:'Cadastros',          roles:['admin','supervisor'] },
];

const BOTTOM_NAV = {
  default: ['dashboard','diario','semanal','kanban'],
  morador: ['morador'],
};

export default function Layout({ children, title, badges={} }) {
  const { user, logout } = useAuth();
  const toast    = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebar] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const perfil = user?.perfil || 'morador';
  const role   = getRoleInfo(perfil);
  const pages  = PAGES.filter(p => p.roles.includes(perfil));
  const bnIds  = perfil === 'morador' ? BOTTOM_NAV.morador : BOTTOM_NAV.default;
  const bnPages = pages.filter(p => bnIds.includes(p.id));

  // Fecha sidebar ao navegar (mobile)
  useEffect(() => { setSidebar(false); }, [location.pathname]);

  // Swipe para abrir/fechar sidebar
  useEffect(() => {
    const onStart = e => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };
    const onEnd = e => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
      if (dy > 60) return;
      if (dx > 55 && touchStartX.current < 30 && !sidebarOpen) setSidebar(true);
      if (dx < -55 && sidebarOpen)                               setSidebar(false);
    };
    document.addEventListener('touchstart', onStart, { passive:true });
    document.addEventListener('touchend',   onEnd,   { passive:true });
    return () => { document.removeEventListener('touchstart',onStart); document.removeEventListener('touchend',onEnd); };
  }, [sidebarOpen]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const isActive = (path) => {
    if (path === '/app') return location.pathname === '/app';
    return location.pathname.startsWith(path);
  };

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>

      {/* OVERLAY */}
      {sidebarOpen && (
        <div onClick={() => setSidebar(false)} style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,.65)',
          zIndex:49, backdropFilter:'blur(2px)',
        }}/>
      )}

      {/* SIDEBAR */}
      <aside className={`sidebar${sidebarOpen?' open':''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo-icon">🏘️</div>
          <div>
            <div className="sidebar-title">Manutenção</div>
            <div className="sidebar-sub">Condomínio</div>
          </div>
          <button className="sidebar-close" onClick={() => setSidebar(false)}>✕</button>
        </div>

        <div className="user-card">
          <div className="user-avatar" style={{ background:role.color+'22', color:role.color }}>
            {role.emoji}
          </div>
          <div>
            <div className="user-name">{user?.nome}</div>
            <div className="user-role">{role.label}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {/* Seções do nav */}
          {renderNavSections(pages, badges, navigate, isActive)}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>⬅ Sair</button>
          <div className="login-date">
            Último acesso: {user?.ultimo_login ? new Date(user.ultimo_login).toLocaleDateString('pt-BR') : 'Agora'}
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="hamburger" onClick={() => setSidebar(true)}>
              <span/><span/><span/>
            </button>
            <div className="topbar-title">{title || 'Portal'}</div>
          </div>
          <div className="topbar-right">
            {/* Notificação de aprovações pendentes */}
            {(badges.aprovacoes > 0) && ['admin','sindico'].includes(perfil) && (
              <button onClick={() => navigate('/app/aprovacoes')} style={{
                position:'relative', background:'var(--red)', border:'none',
                color:'#fff', borderRadius:'8px', padding:'6px 10px', fontSize:'13px', cursor:'pointer',
              }}>
                ✅ <span style={{ fontWeight:700 }}>{badges.aprovacoes}</span> pendente(s)
              </button>
            )}
          </div>
        </header>

        <div className="content">
          {children}
        </div>
      </div>

      {/* BOTTOM NAV */}
      <nav className="bottom-nav">
        {bnPages.map(p => (
          <button key={p.id} className={`bn-item${isActive(p.path)?' active':''}`}
            onClick={() => navigate(p.path)}>
            <span className="bn-icon">{p.icon}</span>
            {p.label.split(' ')[0]}
          </button>
        ))}
        <button className={`bn-item${sidebarOpen?' active':''}`} onClick={() => setSidebar(!sidebarOpen)}>
          <span className="bn-icon">☰</span>Menu
        </button>
      </nav>

    </div>
  );
}

// Agrupa páginas em seções para o sidebar
function renderNavSections(pages, badges, navigate, isActive) {
  const sections = [
    { label:'Visão Geral',   ids:['dashboard'] },
    { label:'Manutenção',    ids:['diario','semanal','mensal','anual','ciclo'] },
    { label:'Ferramentas',   ids:['kanban'] },
    { label:'Gestão',        ids:['aprovacoes','usuarios','quadras','cadastros','observacoes','auditoria'] },
    { label:'Minha Área',    ids:['morador'] },
  ];

  return sections.map(sec => {
    const items = pages.filter(p => sec.ids.includes(p.id));
    if (!items.length) return null;
    return (
      <div key={sec.label}>
        <div className="nav-section">{sec.label}</div>
        {items.map(p => (
          <button key={p.id}
            className={`nav-item${isActive(p.path)?' active':''}`}
            onClick={() => navigate(p.path)}>
            <span className="ni">{p.icon}</span>
            {p.label}
            {p.badge && badges[p.id] > 0 && (
              <span className="nav-badge">{badges[p.id]}</span>
            )}
          </button>
        ))}
      </div>
    );
  });
}
