/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 使用主题变量，便于深色模式切换
        surface: 'var(--color-surface)',
        'surface-elevated': 'var(--color-surface-elevated)',
        'surface-input': 'var(--color-surface-input)',
        background: 'var(--color-background)',
        primary: 'var(--color-primary)',
        'primary-muted': 'var(--color-primary-muted)',
        border: 'var(--color-border)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
      },
      width: {
        sidebar: 'var(--sidebar-width, 280px)',
        'sidebar-collapsed': 'var(--sidebar-collapsed-width, 72px)',
      },
    },
  },
  plugins: [],
}
