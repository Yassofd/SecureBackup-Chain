import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { CHART, SERIES, STATUS, METRIC } from '../theme/palette';

const STORAGE_KEY = 'sbc-theme';

const ThemeContext = createContext(null);

/**
 * Thème initial : préférence enregistrée, sinon `dark` (identité visuelle
 * historique de l'application). Le script anti-flash de `index.html` applique
 * exactement la même règle avant le premier rendu React.
 */
function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch (_) { /* navigation privée / localStorage indisponible */ }
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch (_) { /* ignoré */ }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(() => ({
    theme,
    isDark:  theme === 'dark',
    toggleTheme,
    setTheme,
    chart:   CHART[theme],
    series:  SERIES[theme],
    status:  STATUS[theme],
    metric:  METRIC[theme],
  }), [theme, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme() doit être utilisé à l\'intérieur d\'un <ThemeProvider>');
  return ctx;
}