/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'inncempro-orange': '#E85E26',
      },
      fontFamily: {
        sans: ['Open Sans', 'sans-serif'],
        condensed: ['Oswald', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
