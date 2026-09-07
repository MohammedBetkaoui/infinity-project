export const MOTION_EASE = {
  smooth: [0.16, 1, 0.3, 1],
  punchy: [0.34, 1.35, 0.64, 1],
}

export const GSAP_EASE = {
  smooth: 'power4.out',
  punchy: 'back.out(1.35)',
  settle: 'expo.out',
}

export const SPRINGS = {
  control: { type: 'spring', stiffness: 430, damping: 18, mass: 0.72 },
  accordion: { type: 'spring', stiffness: 230, damping: 25, mass: 0.9 },
}

export const lenisEasing = (time) => Math.min(1, 1.001 - 2 ** (-10 * time))

export const shouldReduceMotion = () => (
  typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches
)
