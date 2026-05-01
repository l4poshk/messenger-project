/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Background surfaces ──
        primary: '#1a1a1f',
        secondary: '#16161b',
        tertiary: '#111114',
        elevated: '#242429',
        'surface-hover': '#2c2c32',

        // ── Borders ──
        border: '#2a2a2e',
        'border-light': '#3a3a3e',

        // ── Text ──
        'text-primary': '#e4e4e7',
        'text-muted': '#71717a',
        'text-hint': '#52525b',

        // ── Accent ──
        accent: '#22c55e',
        'accent-hover': '#16a34a',
        'accent-dark': '#052e16',
        'accent-soft': '#22c55e1a', // 10% opacity

        // ── Message bubbles ──
        'msg-outgoing': '#1a3a24',
        'msg-outgoing-text': '#bbf7d0',

        // ── Status ──
        danger: '#ef4444',
        'danger-hover': '#dc2626',
        warning: '#f59e0b',
        info: '#3b82f6',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      spacing: {
        'nav': '56px',     // icon nav bar width
        'sidebar': '280px', // chat list sidebar width
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-right': 'slideRight 0.2s ease-out',
        'pulse-dot': 'pulseDot 1.4s infinite ease-in-out both',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideRight: {
          '0%': { opacity: '0', transform: 'translateX(-10px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseDot: {
          '0%, 80%, 100%': { transform: 'scale(0)' },
          '40%': { transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};
