/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      colors: {
        /* InfluxDB-matched dark palette */
        ink: {
          950: '#080810',  // sidebar bg — darkest chrome
          900: '#0d0d1c',  // app bg
          850: '#111124',
          800: '#14142a',  // subtle bg variant
          750: '#181830',
          700: '#1e1e38',  // card / panel bg
          650: '#222242',
          600: '#27274a',  // input bg, inner card
          550: '#2c2c52',  // hover bg
          500: '#32325a',  // borders
          450: '#3c3c68',
          400: '#474778',  // subtle borders
          300: '#6767a0',  // muted / placeholder text
          200: '#9090b8',  // secondary text
          100: '#b8b8d0',  // tertiary text
          50:  '#ededf8',  // primary text
        },
        brand: {
          50:      '#e0f9fd',
          100:     '#b3f0f7',
          200:     '#80e6f0',
          300:     '#4ddce9',
          400:     '#26d3e3',
          DEFAULT: '#00b4d8',
          600:     '#0099b8',
          700:     '#007d98',
          800:     '#006278',
          900:     '#004858',
        },
      },
    },
  },
  plugins: [],
};
