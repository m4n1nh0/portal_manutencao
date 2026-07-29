// components/Layout.jsx - Shell principal da aplicacao
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getRoleInfo } from '../utils/auth';
import { urlDoProvedor } from '../utils/tenant';
import ThemeToggle from './ThemeToggle';

const PAGES = [
  { id:'dashboard', path:'/app',             icon:'DB', label:'Dashboard',    roles:['admin','supervisor','sindico','subsindico','conselho','campo'] },
  { id:'diario',    path:'/app/diario',      icon:'DI', label:'Diario',       roles:['admin','supervisor','sindico','subsindico','conselho','campo'], badge:true },
  { id:'semanal',   path:'/app/semanal',     icon:'SE', label:'Semanal',      roles:['admin','supervisor','sindico','subsindico','conselho','campo'], badge:true },
  { id:'mensal',    path:'/app/mensal',      icon:'ME', label:'Mensal',       roles:['admin','supervisor','sindico','subsindico','conselho','campo'], badge:true },
  { id:'anual',     path:'/app/anual',       icon:'AN', label:'Anual',        roles:['admin','supervisor','sindico','subsindico','conselho','campo'], badge:true },
  { id:'ciclo',     path:'/app/ciclo',       icon:'CI', label:'Ciclo',        roles:['admin','supervisor','sindico','subsindico','conselho','campo'] },
  { id:'agendamento',path:'/app/agendamento',icon:'AG', label:'Agenda',       roles:['admin','supervisor','sindico'] },
  { id:'kanban',    path:'/app/kanban',      icon:'KB', label:'Kanban',       roles:['admin','supervisor','sindico','subsindico','conselho','campo'] },
  { id:'aprovacoes',path:'/app/aprovacoes',  icon:'AP', label:'Aprovacoes',   roles:['admin','supervisor','sindico','conselho'], badge:true },
  { id:'auditoria', path:'/app/auditoria',   icon:'AU', label:'Auditoria',    roles:['admin','supervisor','sindico'] },
  { id:'usuarios',  path:'/app/usuarios',    icon:'US', label:'Usuarios',     roles:['admin','supervisor','sindico'] },
  { id:'morador',   path:'/app/morador',     icon:'HO', label:'Status do Dia',roles:['morador'] },
  { id:'perfil',    path:'/app/perfil',      icon:'PF', label:'Minha Conta',  roles:['admin','supervisor','sindico','subsindico','conselho','campo','morador'] },
  { id:'quadras',   path:'/app/quadras',     icon:'QR', label:'Quadras/Ruas', roles:['admin','supervisor','sindico'] },
  { id:'observacoes',path:'/app/observacoes',icon:'OB', label:'Observacoes',  roles:['admin','supervisor','sindico','subsindico','conselho'] },
  { id:'cadastros', path:'/app/cadastros',   icon:'CA', label:'Cadastros',    roles:['admin','supervisor','sindico'] },
];

const BOTTOM_NAV = {
  default: ['dashboard','diario','agendamento','perfil'],
  morador: ['morador','perfil'],
};

export default function Layout({ children, title, badges={} }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebar] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const perfil = user?.perfil || 'morador';
  const role = getRoleInfo(perfil);
  // O provedor, quando entra num condomínio para dar suporte, enxerga tudo
  // menos a área exclusiva de morador.
  const pages = PAGES.filter(p => perfil === 'superadmin' ? p.id !== 'morador' : p.roles.includes(perfil));
  const condominio = user?.condominio || null;
  const contrato = user?.contrato || null;
  const bnIds = perfil === 'morador' ? BOTTOM_NAV.morador : BOTTOM_NAV.default;
  const bnPages = pages.filter(p => bnIds.includes(p.id));
  const roleVars = {
    '--role-accent': role.color,
    '--role-rgb': role.rgb,
    '--role-surface': role.surface,
    '--role-ink': role.ink,
  };

  useEffect(() => { setSidebar(false); }, [location.pathname]);

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
      if (dx < -55 && sidebarOpen) setSidebar(false);
    };
    document.addEventListener('touchstart', onStart, { passive:true });
    document.addEventListener('touchend', onEnd, { passive:true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
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
    <div className="app-shell" data-role={perfil} style={roleVars}>
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebar(false)} />}

      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo-icon">PM</div>
          <div className="brand-copy">
            <div className="sidebar-title">{condominio?.nome || 'Portal Manutencao'}</div>
            <div className="sidebar-sub">{condominio ? 'Portal de Manutencao' : 'Operacao condominial'}</div>
          </div>
          <button className="sidebar-close" onClick={() => setSidebar(false)} aria-label="Fechar menu">x</button>
        </div>

        <div className="user-card">
          <div className="user-avatar">{role.emoji}</div>
          <div className="user-copy">
            <div className="user-name">{user?.nome || 'Usuario'}</div>
            <div className="user-role">{role.label} - {role.signature}</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {renderNavSections(pages, badges, navigate, isActive)}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>Sair</button>
          <div className="login-date">
            Ultimo acesso: {user?.ultimo_login ? new Date(user.ultimo_login).toLocaleDateString('pt-BR') : 'Agora'}
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="hamburger" onClick={() => setSidebar(true)} aria-label="Abrir menu">
              <span/><span/><span/>
            </button>
            <div>
              <div className="topbar-title">{title || 'Portal'}</div>
              <div className="topbar-context">{role.short}</div>
            </div>
          </div>
          <div className="topbar-right">
            {(badges.aprovacoes > 0) && user?.permissoes?.canApprove && (
              <button className="approval-alert" onClick={() => navigate('/app/aprovacoes')}>
                <span>{badges.aprovacoes}</span>
                pendente(s)
              </button>
            )}
            <ThemeToggle />
            <button type="button" className="role-pill" onClick={() => navigate('/app/perfil')} aria-label="Abrir minha conta">
              <span className="role-pill-mark">{role.emoji}</span>
              <span className="role-pill-text">{role.label}</span>
            </button>
          </div>
        </header>

        <main className="content">
          <ContractBanner perfil={perfil} contrato={contrato} condominio={condominio}/>
          {children}
        </main>
      </div>

      <nav className="bottom-nav">
        {bnPages.map(p => (
          <button
            key={p.id}
            className={`bn-item${isActive(p.path) ? ' active' : ''}`}
            onClick={() => navigate(p.path)}
          >
            <span className="bn-icon">{p.icon}</span>
            <span className="bn-label">{p.label.split(' ')[0]}</span>
          </button>
        ))}
        <button className={`bn-item${sidebarOpen ? ' active' : ''}`} onClick={() => setSidebar(!sidebarOpen)}>
          <span className="bn-icon">MN</span>
          <span className="bn-label">Menu</span>
        </button>
      </nav>
    </div>
  );
}

