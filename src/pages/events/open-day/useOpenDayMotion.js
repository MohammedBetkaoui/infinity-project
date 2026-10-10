import useScrollAnimations from '../../../hooks/useScrollAnimations'

export default function useOpenDayMotion(pageRef) {
  useScrollAnimations(pageRef, (motion) => {
    const { gsap, reduced, compact } = motion

    // Every reveal starts from fully usable base CSS. The shared motion layer
    // owns cleanup and responds live when reduced motion changes.
    motion.revealSection('.od-hero-image', { mode: 'horizontal', color: '#002a1e', once: true })
    motion.revealSection('.od-date > span', { mode: 'fade', trigger: pageRef.current.querySelector('.od-date'), stagger: .08, once: true })
    motion.revealSection('[data-od-reveal]', { mode: 'depth', once: true })
    motion.revealSection('[data-gallery-card]', { mode: 'depth', once: true })
    motion.revealSection('.od-feature-screen-column', { mode: 'depth', once: true })
    // The screen opens like a shutter lifting off the projection.
    motion.revealSection('.od-feature-frame', { mode: 'wipe', color: '#00170f', once: true })
    motion.revealSection('.od-feature-context > *, .od-feature-chapters > *', { mode: 'fade', trigger: pageRef.current.querySelector('.od-feature-layout'), stagger: .07, once: true })
    motion.revealSection('.od-intro-copy > p, .od-play-heading > p, .od-spin-copy > p, .od-gallery-note, .od-closing-bottom > *', { mode: 'fade', once: true })

    pageRef.current.querySelectorAll('.od-intro h2, .od-moment-copy h3, .od-play h2, .od-spin h2, .od-gallery h2, .od-closing h2, .od-feature-heading h2')
      .forEach((heading) => motion.revealText(heading, { once: true, drift: false }))
    if (reduced) return

    const intro = gsap.timeline({ defaults: { ease: 'expo.out' } })
    intro
      .from('.od-rail', { opacity: 0, y: -12, duration: .7 }, 0)
      .from('.od-hero-copy > .od-label', { opacity: 0, y: 12, duration: .65 }, .08)
      .from('.od-title-word', { yPercent: 108, rotation: 2, duration: 1.05, stagger: .13 }, .12)
      .from('.od-hero-lead', { opacity: 0, y: 18, duration: .7 }, .46)
      .from('.od-hero-actions', { opacity: 0, y: 12, duration: .7 }, .58)
      .from('.od-hero-foot', { opacity: 0, duration: .7 }, .7)

    // Slow image settling gives the supplied photos depth without changing
    // their crop or obscuring the people and activities in them.
    pageRef.current.querySelectorAll('.od-photo-media img, .od-sheet-image img').forEach((image) => {
      gsap.fromTo(image, { scale: 1.055 }, {
        scale: 1,
        ease: 'none',
        scrollTrigger: { trigger: image, start: 'top 96%', end: 'bottom 32%', scrub: .55 },
      })
    })

    if (!compact) {
      gsap.to('.od-hero-print', { y: -34, rotation: .8, ease: 'none', scrollTrigger: { trigger: '.od-hero', start: 'top top', end: 'bottom top', scrub: .7 } })
      gsap.fromTo('.od-feature-heading', { y: 18 }, { y: -18, ease: 'none', scrollTrigger: { trigger: '.od-feature', start: 'top bottom', end: 'bottom top', scrub: .65 } })
      // A slow dolly-in: the screen settles to full size as it reaches the middle.
      gsap.fromTo('.od-feature-stage', { scale: .93 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.od-feature-layout', start: 'top bottom', end: 'center center', scrub: .6 } })
      pageRef.current.querySelectorAll('.od-margin-note, .od-intro-register').forEach((note) => {
        gsap.fromTo(note, { x: -10 }, { x: 0, ease: 'none', scrollTrigger: { trigger: note, start: 'top 85%', end: 'top 45%', scrub: .5 } })
      })
    }
  })
}
