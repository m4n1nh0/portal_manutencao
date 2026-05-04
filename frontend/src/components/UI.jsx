// components/UI.jsx — Primitivos de UI reutilizáveis
import { useState } from 'react';

// ── Badges ─────────────────────────────────────────────────────
const STATUS_MAP = {
  'Concluído':    ['badge-done',    '✓ Concluído'],
  'Em Andamento': ['badge-progress','▶ Andamento'],
  'Em Revisão':   ['badge-review',  '🔍 Revisão'],
  'Pendente':     ['badge-pending', '⏳ Pendente'],
  'pendente':     ['badge-warning', '⏳ Aguardando aprovação'],
  'aprovado':     ['badge-done',    '✓ Aprovado'],
  'rejeitado':    ['badge-danger',  '✗ Rejeitado'],
  'suspenso':     ['badge-danger',  '⊘ Suspenso'],
};
export function StatusBadge({ status }) {
  const [cls, label] = STATUS_MAP[status] || ['badge-pending', status];
  return <span className={`badge ${cls}`} style={{whiteSpace:'nowrap'}}>{label}</span>;
}

const PRIO_MAP = { Alta:['prio-alta','Alta'], Média:['prio-media','Média'], Baixa:['prio-baixa','Baixa'] };
export function PrioBadge({ p }) {
  if (!p) return null;
  const [cls, label] = PRIO_MAP[p] || ['prio-media', p];
  return <span className={`prio ${cls}`}>{label}</span>;
}

export function SectorTag({ setor }) {
  return <span className="stag">{setor}</span>;
}

// ── Empty State ────────────────────────────────────────────────
export function EmptyState({ icon='📭', title='Nenhum item', desc='' }) {
  return (
    <div className="empty-state">
      <div className="es-icon">{icon}</div>
      <h3>{title}</h3>
      {desc && <p>{desc}</p>}
    </div>
  );
}

// ── Loading Spinner ────────────────────────────────────────────
export function Spinner({ size=36 }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'40px' }}>
      <div style={{
        width:size, height:size,
        border:'3px solid var(--bd)', borderTopColor:'var(--acc)',
        borderRadius:'50%', animation:'spin .7s linear infinite',
      }}/>
    </div>
  );
}

// ── Progress Bar ───────────────────────────────────────────────
export function ProgressBar({ done, total, color='var(--acc)' }) {
  const pct = total ? Math.round(done/total*100) : 0;
  return (
    <div className="progress-bar">
      <div className="progress-fill" style={{ width:`${pct}%`, background:color }} />
    </div>
  );
}

// ── Modal (bottom sheet) ───────────────────────────────────────
export function Modal({ id, title, children, footer, maxWidth='600px', onClose }) {
  return (
    <div className="modal-overlay" id={id} onClick={e => e.target===e.currentTarget && onClose?.()}>
      <div className="modal-sheet" style={{ maxWidth }}>
        <div className="modal-handle" />
        <div className="modal-title">{title}</div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
export function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

// ── Form controls ──────────────────────────────────────────────
export function FormGroup({ label, children, required }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}{required && <span style={{color:'var(--red)'}}> *</span>}</label>
      {children}
    </div>
  );
}

export function Input({ label, required, error, ...props }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}{required && <span style={{color:'var(--red)'}}> *</span>}</label>}
      <input className={`form-control${error?' input-error':''}`} {...props} />
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

export function Select({ label, required, error, children, ...props }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}{required && <span style={{color:'var(--red)'}}> *</span>}</label>}
      <select className={`form-control${error?' input-error':''}`} {...props}>{children}</select>
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

// ── Senha com visibilidade ─────────────────────────────────────
export function PasswordInput({ label, required, error, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}{required && <span style={{color:'var(--red)'}}> *</span>}</label>}
      <div style={{ position:'relative' }}>
        <input
          type={show?'text':'password'}
          className={`form-control${error?' input-error':''}`}
          value={value} onChange={onChange} placeholder={placeholder}
          style={{ paddingRight:'42px' }}
        />
        <button type="button" onClick={() => setShow(!show)}
          style={{ position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)',
                   background:'none', border:'none', fontSize:'16px', opacity:.5, color:'var(--tx)', cursor:'pointer' }}>
          {show ? '🙈' : '👁'}
        </button>
      </div>
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

