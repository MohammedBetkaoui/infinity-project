import useScrollAnimations from '../../hooks/useScrollAnimations'

export default function useCommunityScrollMotion(pageRef) {
  useScrollAnimations(pageRef, (motion) => {
    const page = pageRef.current
    page.querySelectorAll('.team-gallery-heading h2, .community-life-intro h2, .community-invitation h2')
      .forEach((title) => motion.revealText(title))
    page.querySelectorAll('.team-gallery-heading > p, .community-life-intro > p, .community-invitation-copy > p')
      .forEach((copy) => motion.revealText(copy, { type: 'lines' }))
    // Scroll owns the outer frame; Framer Motion owns the inner, draggable portrait.
    // In viewport mode (like Home) the group enters together when the stage
    // does; `trigger` groups, `stagger` cascades.
    motion.revealSection('.team-frame-reveal', {
      mode: 'depth', trigger: page.querySelector('.team-stage'), stagger: .065,
    })
    page.querySelectorAll('.team-frame-scroll').forEach((frame, index) => {
      motion.parallaxElement(frame, .08 + Math.abs(index - 3) * .035, {
        trigger: page.querySelector('.team-stage'), axis: 'y',
      })
    })
    motion.revealSection('.team-caption-row', { mode: 'fade' })
    motion.revealSection('.team-name-selector', { mode: 'fade' })
    motion.revealSection('.community-life-signature', { mode: 'wipe' })
    page.querySelectorAll('.community-contributions article').forEach((item) => {
      motion.revealText(item.querySelector('h3'))
      motion.revealText(item.querySelector('p'), { type: 'lines' })
    })
    motion.revealSection('.community-life-note', { mode: 'fade' })
    motion.revealSection('.community-invitation-signoff', { mode: 'fade' })
    motion.revealAllText()
  })
}
