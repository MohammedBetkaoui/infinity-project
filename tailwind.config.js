/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0B100D',
        surface: '#121813',
        'surface-light': '#1A211A',
        primary: '#8BCB6B',
        'primary-dark': '#557D49',
        'primary-glow': '#B3E49A',
        leaf: '#6E9C5A',
        olive: '#788166',
        'olive-dark': '#30392D',
        sage: '#A9B6A1',
        cream: '#F1EBDD',
        paper: '#E7DFCF',
        sand: '#CDBFA9',
        ink: '#172018',
        'text-primary': '#F4F0E7',
        'text-muted': '#A5ADA4',
      },
      fontFamily: {
        display: ['Rajdhani', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 45px rgba(139, 203, 107, 0.14)',
        'glow-strong': '0 0 60px rgba(139, 203, 107, 0.22)',
      },
      backgroundImage: {
        'grid-fade': 'linear-gradient(rgba(169,182,161,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(169,182,161,.05) 1px, transparent 1px)',
      },
      fontSize: {
        hero: ['clamp(4rem, 8.8vw, 9rem)', { lineHeight: '.78', letterSpacing: '-.055em' }],
        section: ['clamp(2.8rem, 5.2vw, 5.6rem)', { lineHeight: '.92', letterSpacing: '-.035em' }],
        card: ['clamp(1.65rem, 2.25vw, 2.35rem)', { lineHeight: '1', letterSpacing: '-.02em' }],
        lead: ['clamp(1rem, 1.25vw, 1.16rem)', { lineHeight: '1.75' }],
      },
    },
  },
  plugins: [],
}
