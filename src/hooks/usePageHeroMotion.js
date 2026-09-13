import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { GSAP_EASE } from '../lib/motion'

export default function usePageHeroMotion(heroRef) {
  const introPlayed = useRef(false)

  useLayoutEffect(() => {
    const hero = heroRef.current
    const media = gsap.matchMedia()

    media.add({ all: 'all', reduced: '(prefers-reduced-motion: reduce)' }, ({ conditions }) => {
      if (introPlayed.current || window.scrollY >= 24) return undefined

      const title = hero.querySelector('h1')
      const letters = hero.querySelectorAll('.page-hero-letter')
      const note = hero.querySelector('.page-hero-note')
      const rule = hero.querySelector('.page-hero-rule i')
      const finishIntro = () => { if (window.scrollY > 24) intro.progress(1) }
      const intro = gsap.timeline({
        defaults: { ease: GSAP_EASE.smooth },
        onComplete: () => {
          introPlayed.current = true
          window.removeEventListener('scroll', finishIntro)
        },
      })

      if (conditions.reduced) {
        intro.from([title, note], { opacity: .4, duration: .18 })
      } else {
        intro
          .from(letters, { yPercent: 105, rotationX: -24, transformOrigin: '50% 100%', duration: .74, stagger: .032 }, 0)
          .from(rule, { scaleX: 0, duration: .88, ease: 'power3.inOut' }, .08)
          .from(note, { opacity: 0, duration: .36 }, .31)
      }

      // Finish the introduction as soon as the visitor starts reading further down.
      window.addEventListener('scroll', finishIntro, { passive: true })
      return () => window.removeEventListener('scroll', finishIntro)
    }, hero)

    return () => media.revert()
  }, [heroRef])
}
