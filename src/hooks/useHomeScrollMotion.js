import useScrollAnimations from './useScrollAnimations'

// Home is viewport-triggered (see SitePage's data-motion-trigger): every
// block below plays its entrance as it comes on screen and resets once it is
// fully out of view, so trigger/start/end ranges are not needed here.
export default function useHomeScrollMotion(mainRef) {
  useScrollAnimations(mainRef, ({ revealText, revealAllText, revealSection, select }) => {
    select('.section-intro > p, .poles-note > span, .home-events-heading > p, .club-life-copy > p').forEach((node) => revealText(node, { type: 'lines' }))
    select('.section-intro h2, .home-events-heading h2, .club-life-copy h2, #contact h2').forEach((node) => revealText(node))
    // Same display choreography as the AIVEX links; the box stays put.
    select('.poles-note a').forEach((node) => revealText(node, { drift: false }))
    select('.club-life-link').forEach((node) => revealText(node, { drift: false }))
    select('.home-event-action').forEach((node) => revealText(node, { drift: false }))
    // Photo frames enter like cards; the crossfading photographs inside keep
    // their own clock, exactly like the AIVEX album layers.
    revealSection('.club-moments-frame', { mode: 'depth' })
    revealSection('.pole-tab', { mode: 'depth' })
    // The desktop detail card enters like an editorial card; its tab-driven
    // copy keeps its own text choreography inside (see Poles).
    revealSection('.pole-detail-host', { mode: 'fade' })
    revealSection('.home-event-editorial', { mode: 'fade' })
    revealSection('.club-life-values li', { mode: 'fade' })
    revealSection('.home-faq-item', { mode: 'depth' })
    revealSection('.contact-invitation', { mode: 'fade' })
    // The underline draws once the heading's words have landed.
    revealSection('#contact h2 svg', { mode: 'draw', trigger: '#contact h2', delay: .35 })
    // Sweep up every editorial line the selectors above missed.
    revealAllText()
  })
}
