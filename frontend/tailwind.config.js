/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Bambu Lab color palette — these are overridden at runtime by @theme CSS variables
        bambu: {
          green: '#00ae42',
          'green-light': '#00c64d',
          'green-dark': '#009438',
          dark: '#0f0f0f',
          'dark-secondary': '#1e1e1e',
          'dark-tertiary': '#2a2a2a',
          card: '#1e1e1e',
          gray: '#888888',
          'gray-light': '#b0b0b0',
          'gray-dark': '#555555',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
      },
    },
  },
  plugins: [],
}
