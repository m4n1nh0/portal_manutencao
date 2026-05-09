import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'portal_manutencao_theme';
const THEMES = ['light', 'dark'];
const THEME_COLORS = {
  light: '#f4f6f5',
  dark: '#0f1418',
};

function isTheme(value) {
  return THEMES.includes(value);
}

function getPreferredTheme() {
  if (typeof window === 'undefined') return 'light';

  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    return 'light';
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return;

  const nextTheme = isTheme(theme) ? theme : 'light';
  document.documentElement.dataset.theme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', THEME_COLORS[nextTheme]);
}

export function useTheme() {
  const [theme, setThemeState] = useState(getPreferredTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_KEY, theme);
      window.dispatchEvent(new CustomEvent('portal-theme-change', { detail: theme }));
    } catch {
      // Theme persistence is a progressive enhancement.
    }
  }, [theme]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === THEME_KEY && isTheme(event.newValue)) setThemeState(event.newValue);
    };
    const handleThemeChange = (event) => {
      if (isTheme(event.detail)) setThemeState(event.detail);
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('portal-theme-change', handleThemeChange);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('portal-theme-change', handleThemeChange);
    };
  }, []);

  const setTheme = useCallback((value) => {
    setThemeState(isTheme(value) ? value : 'light');
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => current === 'dark' ? 'light' : 'dark');
  }, []);

  return {
    theme,
    isDark: theme === 'dark',
    setTheme,
    toggleTheme,
  };
}
