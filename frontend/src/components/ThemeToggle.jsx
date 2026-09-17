import clsx from 'clsx';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

/**
 * Bascule clair / sombre.
 * `variant="solid"` est utilisé hors application (page de connexion, wizard)
 * où le fond est celui de la page et non du bandeau supérieur.
 */
export default function ThemeToggle({ className, variant = 'ghost' }) {
  const { isDark, toggleTheme } = useTheme();
  const label = isDark ? 'Passer en mode clair' : 'Passer en mode sombre';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className={clsx(
        'inline-flex items-center justify-center rounded-lg transition-colors',
        variant === 'solid'
          ? 'p-2.5 bg-ink-700 border border-ink-500 text-ink-200 hover:text-brand hover:border-brand/50 shadow-sm'
          : 'p-2 text-ink-300 hover:text-brand hover:bg-brand/10',
        className,
      )}
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}