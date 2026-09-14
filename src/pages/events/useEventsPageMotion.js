import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import useScrollAnimations from '../../hooks/useScrollAnimations'

gsap.registerPlugin(ScrollTrigger)

export default function useEventsPageMotion(pageRef) {
  useScrollAnimations(pageRef, (motion) => {
    pageRef.current.querySelectorAll('h2').forEach((title) => motion.revealText(title))
    pageRef.current.querySelectorAll('.events-feature-summary, .events-closing-layout p')
      .forEach((copy) => motion.revealText(copy, { type: 'lines' }))
    motion.revealAllText()
  })
  useLayoutEffect(() => {
    const page = pageRef.current
    const media = gsap.matchMedia()

    media.add({
      all: 'all',
      reduced: '(prefers-reduced-motion: reduce)',
      compact: '(max-width: 767px)',
    }, ({ conditions }) => {
      const { reduced, compact } = conditions
      page.dataset.motion = reduced ? 'reduced' : 'active'
      const previews = [...page.querySelectorAll('.events-preview')]
      if (!reduced) {
        previews.forEach((preview) => {
          const depth = preview.querySelector('.events-preview-depth')
          const shadow = preview.querySelector('.events-preview-shadow')
          const edge = preview.querySelector('.events-preview-edge')

          // The whole screenshot settles into a flat reading plane before it reaches the top.
          gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
              trigger: preview, start: 'top 94%', end: compact ? 'top 57%' : 'top 27%',
              scrub: true, invalidateOnRefresh: true,
              onToggle: ({ isActive }) => { preview.dataset.scrollActive = String(isActive) },
            },
          })
            .fromTo(depth, {
              y: compact ? 8 : 24, scale: compact ? .985 : .967,
              rotationX: compact ? 0 : 6.2, rotationY: compact ? 0 : -1.4,
            }, { y: 0, scale: 1, rotationX: 0, rotationY: 0, duration: 1 }, 0)
            .fromTo(shadow, { opacity: .16, scaleX: .93, y: 16 }, { opacity: .07, scaleX: 1, y: 0, duration: 1 }, 0)
            .fromTo(edge, { scaleX: 0 }, { scaleX: 1, duration: 1 }, 0)
        })
      }

      return () => {
        previews.forEach((preview) => { delete preview.dataset.scrollActive })
      }
    }, page)

    return () => { media.revert(); delete page.dataset.motion }
  }, [pageRef])
}