// ── Força da senha ─────────────────────────────────────────────
export function SenhaForca({ senha }) {
  const checks = [
    { ok: senha.length >= 8,           label: '8+ caracteres' },
    { ok: /[A-Z]/.test(senha),         label: 'Maiúscula' },
    { ok: /[0-9]/.test(senha),         label: 'Número' },
    { ok: /[^A-Za-z0-9]/.test(senha),  label: 'Caractere especial' },
  ];
  const score = checks.filter(c=>c.ok).length;
  const colors = ['var(--red)','var(--red)','var(--acc)','var(--acc)','var(--grn)'];
  const labels = ['','Fraca','Fraca','Média','Forte'];

  if (!senha) return null;
  return (
    <div style={{ marginTop:'6px' }}>
      <div style={{ display:'flex', gap:'4px', marginBottom:'6px' }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            flex:1, height:'4px', borderRadius:'2px',
            background: i < score ? colors[score] : 'var(--bd)',
            transition:'background .2s',
          }}/>
        ))}
      </div>
      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
        {checks.map((c,i) => (
          <span key={i} style={{ fontSize:'11px', color: c.ok ? 'var(--grn)' : 'var(--mu)' }}>
            {c.ok ? '✓' : '○'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Card de Tarefa ─────────────────────────────────────────────
export function TaskCard({ tarefa, actions }) {
  const prioClass = { Alta:'prio-alta-card', Média:'prio-media-card', Baixa:'prio-baixa-card' };
  return (
    <div className={`task-card ${prioClass[tarefa.prioridade]||''} ${tarefa.status==='Concluído'?'task-done':''}`}>
      <div className="task-card-top">
        <div className="task-card-title">{tarefa.atividade}</div>
        <StatusBadge status={tarefa.status} />
      </div>
      <div className="task-card-meta">
        <SectorTag setor={tarefa.setor} />
        {tarefa.area && <span className="muted-sm">{tarefa.area}</span>}
        {tarefa.equipe && <span className="muted-sm">• {tarefa.equipe}</span>}
        <PrioBadge p={tarefa.prioridade} />
      </div>
      {tarefa.observacoes && <div className="task-obs">💬 {tarefa.observacoes}</div>}
      {actions && <div className="task-actions">{actions}</div>}
    </div>
  );
}

// ── Info Box ───────────────────────────────────────────────────
export function InfoBox({ children, color='var(--blu)', bg='rgba(88,166,255,.07)', border='rgba(88,166,255,.2)' }) {
  return (
    <div style={{
      background:bg, border:`1px solid ${border}`, borderRadius:'8px',
      padding:'11px 14px', fontSize:'13px', color, marginBottom:'14px',
    }}>
      {children}
    </div>
  );
}

// ── Confirmation Dialog ────────────────────────────────────────
export function ConfirmDialog({ open, title, message, onConfirm, onCancel, danger=false }) {
  if (!open) return null;
  return (
    <div style={{
      position:'fixed', inset:0, background:'rgba(0,0,0,.75)',
      zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px',
    }}>
      <div style={{
        background:'var(--s)', border:'1px solid var(--bd)', borderRadius:'14px',
        padding:'24px', width:'100%', maxWidth:'380px',
      }}>
        <h3 style={{ fontFamily:'Syne,sans-serif', fontSize:'17px', marginBottom:'10px' }}>{title}</h3>
        <p style={{ fontSize:'13px', color:'var(--mu)', marginBottom:'20px' }}>{message}</p>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px' }}>
          <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
          <button className={`btn ${danger?'btn-danger':'btn-primary'}`} onClick={onConfirm}>Confirmar</button>
        </div>
      </div>
    </div>
  );
}
