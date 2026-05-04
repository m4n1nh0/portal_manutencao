import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { saveSession, loadSession, clearSession, getPerms } from '../utils/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(() => loadSession());
  const [loading, setLoading] = useState(true);

  // Valida sessão ao iniciar
  useEffect(() => {
    (async () => {
      const saved = loadSession();
      if (saved && api.getToken()) {
        try {
          const { usuario } = await api.me();
          const full = { ...usuario, permissoes: getPerms(usuario.perfil) };
          setUser(full);
          localStorage.setItem('pm_user', JSON.stringify(full));
        } catch {
          clearSession();
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback((usuario, token, refresh) => {
    const full = { ...usuario, permissoes: getPerms(usuario.perfil) };
    saveSession(full, token, refresh);
    setUser(full);
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(localStorage.getItem('pm_refresh')); } catch {}
    clearSession();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { usuario } = await api.me();
      const full = { ...usuario, permissoes: getPerms(usuario.perfil) };
      setUser(full);
      localStorage.setItem('pm_user', JSON.stringify(full));
    } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
