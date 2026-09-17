/**
 * Palette DATABLOCKNET-Chain — dérivée du logo.
 *
 * Le logo est composé de trois hexagones en dégradé :
 *   • partie gauche  → #6B3EE2  (violet-bleu)   RGB 107, 62, 226
 *   • intermédiaire  → #9B32D6  (violet)        RGB 155, 50, 214
 *   • haut / bas     → #D628B4  (rose-magenta)  RGB 214, 40, 180
 *
 * Les couleurs d'interface sont définies dans `index.css` sous forme de
 * variables CSS (deux jeux : `:root` = mode clair, `html.dark` = mode sombre),
 * ce qui permet aux classes Tailwind `ink-*` / `brand-*` de s'adapter sans
 * modification du JSX.
 *
 * Ce module expose uniquement ce que le JS ne peut pas résoudre via le CSS :
 * les couleurs passées en attributs SVG (recharts) et dans les <canvas>.
 */

export const LOGO = {
  violet:  '#6B3EE2',
  purple:  '#9B32D6',
  magenta: '#D628B4',
};

/** Couleur de marque effective par thème (identique à `--c-brand-500`). */
export const BRAND = {
  dark:  '#9B7BF5',
  light: '#6B3EE2',
};

/** Palette « chrome » des graphiques (axes, grilles, surfaces). */
export const CHART = {
  dark: {
    tick:    '#6565a0',
    grid:    'rgba(48,48,88,0.5)',
    surface: '#1c1c36',
    border:  'rgba(50,50,90,0.7)',
    cursor:  'rgba(155,123,245,0.06)',
    brand:   '#9B7BF5',
    accent:  '#D628B4',
  },
  light: {
    tick:    '#5f5f7d',
    grid:    'rgba(200,200,220,0.55)',
    surface: '#ffffff',
    border:  'rgba(226,226,238,1)',
    cursor:  'rgba(107,62,226,0.07)',
    brand:   '#6B3EE2',
    accent:  '#A81E8E',
  },
};

/**
 * Séries catégorielles (nœuds, courbes multiples…).
 * Les deux premières suivent le logo, les suivantes restent des teintes
 * distinctes ; la version claire utilise des nuances plus foncées pour rester
 * lisibles sur fond blanc.
 */
export const SERIES = {
  dark: [
    '#9B7BF5', '#D628B4', '#22D3EE', '#34D399', '#FBBF24',
    '#F87171', '#60A5FA', '#F472B6', '#2DD4BF', '#FB923C',
  ],
  light: [
    '#6B3EE2', '#A81E8E', '#0E7490', '#047857', '#B45309',
    '#DC2626', '#1D4ED8', '#BE185D', '#0F766E', '#C2410C',
  ],
};

/** Variables CSS lues à l'exécution (couleurs non exposées en attributs SVG). */
export function cssVar(name, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v})` : fallback;
}

/* ════════════════════════════════════════════════════════════════════════════
   Palettes consommées par le JS (styles en ligne, attributs SVG, <canvas>)
   ──────────────────────────────────────────────────────────────────────────
   Ces entrées ne peuvent pas vivre dans le CSS : Tailwind ne pilote ni les
   couleurs de recharts, ni celles d'un contexte canvas 2D.
   ══════════════════════════════════════════════════════════════════════════ */

/** hex → "r, g, b" (pour les template literals canvas / SVG) */
export function hexRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

/** hex → rgba(r, g, b, a) */
export function rgba(hex, alpha = 1) {
  return `rgba(${hexRgb(hex)}, ${alpha})`;
}

/* Classes Tailwind par teinte (identiques dans les deux thèmes, seule la
   couleur d'accent change) */
const STAT_ICONS = {
  brand:  { icon: 'text-brand',       iconBg: 'bg-brand/10 border border-brand/20' },
  accent: { icon: 'text-accent',      iconBg: 'bg-accent/10 border border-accent/20' },
  green:  { icon: 'text-emerald-400', iconBg: 'bg-emerald-500/10 border border-emerald-500/20' },
  amber:  { icon: 'text-amber-400',   iconBg: 'bg-amber-500/10 border border-amber-500/20' },
  red:    { icon: 'text-red-400',     iconBg: 'bg-red-500/10 border border-red-500/20' },
  purple: { icon: 'text-purple-400',  iconBg: 'bg-purple-500/10 border border-purple-500/20' },
  indigo: { icon: 'text-indigo-400',  iconBg: 'bg-indigo-500/10 border border-indigo-500/20' },
  blue:   { icon: 'text-blue-400',    iconBg: 'bg-blue-500/10 border border-blue-500/20' },
};

function buildStatSet(colors) {
  const out = {};
  for (const key of Object.keys(STAT_ICONS)) {
    const a = colors[key];
    out[key] = {
      ...STAT_ICONS[key],
      accent: a,
      glow: `0 0 24px ${rgba(a, 0.18)}`,
      hoverBorder: rgba(a, 0.4),
      gradient: `radial-gradient(ellipse at top left, ${rgba(a, 0.09)} 0%, transparent 65%)`,
    };
  }
  out.cyan = out.brand; // ancien nom de teinte conservé pour compatibilité
  return out;
}

/** Cartes de statistiques (StatCard, MetricCard). */
export const STAT = {
  dark: buildStatSet({
    brand: '#9B7BF5', accent: '#D628B4', green: '#34D399', amber: '#FBBF24',
    red: '#F87171', purple: '#C084FC', indigo: '#818CF8', blue: '#60A5FA',
  }),
  light: buildStatSet({
    brand: '#6B3EE2', accent: '#A81E8E', green: '#047857', amber: '#B45309',
    red: '#DC2626', purple: '#7E22CE', indigo: '#4338CA', blue: '#1D4ED8',
  }),
};

/** Seuils warn / crit des jauges et lignes de référence (Monitoring). */
export const STATUS = {
  dark:  { warn: '#F59E0B', crit: '#EF4444' },
  light: { warn: '#B45309', crit: '#DC2626' },
};

/** Couleurs des jauges Monitoring (CPU, mémoire, disque, latence). */
export const METRIC = {
  dark:  { cpu: '#9B7BF5', ram: '#D628B4', disk: '#34D399', lat: '#FBBF24' },
  light: { cpu: '#6B3EE2', ram: '#A81E8E', disk: '#047857', lat: '#B45309' },
};