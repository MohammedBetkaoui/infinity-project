import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function useClubMosaicMotion(galleryRef) {
  useLayoutEffect(() => {
    const media = gsap.matchMedia()
    media.add({
      motion: '(prefers-reduced-motion: no-preference)',
      desktop: '(min-width: 1024px)',
    }, ({ conditions }) => {
      if (!conditions.motion) return
      const frames = galleryRef.current.querySelectorAll('.club-moments-frame')
      const depths = [
        { from: -13, to: 13, angle: -1.15, turn: 2.1 },
        { from: 10, to: -10, angle: .85, turn: -1.8 },
        { from: -7, to: 7, angle: -.45, turn: -1.1 },
      ]
      // The photographs sit at different depths, but the reading flow never changes height.
      const scene = gsap.timeline({
        scrollTrigger: { id: 'home-club-photos', trigger: galleryRef.current, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
        defaults: { ease: 'none' },
      })
      frames.forEach((frame, index) => {
        const depth = depths[index]
        scene.fromTo(frame,
          { y: depth.from * (conditions.desktop ? 1.5 : .35), rotation: conditions.desktop ? depth.angle : 0, rotationY: conditions.desktop ? depth.turn : 0 },
          { y: depth.to * (conditions.desktop ? 1.5 : .35), rotation: conditions.desktop ? depth.angle * .5 : 0, rotationY: conditions.desktop ? -depth.turn : 0, duration: 1 }, 0)
      })
    }, galleryRef)
    return () => media.revert()
  }, [galleryRef])
}