/**
 * Faixa de aviso no topo do conteudo:
 *  - suporte do provedor dentro do condominio do cliente
 *  - periodo de avaliacao acabando
 *  - portal em modo somente leitura por inadimplencia
 */
function ContractBanner({ perfil, contrato, condominio }) {
  const avisos = [];

  if (perfil === 'superadmin' && condominio) {
    avisos.push({
      tom: 'suporte',
      cor: '#0f766e',
      texto: `Acesso de suporte ao condomínio ${condominio.nome}. Tudo o que você fizer aqui fica registrado na auditoria.`,
      acao: { label: 'Voltar ao portal do provedor', href: urlDoProvedor() },
    });
  }

  if (contrato?.estado === 'trial' && contrato.diasRestantes != null) {
    avisos.push({
      tom: 'trial',
      cor: '#b45309',
      texto: contrato.diasRestantes >= 0
        ? `Período de avaliação: ${contrato.diasRestantes} dia(s) restante(s).`
        : 'Período de avaliação encerrado.',
    });
  }

  if (contrato?.somenteLeitura) {
    avisos.push({ tom: 'bloqueio', cor: '#b91c1c', texto: contrato.mensagem });
  }

  if (!avisos.length) return null;

  return (
    <div style={{ display:'grid', gap:'8px', marginBottom:'16px' }}>
      {avisos.map((aviso) => (
        <div key={aviso.tom} style={{
          display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap',
          padding:'10px 14px', borderRadius:'10px', fontSize:'13px', fontWeight:500,
          color:aviso.cor, background:`${aviso.cor}14`, border:`1px solid ${aviso.cor}44`,
        }}>
          <span style={{flex:1,minWidth:'200px'}}>{aviso.texto}</span>
          {aviso.acao && (
            <a href={aviso.acao.href} style={{color:aviso.cor,fontWeight:600,textDecoration:'underline'}}>
              {aviso.acao.label}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function renderNavSections(pages, badges, navigate, isActive) {
  const sections = [
    { label:'Visao Geral', ids:['dashboard'] },
    { label:'Manutencao', ids:['diario','semanal','mensal','anual','ciclo','agendamento'] },
    { label:'Ferramentas', ids:['kanban'] },
    { label:'Gestao', ids:['aprovacoes','usuarios','quadras','cadastros','observacoes','auditoria'] },
    { label:'Minha Area', ids:['morador','perfil'] },
  ];

  return sections.map(sec => {
    const items = pages.filter(p => sec.ids.includes(p.id));
    if (!items.length) return null;
    return (
      <div key={sec.label} className="nav-group">
        <div className="nav-section">{sec.label}</div>
        {items.map(p => (
          <button
            key={p.id}
            className={`nav-item${isActive(p.path) ? ' active' : ''}`}
            onClick={() => navigate(p.path)}
          >
            <span className="ni">{p.icon}</span>
            <span className="nav-label">{p.label}</span>
            {p.badge && badges[p.id] > 0 && (
              <span className="nav-badge">{badges[p.id]}</span>
            )}
          </button>
        ))}
      </div>
    );
  });
}
