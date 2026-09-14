import useScrollAnimations from './useScrollAnimations'

export default function useHomeScrollMotion(mainRef) {
  useScrollAnimations(mainRef, ({ revealText, revealSection, select, reduced, gsap }) => {
    select('.section-intro > p, .home-events-heading > p, .club-life-copy > p').forEach((node) => revealText(node, { type: 'lines' }))
    select('.home-events-heading h2, .club-life-copy h2, #contact h2').forEach((node) => revealText(node))
    revealSection('.poles-stage', { mode: 'depth', end: 'top 56%' })
    revealSection('.home-event-editorial', { mode: 'fade' })
    revealSection('.club-life-values li', { mode: 'fade', trigger: '.club-life-values', stagger: .1 })
    revealSection('.home-faq-item', { mode: 'fade', trigger: '#faq', end: 'top 38%', stagger: .07 })
    revealSection('.contact-invitation', { mode: 'fade' })
    if (!reduced) gsap.fromTo(select('#contact h2 svg'), { scaleX: 0 }, {
      scaleX: 1, transformOrigin: 'left', ease: 'none',
      scrollTrigger: { trigger: '#contact', start: 'top 82%', end: 'top 42%', scrub: true },
    })
  })
}
