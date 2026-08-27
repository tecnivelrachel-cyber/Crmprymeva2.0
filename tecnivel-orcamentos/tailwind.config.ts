import type { Config } from 'tailwindcss'

/**
 * Identidade TecNível: azul corporativo sobre fundo claro.
 * Escala gerada a partir do azul da marca (#0B63CE).
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9ebff',
          200: '#bcdcff',
          300: '#8ec6ff',
          400: '#59a5ff',
          500: '#2f83fb',
          600: '#0b63ce',
          700: '#0a51a8',
          800: '#0d458a',
          900: '#103c72',
        },
        ink: {
          DEFAULT: '#0f172a',
          soft: '#475569',
          faint: '#94a3b8',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -12px rgb(15 23 42 / 0.12)',
      },
    },
  },
  plugins: [],
}

export default config
