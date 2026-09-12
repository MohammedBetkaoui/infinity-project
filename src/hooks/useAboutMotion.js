import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function useAboutMotion(sectionRef) {
  useLayoutEffect(() => {
    const section = sectionRef.current
    const notebook = section.querySelector('.workshop-notes')
    const media = gsap.matchMedia()

    media.add({
      all: 'all',
      reduced: '(prefers-reduced-motion: reduce)',
      narrow: '(max-width: 767px)',
    }, (context) => {
      const { reduced, narrow } = context.conditions
      section.dataset.aboutMotion = reduced ? 'static' : 'scrub'
      if (reduced) return () => { delete section.dataset.aboutMotion }

      const titleInk = section.querySelectorAll('.notebook-title-ink')
      const connections = section.querySelectorAll('.notebook-route-ink')
      const closingInk = section.querySelector('.notebook-sticky-ink')
      const washes = section.querySelectorAll('.notebook-node-wash')
      const paper = section.querySelector('.notebook-sheet')
      const note = section.querySelector('.workshop-sticky')

      for (const path of [...titleInk, ...connections, closingInk]) {
        const length = path.getTotalLength()
        gsap.set(path, { strokeDasharray: length, strokeDashoffset: length })
      }
      gsap.set(washes, { opacity: 0 })

      // The notebook is the trigger, not the section: on mobile the prose comes first.
      const scene = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          id: 'infinity-notebook',
          trigger: notebook,
          start: narrow ? 'top 86%' : 'top 82%',
          end: narrow ? 'bottom 36%' : 'bottom 47%',
          scrub: true,
          invalidateOnRefresh: true,
        },
      })

      // Small paper adjustments suggest a desk, without turning reading into a reveal.
      scene.fromTo(paper, { rotation: narrow ? -2.1 : -3.6, y: narrow ? 0 : 7 },
        { rotation: -1.2, y: 0, duration: .48 }, 0)
        .to(titleInk, { strokeDashoffset: 0, duration: .17, stagger: .045 }, .025)
        .to(washes[0], { opacity: 1, duration: .11 }, .19)
        .to(connections[0], { strokeDashoffset: 0, duration: .23 }, .25)
        .to(washes[1], { opacity: 1, duration: .11 }, .44)
        .to(connections[1], { strokeDashoffset: 0, duration: .23 }, .51)
        .to(washes[2], { opacity: 1, duration: .11 }, .7)
        .fromTo(note, { rotation: narrow ? 3 : 5.2, y: narrow ? 4 : 10 },
          { rotation: 1.8, y: 0, duration: .36 }, .6)
        .to(closingInk, { strokeDashoffset: 0, duration: .18 }, .82)

      return () => { delete section.dataset.aboutMotion }
    }, section)

    return () => media.revert()
  }, [sectionRef])
}
