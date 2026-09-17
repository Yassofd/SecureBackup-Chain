/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      colors: {
        /* ── Échelle neutre « ink » ──────────────────────────────────────
           Pilotée par variables CSS (deux jeux : `:root` = clair,
           `html.dark` = sombre) et INVERSÉE entre les thèmes :
             950 → surface la plus profonde (fond de page)
              50 → texte le plus fort
           En mode clair, la rampe est le miroir du mode sombre : les
           compositions existantes (bg-ink-700, text-ink-300, border-ink-500…)
           s'adaptent donc sans aucune modification du JSX.            */
        ink: {
          950: 'rgb(var(--c-ink-950) / <alpha-value>)',
          900: 'rgb(var(--c-ink-900) / <alpha-value>)',
          850: 'rgb(var(--c-ink-850) / <alpha-value>)',
          800: 'rgb(var(--c-ink-800) / <alpha-value>)',
          750: 'rgb(var(--c-ink-750) / <alpha-value>)',
          700: 'rgb(var(--c-ink-700) / <alpha-value>)',
          650: 'rgb(var(--c-ink-650) / <alpha-value>)',
          600: 'rgb(var(--c-ink-600) / <alpha-value>)',
          550: 'rgb(var(--c-ink-550) / <alpha-value>)',
          500: 'rgb(var(--c-ink-500) / <alpha-value>)',
          450: 'rgb(var(--c-ink-450) / <alpha-value>)',
          400: 'rgb(var(--c-ink-400) / <alpha-value>)',
          300: 'rgb(var(--c-ink-300) / <alpha-value>)',
          200: 'rgb(var(--c-ink-200) / <alpha-value>)',
          100: 'rgb(var(--c-ink-100) / <alpha-value>)',
          50:  'rgb(var(--c-ink-50) / <alpha-value>)',
          /* Séparateurs : en mode sombre = ink-700 (aspect d'origine) ; en mode
             clair une nuance distincte, car ink-700 y est blanc pur et un
             liseré blanc sur fond blanc serait invisible. */
          ghost: 'rgb(var(--c-ink-ghost) / <alpha-value>)',
          line:  'rgb(var(--c-ink-line) / <alpha-value>)',
        },

        /* ── Violet du logo ─────────────────────────────────────────────
           #6B3EE2 (gauche) → #9B32D6 (centre) → #D628B4 (droite/haut/bas).
           DEFAULT/400/600 sont pilotés par variables : le violet du logo
           (#6B3EE2) en mode clair, une teinte éclaircie en mode sombre pour
           tenir le contraste WCAG sur fond très foncé.               */
        brand: {
          50:      '#f4efff',
          100:     '#e7dcff',
          200:     '#cdb8fb',
          300:     '#ac8ef7',
          400:     'rgb(var(--c-brand-400) / <alpha-value>)',
          500:     'rgb(var(--c-brand-500) / <alpha-value>)',
          DEFAULT: 'rgb(var(--c-brand-500) / <alpha-value>)',
          600:     'rgb(var(--c-brand-600) / <alpha-value>)',
          700:     '#5530b8',
          800:     '#42239a',
          900:     '#311a76',
        },

        /* ─ Rose-magenta du logo (extrémité chaude du dégradé) ─────────── */
        accent: {
          400:     'rgb(var(--c-accent-400) / <alpha-value>)',
          500:     'rgb(var(--c-accent-500) / <alpha-value>)',
          DEFAULT: 'rgb(var(--c-accent-500) / <alpha-value>)',
          600:     'rgb(var(--c-accent-600) / <alpha-value>)',
        },

        /* ── Couleurs d'état ─────────────────────────────────────────────
           Les nuances 400 (texte, pastilles) sont remappées par thème :
           les teintes Tailwind d'origine sont calibrées pour fond sombre et
           deviennent illisibles sur blanc. Les nuances 500/600 restent
           celles de Tailwind (fonds translucides à 10 %).             */
        emerald: { 400: 'rgb(var(--c-emerald-400) / <alpha-value>)' },
        red:     { 400: 'rgb(var(--c-red-400) / <alpha-value>)' },
        amber:   { 400: 'rgb(var(--c-amber-400) / <alpha-value>)' },
        purple:  { 400: 'rgb(var(--c-purple-400) / <alpha-value>)' },
        indigo:  { 400: 'rgb(var(--c-indigo-400) / <alpha-value>)' },
        blue:    { 400: 'rgb(var(--c-blue-400) / <alpha-value>)' },
      },
      boxShadow: {
        'glow-brand':   '0 0 20px rgb(var(--c-brand-500) / 0.25), 0 0 6px rgb(var(--c-accent-500) / 0.14)',
        'glow-brand-sm':'0 0 10px rgb(var(--c-brand-500) / 0.20)',
        'glow-brand-lg':'0 0 35px rgb(var(--c-brand-500) / 0.30), 0 0 12px rgb(var(--c-accent-500) / 0.18)',
        'glow-emerald': '0 0 20px rgba(16,185,129,0.2)',
        'glow-red':     '0 0 20px rgba(239,68,68,0.2)',
        'glow-purple':  '0 0 20px rgb(var(--c-purple-400) / 0.25)',
        'glow-amber':   '0 0 20px rgba(245,158,11,0.18)',
        'glow-indigo':  '0 0 20px rgba(99,102,241,0.2)',
        'inner-top':    'inset 0 1px 0 rgb(var(--c-inset-top))',
        'card':         '0 4px 24px rgb(var(--c-shadow)), inset 0 1px 0 rgb(var(--c-inset-top))',
      },
      backgroundImage: {
        'gradient-logo':   'linear-gradient(135deg, rgb(var(--c-brand-500) / 0.22) 0%, rgb(var(--c-accent-500) / 0.16) 100%)',
        'gradient-sidebar':'linear-gradient(180deg, rgb(var(--c-brand-500) / 0.05) 0%, transparent 40%)',
        'glow-cyan':       'radial-gradient(ellipse at top left, rgb(var(--c-brand-500) / 0.12) 0%, transparent 60%)',
        'glow-purple':     'radial-gradient(ellipse at top left, rgb(var(--c-purple-400) / 0.12) 0%, transparent 60%)',
        'glow-emerald':    'radial-gradient(ellipse at top left, rgba(16,185,129,0.12) 0%, transparent 60%)',
        'glow-amber':      'radial-gradient(ellipse at top left, rgba(245,158,11,0.12) 0%, transparent 60%)',
        'glow-indigo':     'radial-gradient(ellipse at top left, rgba(99,102,241,0.12) 0%, transparent 60%)',
        /* Dégradé de marque repris du logo (hexagones violet → magenta) */
        'gradient-brand':  'linear-gradient(120deg, #6B3EE2 0%, #9B32D6 55%, #D628B4 100%)',
      },
      keyframes: {
        glowPulse: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%':       { opacity: '1',   transform: 'scale(1.15)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'glow-pulse': 'glowPulse 2.5s ease-in-out infinite',
        'shimmer':    'shimmer 2.5s linear infinite',
        'fade-in':    'fadeIn 0.15s ease-out',
      },
    },
  },
  plugins: [],
};
