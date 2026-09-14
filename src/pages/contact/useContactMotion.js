import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function useContactMotion(pageRef) {
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
