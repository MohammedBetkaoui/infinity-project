import useScrollAnimations from './useScrollAnimations'

export default function useHomeScrollMotion(mainRef) {
  useScrollAnimations(mainRef, ({ revealText, revealAllText, revealSection, select, reduced, gsap }) => {
    select('.section-intro > p, .poles-note > span, .home-events-heading > p, .club-life-copy > p').forEach((node) => revealText(node, { type: 'lines' }))
    select('.section-intro h2, .home-events-heading h2, .club-life-copy h2, #contact h2').forEach((node) => revealText(node))
    // Same display choreography as the AIVEX links; the box stays put.
    select('.poles-note a').forEach((node) => revealText(node, { drift: false }))
    select('.club-life-link').forEach((node) => revealText(node, { drift: false }))
    select('.home-event-action').forEach((node) => revealText(node, { drift: false }))
    // Photo frames enter like cards; the crossfading photographs inside keep
    // their own clock, exactly like the AIVEX album layers.
    revealSection('.club-moments-frame', { mode: 'depth', trigger: '.club-moments', stagger: .08 })
    revealSection('.pole-tab', { mode: 'depth', trigger: '.poles-stage', end: 'top 56%', stagger: .07 })
    // The desktop detail card enters like an editorial card; its tab-driven
    // copy keeps its own text choreography inside (see Poles).
    revealSection('.pole-detail-host', { mode: 'fade' })
    revealSection('.home-event-editorial', { mode: 'fade' })
    revealSection('.club-life-values li', { mode: 'fade', trigger: '.club-life-values', stagger: .1 })
    revealSection('.home-faq-item', { mode: 'depth', trigger: '#faq', end: 'top 38%', stagger: .07 })
    revealSection('.contact-invitation', { mode: 'fade' })
    if (!reduced) gsap.fromTo(select('#contact h2 svg'), { scaleX: 0 }, {
      scaleX: 1, transformOrigin: 'left', ease: 'none',
      scrollTrigger: { trigger: '#contact', start: 'top 82%', end: 'top 42%', scrub: true },
    })
    // Sweep up every editorial line the selectors above missed.
    revealAllText()
  })
}
