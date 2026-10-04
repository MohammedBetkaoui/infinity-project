import { useLayoutEffect } from 'react'
import useMotionPreference from './useMotionPreference'
import { cancelScrollRefresh, requestScrollRefresh } from '../lib/scrollRefresh'

// GSAP's power curves as cubic-béziers.
const EASE = {
  out: 'cubic-bezier(.33, 1, .68, 1)', // power2.out
  inOut: 'cubic-bezier(.65, 0, .35, 1)', // power2.inOut
  travel: 'cubic-bezier(.76, 0, .24, 1)', // power3.inOut
}

// The home loader does not cut away: its emblem flies into the Hero's mark
// under the actions ([data-home-logo-target]) while the backdrop dissolves
// around it, and the Hero takes over at the exact same rectangle.
// Every move is a Web Animation of transform or opacity, which the compositor
// plays on its own: the main thread is busy during the handoff (the Hero's
// light starts, the scrollbar comes back), and a flight driven frame by frame
// from script stopped with each long task, then started again.
export default function useHomeLogoHandoff(loaderRef, ready, onComplete) {
  const reduced = useMotionPreference()

  useLayoutEffect(() => {
    if (!ready) return undefined
    const loader = loaderRef.current
    const mark = loader.querySelector('.home-loader-mark')
    const destination = document.querySelector('[data-home-logo-target]')
    const artwork = destination?.querySelector('svg')
    const originalVisibility = destination?.style.visibility
    const animations = []
    let disposed = false
    let finished = false
    let frame

    const finish = () => {
      if (disposed || finished) return
      finished = true
      // Swap in one frame: the Hero mark appears as the flying one leaves.
      if (destination) destination.style.visibility = originalVisibility
      mark.style.opacity = '0'
      // The measurements held back during the flight (see start) run now.
      requestScrollRefresh()
      onComplete()
    }
    const play = (node, keyframes, options) => {
      animations.push(node.animate(keyframes, { fill: 'forwards', ...options }))
    }
    // Cancelled animations reject: the cleanup below owns that case.
    const settle = () => Promise.all(animations.map((animation) => animation.finished)).then(finish, () => {})

    const start = () => {
      if (disposed || finished) return
      const from = mark.getBoundingClientRect()
      const target = artwork?.getBoundingClientRect()
      const canTravel = !reduced && target?.width > 0 && target.top >= 0 && target.bottom <= innerHeight
      loader.dataset.handoff = canTravel ? 'travel' : 'fade'
      if (!canTravel) {
        // Deep links (the page re-aligned under the loader) and reduced motion
        // simply uncover the page.
        play(loader, { opacity: [1, 0] }, { duration: reduced ? 250 : 500, easing: EASE.out })
        settle()
        return
      }

      // A resize, a scroll or a late font would move the slot: reveal the
      // page instead of landing on an outdated rectangle.
      window.addEventListener('resize', finish, { passive: true })
      window.addEventListener('scroll', finish, { passive: true })
      document.fonts.addEventListener('loadingdone', finish)
      // The scrollbar that came back with the ready commit has scheduled a
      // ScrollTrigger refresh, a long task the Hero's rising light would
      // stall on: it runs once the emblem has landed instead (see finish).
      cancelScrollRefresh()
      destination.style.visibility = 'hidden'
      const x = target.left + target.width / 2 - (from.left + from.width / 2)
      const y = target.top + target.height / 2 - (from.top + from.height / 2)
      // The running light settles and the emblem fills to the Hero's mint
      // as it sets off, so it lands identical to the mark it replaces.
      play(loader.querySelector('.home-loader-glow'), { opacity: [1, 0] }, { duration: 450, easing: EASE.out })
      play(loader.querySelector('.home-loader-shape'), { opacity: [.22, 1] }, { duration: 500, easing: EASE.out })
      play(mark, { transform: ['none', `translate(${x}px, ${y}px) scale(${target.width / from.width})`] }, { duration: 1000, delay: 100, easing: EASE.travel })
      // The Hero rises out of the same dark ground as the mark settles: the
      // mark crosses the copy and the actions while they are still veiled
      // (over 80% opaque), and the page lights up around it as it lands.
      play(loader.querySelector('.home-loader-backdrop'), { opacity: [1, 0] }, { duration: 850, delay: 500, easing: EASE.inOut })
      settle()
    }

    // Start on the frame after the ready commit (as the AIVEX handoff does):
    // that commit releases the scroll lock, so the scrollbar is back and the
    // slot is final before it is measured.
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(start) })
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', finish)
      window.removeEventListener('scroll', finish)
      document.fonts.removeEventListener('loadingdone', finish)
      animations.forEach((animation) => animation.cancel())
      if (destination) destination.style.visibility = originalVisibility
      delete loader.dataset.handoff
    }
  }, [loaderRef, ready, reduced, onComplete])
}
