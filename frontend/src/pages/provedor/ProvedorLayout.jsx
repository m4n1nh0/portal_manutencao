// Shell do portal do provedor — o painel comercial de quem vende o sistema.
// Separado do Layout do condominio de proposito: publico, vocabulario e
// navegacao sao outros.
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import ThemeToggle from '../../components/ThemeToggle';

const MENU = [
  { path: '/provedor',           icon: 'VG', label: 'Visão geral' },
  { path: '/provedor/condominios', icon: 'CD', label: 'Condomínios' },
  { path: '/provedor/planos',    icon: 'PL', label: 'Planos' },
  { path: '/provedor/faturas',   icon: 'FT', label: 'Faturas' },
];

export default function ProvedorLayout({ title, subtitle, actions, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const ativo = (path) => path === '/provedor'
    ? location.pathname === '/provedor'
    : location.pathname.startsWith(path);

  async function sair() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-shell" data-role="superadmin" style={{
      '--role-accent': '#0f766e', '--role-rgb': '15 118 110',
      '--role-surface': '#dcfaf5', '--role-ink': '#032420',
    }}>
      <aside className="sidebar open" style={{ position:'sticky', top:0 }}>
        <div className="sidebar-header">
          <div className="sidebar-logo-icon">PR</div>
          <div className="brand-copy">
            <div className="sidebar-title">Portal do Provedor</div>
            <div className="sidebar-sub">Gestão comercial</div>
          </div>
        </div>

        <div className="user-card">
          <div className="user-avatar">PR</div>
          <div className="user-copy">
            <div className="user-name">{user?.nome || 'Provedor'}</div>
            <div className="user-role">Provedor - Gestao do SaaS</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group">
            <div className="nav-section">Comercial</div>
            {MENU.map((item) => (
              <button key={item.path}
                className={`nav-item${ativo(item.path) ? ' active' : ''}`}
                onClick={() => navigate(item.path)}>
                <span className="ni">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={sair}>Sair</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-left">
            <div>
              <div className="topbar-title">{title}</div>
              <div className="topbar-context">{subtitle || 'Provedor'}</div>
            </div>
          </div>
          <div className="topbar-right">
            {actions}
            <ThemeToggle />
          </div>
        </header>

        <main className="content">{children}</main>
      </div>
    </div>
  );
}

/** Cartao de indicador reutilizado nas telas do provedor. */
export function Indicador({ rotulo, valor, detalhe, cor = 'var(--tx)' }) {
  return (
    <div style={{
      background:'var(--s)', border:'1px solid var(--bd)', borderRadius:'12px',
      padding:'14px 16px', minWidth:'150px', flex:'1 1 150px',
    }}>
      <div style={{fontSize:'12px',color:'var(--mu)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.4px'}}>{rotulo}</div>
      <div style={{fontSize:'24px',fontWeight:700,fontFamily:'Syne,sans-serif',color:cor,marginTop:'4px'}}>{valor}</div>
      {detalhe && <div style={{fontSize:'12px',color:'var(--mu)',marginTop:'2px'}}>{detalhe}</div>}
    </div>
  );
}

export const CORES_STATUS = {
  trial:        { cor:'#b45309', label:'Avaliação' },
  ativo:        { cor:'#15803d', label:'Ativo' },
  inadimplente: { cor:'#b45309', label:'Inadimplente' },
  suspenso:     { cor:'#b91c1c', label:'Suspenso' },
  cancelado:    { cor:'#6b7280', label:'Cancelado' },
};

export function StatusTag({ status }) {
  const info = CORES_STATUS[status] || CORES_STATUS.cancelado;
  return (
    <span style={{
      background:`${info.cor}1a`, color:info.cor, border:`1px solid ${info.cor}55`,
      padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:700,
    }}>{info.label}</span>
  );
}

export function moeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}
