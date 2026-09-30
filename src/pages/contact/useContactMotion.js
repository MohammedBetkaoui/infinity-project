import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import useScrollAnimations from '../../hooks/useScrollAnimations'

gsap.registerPlugin(ScrollTrigger)

export default function useContactMotion(pageRef) {
  useScrollAnimations(pageRef, (motion) => {
    const page = pageRef.current
    page.querySelectorAll('h2').forEach((title) => motion.revealText(title))
    page.querySelectorAll('.contact-directory-intro > p:not(.contact-overline), .contact-route-intro > p, .contact-campus-copy > p')
      .forEach((copy) => motion.revealText(copy, { type: 'lines' }))
    page.querySelectorAll('.contact-reason').forEach((row) => motion.revealSection(row, { mode: 'fade' }))
    page.querySelectorAll('.contact-message-steps li').forEach((step) => {
      motion.revealText(step.querySelector('h3'))
      motion.revealText(step.querySelector('p'), { type: 'lines' })
    })
    motion.revealSection('.contact-route-map', { mode: 'depth' })
    motion.revealSection('.contact-directory-note', { mode: 'fade' })
    motion.revealSection('.contact-route-footnote', { mode: 'fade' })
    motion.revealSection('.contact-campus-address', { mode: 'fade' })
    motion.revealSection('.contact-campus-signoff', { mode: 'fade' })
    motion.revealAllText()
  })
  useLayoutEffect(() => {
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const route = pageRef.current.querySelector('.contact-route-map')
      const ink = pageRef.current.querySelector('.contact-route-ink')
      gsap.fromTo(ink, { strokeDashoffset: 180 }, {
        strokeDashoffset: 0, ease: 'none',
        scrollTrigger: {
          trigger: route, start: 'top 88%', end: 'bottom 66%',
          scrub: true, invalidateOnRefresh: true,
        },
      })
    }, pageRef)
    return () => media.revert()
  }, [pageRef])
}
