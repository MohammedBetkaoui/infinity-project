import useScrollAnimations from '../../../hooks/useScrollAnimations'

export default function useOpenDayMotion(pageRef) {
  // The shared hook handles GSAP cleanup and live reduced-motion changes.
  // Base CSS is fully visible; no content depends on a reveal completing.
  useScrollAnimations(pageRef, (motion) => {
    const { gsap, reduced, compact } = motion
    motion.revealSection('.od-hero-image', { mode: 'horizontal', color: '#002a1e', once: true })
    motion.revealSection('.od-date > span', { mode: 'fade', trigger: pageRef.current.querySelector('.od-date'), stagger: .08, once: true })
    motion.revealSection('[data-od-reveal]', { mode: 'fade', once: true })
    pageRef.current.querySelectorAll('.od-intro h2, .od-moment-copy h3, .od-play h2, .od-spin h2, .od-gallery h2, .od-closing h2, .od-films-heading h2, .od-feature-heading h2, .od-feature-kicker')
      .forEach((heading) => motion.revealText(heading, { once: true, drift: false }))
    if (reduced) return
    gsap.from('.od-title-word', { yPercent: 108, rotation: 2, duration: 1.05, stagger: .13, ease: 'expo.out', delay: .08 })
    gsap.from('.od-hero-actions', { opacity: 0, y: 12, duration: .7, ease: 'power3.out', delay: .5 })
    // A short cover movement, two margin notes and the film register; the
    // photographs themselves keep their original framing and do not parallax.
    if (!compact) {
      gsap.to('.od-hero-print', { y: -32, rotation: 1.2, ease: 'none', scrollTrigger: { trigger: '.od-hero', start: 'top top', end: 'bottom top', scrub: .6 } })
      gsap.fromTo('.od-film-marquee span', { xPercent: 3 }, { xPercent: -12, ease: 'none', scrollTrigger: { trigger: '.od-films', start: 'top bottom', end: 'bottom top', scrub: .5 } })
      pageRef.current.querySelectorAll('.od-margin-note, .od-intro-register').forEach((note) => {
        gsap.fromTo(note, { x: -10 }, { x: 0, ease: 'none', scrollTrigger: { trigger: note, start: 'top 85%', end: 'top 45%', scrub: .5 } })
      })
    }
    pageRef.current.querySelectorAll('.od-film-note-rule i').forEach((line) => {
      gsap.fromTo(line, { scaleX: 0 }, { scaleX: 1, transformOrigin: 'left', ease: 'none', scrollTrigger: { trigger: line.closest('.od-film-note'), start: 'top 65%', end: 'bottom 40%', scrub: true } })
    })
  })
}
