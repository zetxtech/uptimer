/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand colors
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
        },
        // Theme-driven surfaces (see styles.css :root / .dark)
        app: 'var(--color-bg)',
        surface: 'var(--color-card)',
        'surface-2': 'var(--color-bg-secondary)',
        line: 'var(--color-border)',
        'line-soft': 'var(--color-border-light)',
        ink: 'var(--color-text-primary)',
        'ink-2': 'var(--color-text-secondary)',
        'ink-3': 'var(--color-text-muted)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-soft': 'var(--color-accent-soft)',
        // Status colors - semantic (theme-driven, see styles.css :root / .dark)
        status: {
          up: 'var(--color-up)',
          down: 'var(--color-down)',
          maintenance: 'var(--color-maintenance)',
          paused: 'var(--color-paused)',
          unknown: 'var(--color-unknown)',
        },
      },
      // The reference status pages run on a 13px base with a 1.5 leading and a
      // single large hero heading; the whole scale is pinned in px so that the
      // rem-based spacing ladder stays untouched.
      fontSize: {
        xs: ['11px', '16px'],
        sm: ['13px', '19.5px'],
        base: ['13px', '19.5px'],
        md: ['15px', '22px'],
        lg: ['17px', '24px'],
        xl: ['20px', '28px'],
        '2xl': ['24px', '32px'],
        '3xl': ['30px', '36px'],
        '4xl': ['32px', '35px'],
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        soft: '0 2px 8px -2px rgba(0, 0, 0, 0.05), 0 4px 16px -4px rgba(0, 0, 0, 0.1)',
        'soft-lg': '0 4px 12px -2px rgba(0, 0, 0, 0.08), 0 8px 24px -4px rgba(0, 0, 0, 0.12)',
        'glow-green': '0 0 20px -5px rgba(16, 185, 129, 0.4)',
        'glow-red': '0 0 20px -5px rgba(239, 68, 68, 0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
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
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
};
