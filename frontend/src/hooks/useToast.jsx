import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((msg, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  const borders = { success:'var(--grn)', error:'var(--red)', info:'var(--acc)', warning:'var(--pur)' };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{
        position:'fixed', bottom:'calc(var(--bnh,60px) + 70px)', right:'14px',
        zIndex:300, display:'flex', flexDirection:'column', gap:'8px', maxWidth:'calc(100vw - 28px)',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background:'var(--s2)', border:`1px solid var(--bd)`,
            borderLeft:`3px solid ${borders[t.type]}`,
            borderRadius:'10px', padding:'11px 16px', fontSize:'13px',
            display:'flex', alignItems:'center', gap:'10px',
            boxShadow:'0 4px 16px rgba(0,0,0,.3)',
            animation:'slideLeft .25s ease',
          }}>
            <span style={{fontSize:'16px'}}>{icons[t.type]}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
