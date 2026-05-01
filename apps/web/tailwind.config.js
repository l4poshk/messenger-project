/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#1a1a1f',
        secondary: '#16161b',
        tertiary: '#111114',
        elevated: '#242429',
        border: '#2a2a2e',
        'text-primary': '#e4e4e7',
        'text-muted': '#71717a',
        'text-hint': '#52525b',
        accent: '#22c55e',
        'accent-dark': '#052e16',
        'msg-outgoing': '#1a3a24',
        'msg-outgoing-text': '#bbf7d0',
      },
    },
  },
  plugins: [],
};
