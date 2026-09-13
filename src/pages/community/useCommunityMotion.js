import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function useCommunityMotion(pageRef) {
  useLayoutEffect(() => {
    const media = gsap.matchMedia()
    media.add({ desktop: '(min-width: 768px)', reduced: '(prefers-reduced-motion: reduce)' }, ({ conditions }) => {
      if (conditions.reduced || !conditions.desktop) return
      const scene = pageRef.current.querySelector('.community-wall-scene')
      const plane = scene.querySelector('.community-wall-plane')
      // The portrait wall meets the reading plane; no pin, hidden content or extra scroll distance.
      gsap.fromTo(plane, { rotationX: 6.4, y: 22 }, {
        rotationX: 0, y: 0, ease: 'none',
        scrollTrigger: { trigger: scene, start: 'top 92%', end: 'top 28%', scrub: true, invalidateOnRefresh: true },
      })
    }, pageRef.current)
    return () => media.revert()
  }, [pageRef])
}
