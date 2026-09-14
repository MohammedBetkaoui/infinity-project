import gsap from 'gsap'

const gestureFor = (gesture, compact) => {
  const travel = compact ? 7 : 16
  const gestures = {
    title: { enter: { x: travel }, rest: { x: 0 }, leave: { x: -travel * .72 } },
    copy: { enter: { x: -travel * .72 }, rest: { x: 0 }, leave: { x: travel * .48 } },
    depth: {
      enter: { y: compact ? 8 : 20, scale: compact ? .994 : .978 },
      rest: { y: 0, scale: 1 },
      leave: { y: compact ? -5 : -13, scale: compact ? .997 : .988 },
    },
    still: { enter: {}, rest: {}, leave: {} },
  }
  return gestures[gesture] || gestures.still
}

export function createScrollReveal(target, { id, gesture = 'still', trigger = target, compact = false }) {
  const motion = gestureFor(gesture, compact)
  const rest = { opacity: 1, ...motion.rest }
  target.dataset.scrollReveal = gesture

  // A long reading plateau separates the entrance from the departure.
  // One scrubbed timeline owns both directions, so reverse scroll is exact.
  const timeline = gsap.timeline({
    scrollTrigger: {
      id,
      trigger,
      start: 'clamp(top 98%)',
      end: 'clamp(bottom 5%)',
      scrub: true,
      invalidateOnRefresh: true,
    },
  })
  timeline
    .fromTo(target, { opacity: 0, ...motion.enter }, {
      ...rest,
      duration: .18,
      ease: 'power2.out',
    })
    .to(target, { ...rest, duration: .66, ease: 'none' })
    .to(target, { opacity: 0, ...motion.leave, duration: .16, ease: 'power2.in' })

  return () => { delete target.dataset.scrollReveal }
}
