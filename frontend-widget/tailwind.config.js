/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#f0fbfe',
          100: '#dcf6fc',
          200: '#b9eef9',
          300: '#7fe1f3',
          400: '#3dcce8',
          500: '#1abde1',
          600: '#0e9dbe',
          700: '#0e7d9a',
          800: '#10647d',
          900: '#115369',
          950: '#0b3445',
        },
      },
      fontFamily: {
        sans: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
