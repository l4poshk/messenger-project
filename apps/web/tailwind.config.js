/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Background surfaces (CSS variable-driven) ──
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        tertiary: 'var(--color-tertiary)',
        elevated: 'var(--color-elevated)',
        'surface-hover': 'var(--color-surface-hover)',

        // ── Borders ──
        border: 'var(--color-border)',
        'border-light': 'var(--color-border-light)',

        // ── Text ──
        'text-primary': 'var(--color-text-primary)',
        'text-muted': 'var(--color-text-muted)',
        'text-hint': 'var(--color-text-hint)',

        // ── Accent ──
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-dark': 'var(--color-accent-dark)',
        'accent-soft': 'rgba(34, 197, 94, 0.1)',

        // ── Message bubbles ──
        'msg-outgoing': 'var(--color-msg-outgoing)',
        'msg-outgoing-text': 'var(--color-msg-outgoing-text)',

        // ── Status ──
        danger: 'var(--color-danger)',
        'danger-hover': 'var(--color-danger-hover)',
        warning: 'var(--color-warning)',
        info: 'var(--color-info)',
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
