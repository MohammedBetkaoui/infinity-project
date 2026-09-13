/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#002a1e',
        surface: '#003828',
        'surface-light': '#0a5a43',
        primary: '#094a36',
        'primary-dark': '#003426',
        'primary-glow': '#9ed7c4',
        leaf: '#094a36',
        olive: '#638f80',
        'olive-dark': '#164f3c',
        sage: '#b6cec5',
        cream: '#F1EBDD',
        paper: '#E7DFCF',
        sand: '#CDBFA9',
        ink: '#00271b',
        'text-primary': '#F4F0E7',
        'text-muted': '#b6cec5',
      },
      fontFamily: {
        display: ['Rajdhani', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 45px rgba(9, 74, 54, 0.2)',
        'glow-strong': '0 0 60px rgba(9, 74, 54, 0.32)',
      },
      backgroundImage: {
        'grid-fade': 'linear-gradient(rgba(182,206,197,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(182,206,197,.05) 1px, transparent 1px)',
      },
      fontSize: {
        hero: ['clamp(4rem, 8.8vw, 9rem)', { lineHeight: '.78', letterSpacing: '-.055em' }],
        section: ['clamp(2.7rem, 4.6vw, 4.6rem)', { lineHeight: '1', letterSpacing: '-.035em' }],
        card: ['clamp(1.65rem, 2.25vw, 2.35rem)', { lineHeight: '1', letterSpacing: '-.02em' }],
        lead: ['clamp(1rem, 1.25vw, 1.16rem)', { lineHeight: '1.75' }],
      },
    },
  },
  plugins: [],
}
