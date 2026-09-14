import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function useClubMosaicMotion(galleryRef) {
  useLayoutEffect(() => {
    const media = gsap.matchMedia()
    media.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
      const frames = galleryRef.current.querySelectorAll('.club-moments-frame')
      const depths = [
        { from: -13, to: 13, angle: -1.15, turn: 2.1 },
        { from: 10, to: -10, angle: .85, turn: -1.8 },
        { from: -7, to: 7, angle: -.45, turn: -1.1 },
      ]
      // The photographs sit at different depths, but the reading flow never changes height.
      const scene = gsap.timeline({
        scrollTrigger: { trigger: galleryRef.current, start: 'top bottom', end: 'bottom top', scrub: true },
        defaults: { ease: 'none' },
      })
      frames.forEach((frame, index) => {
        const depth = depths[index]
        scene.fromTo(frame,
          { y: depth.from, rotation: depth.angle, rotationY: depth.turn },
          { y: depth.to, rotation: depth.angle * .5, rotationY: -depth.turn, duration: 1 }, 0)
      })
    }, galleryRef)
    return () => media.revert()
  }, [galleryRef])
}
