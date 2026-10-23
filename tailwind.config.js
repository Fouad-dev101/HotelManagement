export default {
  content: ['./index.html', './client/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 900: '#0B1B2B', 800: '#122A44', 700: '#1B3A5C' },
        gold: { 500: '#C9A227', 400: '#D4B24A' },
        cream: '#F7F4EE'
      },
      fontFamily: {
        display: ['"Playfair Display"', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};