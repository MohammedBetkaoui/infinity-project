import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function useAivexMobileMotion(pageRef, ready) {
  useLayoutEffect(() => {
    if (!ready) return
    const root = pageRef.current
    const media = gsap.matchMedia()

    media.add({
      small: '(max-width: 799px)',
      touch: '(pointer: coarse)',
      reduced: '(prefers-reduced-motion: reduce)',
    }, ({ conditions }) => {
      if (conditions.reduced || !(conditions.small || conditions.touch)) return
      const scene = root.querySelector('.ax-scene')
      scene.dataset.mobileMotion = 'true'

      // The finger is the clock: no pin, extra inertia or animation loop on a phone.
      gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          id: 'aivex-mobile-depth', trigger: '.ax-scene-viewport',
          start: 'top bottom', end: 'bottom top', scrub: true,
          onToggle: trigger => { scene.dataset.mobileActive = String(trigger.isActive) },
        },
      })
        .fromTo('.ax-scene-scroll', { y: 14, rotation: -.65, scale: .978 }, { y: -18, rotation: .65, scale: 1.018, duration: 1 }, 0)
        .fromTo('.ax-orbit-turn-back', { rotation: -24 }, { rotation: 42, duration: 1 }, 0)

      // Two offset sheets gather into a working prototype. The readable code stays still.
      gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          id: 'aivex-mobile-workbench', trigger: '.ax-code-perspective',
          start: 'top 92%', end: 'center 56%', scrub: true,
        },
      })
        .fromTo('.ax-code-layer-back', { x: 0, y: 0, z: 0, rotation: 0 }, { x: 12, y: -10, rotation: -1.1, duration: 1 }, 0)
        .fromTo('.ax-code-layer-mid', { x: 0, y: 0, z: 0, rotation: 0 }, { x: 6, y: -5, rotation: .45, duration: 1 }, .12)

      return () => {
        delete scene.dataset.mobileMotion
        delete scene.dataset.mobileActive
      }
    }, root)

    return () => media.revert()
  }, [pageRef, ready])
}
