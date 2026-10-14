/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        page: 'var(--page)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        'surface-3': 'var(--surface-3)',
        raised: 'var(--raised)',
        field: 'var(--field)',
        fg: 'var(--fg)',
        'fg-2': 'var(--fg-2)',
        'fg-3': 'var(--fg-3)',
        'fg-disabled': 'var(--fg-disabled)',
        'fg-inverse': 'var(--fg-inverse)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        control: 'var(--control)',
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-active': 'var(--accent-active)',
        'accent-wash': 'var(--accent-wash)',
        'accent-line': 'var(--accent-line)',
        'on-accent': 'var(--on-accent)',
        ring: 'var(--ring)',
        success: 'var(--success)',
        'success-tint': 'var(--success-tint)',
        'success-text': 'var(--success-text)',
        warn: 'var(--warn)',
        'warn-tint': 'var(--warn-tint)',
        'warn-text': 'var(--warn-text)',
        danger: 'var(--danger)',
        'danger-hover': 'var(--danger-hover)',
        'danger-tint': 'var(--danger-tint)',
        'danger-text': 'var(--danger-text)',
      },
      borderRadius: {
        panel: '16px',
        control: '10px',
      },
      transitionTimingFunction: {
        'apple-spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'apple-press': 'cubic-bezier(0.2, 0, 0, 1)',
      }
    },
  },
  plugins: [],
}
