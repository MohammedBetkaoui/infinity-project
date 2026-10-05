import useScrollAnimations from '../../hooks/useScrollAnimations'

export default function useAboutPageMotion(pageRef) {
  useScrollAnimations(pageRef, (motion) => {
    const page = pageRef.current
    page.querySelectorAll('h2').forEach((title) => motion.revealText(title))
    page.querySelectorAll('.about-story-prose p, .about-principle-ledger p, .about-fields-heading > p, .about-closing-action > p')
      .forEach((copy) => motion.revealText(copy, { type: 'lines' }))
    motion.revealSection('.about-story-margin', { mode: 'horizontal', color: '#e7dfcf' })
    motion.revealSection('.about-process-track', { mode: 'fade' })
    page.querySelectorAll('.about-fields-ledger > li').forEach((row) => motion.revealSection(row, { mode: 'fade' }))
    // Every remaining heading and paragraph gets the scroll choreography.
    motion.revealAllText()
  })
}
