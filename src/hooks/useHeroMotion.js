import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { GSAP_EASE } from '../lib/motion'

gsap.registerPlugin(ScrollTrigger)

export default function useHeroMotion(sectionRef) {
  useLayoutEffect(() => {
    const section = sectionRef.current
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const words = section.querySelectorAll('.hero-word')
      const path = section.querySelector('.ribbon-trace')
      const length = path.getTotalLength()
      const intro = gsap.timeline({ defaults: { ease: GSAP_EASE.smooth } })
      intro.from(words, { yPercent: 105, rotate: 2, duration: .8, stagger: .065 }, .1)
        .from(path, { strokeDasharray: length, strokeDashoffset: length, duration: 1.35 }, .12)
        .from('.hero-detail', { opacity: 0, duration: .5, stagger: .1 }, .4)

      const orbit = gsap.to('.art-orbit', { rotate: 360, duration: 60, ease: 'none', repeat: -1 })
      let visible = true
      const playAmbient = () => orbit.paused(!visible || document.hidden)
      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting
        playAmbient()
      })
      observer.observe(section)
      document.addEventListener('visibilitychange', playAmbient)

      const depth = section.querySelector('.art-depth')
      const x = gsap.quickTo(depth, 'x', { duration: .5, ease: GSAP_EASE.smooth })
      const y = gsap.quickTo(depth, 'y', { duration: .5, ease: GSAP_EASE.smooth })
      const move = (event) => {
        if (event.pointerType !== 'mouse') return
        x((event.clientX / innerWidth - .5) * 14)
        y((event.clientY / innerHeight - .5) * 10)
      }
      const reset = () => { x(0); y(0) }
      section.addEventListener('pointermove', move, { passive: true })
      section.addEventListener('pointerleave', reset)

      // Only the illustration moves on scroll; document flow stays native.
      gsap.to('.infinity-art', {
        y: -24,
        ease: 'none',
        scrollTrigger: { trigger: section, start: 'top top', end: 'bottom top', scrub: true },
      })
      return () => {
        observer.disconnect()
        document.removeEventListener('visibilitychange', playAmbient)
        section.removeEventListener('pointermove', move)
        section.removeEventListener('pointerleave', reset)
      }
    }, section)
    return () => media.revert()
  }, [sectionRef])
}
