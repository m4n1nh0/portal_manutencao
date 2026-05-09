import { useTheme } from '../hooks/useTheme';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const actionLabel = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={toggleTheme}
      aria-label={actionLabel}
      title={actionLabel}
    >
      <span className="theme-toggle-mark">{isDark ? 'DK' : 'LT'}</span>
      <span className="theme-toggle-text">{isDark ? 'Escuro' : 'Claro'}</span>
    </button>
  );
}
