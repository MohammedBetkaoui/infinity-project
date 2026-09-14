import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import useScrollAnimations from '../../hooks/useScrollAnimations'

gsap.registerPlugin(ScrollTrigger)

export default function useContactMotion(pageRef) {
  useScrollAnimations(pageRef, (motion) => {
    pageRef.current.querySelectorAll('h2').forEach((title) => motion.revealText(title))
    pageRef.current.querySelectorAll('.contact-channel > p, .contact-campus-address > p')
      .forEach((copy) => motion.revealText(copy, { type: 'lines' }))
    pageRef.current.querySelectorAll('.contact-reason').forEach((row) => motion.revealSection(row, { mode: 'fade' }))
  })
  useLayoutEffect(() => {
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const rule = pageRef.current.querySelector('.contact-directory-rule i')
      gsap.fromTo(rule, { scaleX: 0 }, {
        scaleX: 1, ease: 'none',
        scrollTrigger: {
          trigger: '.contact-directory-layout', start: 'top 85%', end: 'bottom 78%',
          scrub: true, invalidateOnRefresh: true,
        },
      })
    }, pageRef)
    return () => media.revert()
  }, [pageRef])
}
