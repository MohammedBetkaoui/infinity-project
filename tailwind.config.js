/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0b4b37',
        surface: '#093c2e',
        'surface-light': '#10563f',
        primary: '#039869',
        'primary-dark': '#0b4b37',
        'primary-glow': '#a4e5cc',
        leaf: '#039869',
        olive: '#68a78f',
        'olive-dark': '#10563f',
        sage: '#b7d1c5',
        cream: '#F1EBDD',
        paper: '#E7DFCF',
        sand: '#CDBFA9',
        ink: '#041f17',
        'text-primary': '#F4F0E7',
        'text-muted': '#b7d1c5',
      },
      fontFamily: {
        display: ['Rajdhani', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 45px rgba(3, 152, 105, 0.14)',
        'glow-strong': '0 0 60px rgba(3, 152, 105, 0.22)',
      },
      backgroundImage: {
        'grid-fade': 'linear-gradient(rgba(183,209,197,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(183,209,197,.05) 1px, transparent 1px)',
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
