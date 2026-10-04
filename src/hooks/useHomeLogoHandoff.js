import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import useMotionPreference from './useMotionPreference'

// The home loader does not cut away: its emblem flies into the Hero's mark
// under the actions ([data-home-logo-target]) while the backdrop dissolves
// around it, and the Hero takes over at the exact same rectangle.
export default function useHomeLogoHandoff(loaderRef, ready, onComplete) {
  const reduced = useMotionPreference()

  useLayoutEffect(() => {
    if (!ready) return undefined
    const loader = loaderRef.current
    const mark = loader.querySelector('.home-loader-mark')
    const destination = document.querySelector('[data-home-logo-target]')
    const artwork = destination?.querySelector('svg')
    let disposed = false
    let finished = false
    let timeline
    let frame
    const originalVisibility = destination?.style.visibility
    const context = gsap.context(() => {}, loader)

    const finish = () => {
      if (disposed || finished) return
      finished = true
      timeline?.kill()
      // Swap in one frame: the Hero mark appears as the flying one leaves.
      if (destination) destination.style.visibility = originalVisibility
      mark.style.opacity = '0'
      onComplete()
    }

    const start = () => context.add(() => {
      if (disposed || finished) return
      const from = mark.getBoundingClientRect()
      const target = artwork?.getBoundingClientRect()
      const canTravel = !reduced && target?.width > 0 && target.top >= 0 && target.bottom <= innerHeight
      loader.dataset.handoff = canTravel ? 'travel' : 'fade'
      if (!canTravel) {
        // Deep links (the page re-aligned under the loader) and reduced motion
        // simply uncover the page.
        timeline = gsap.timeline({ onComplete: finish })
          .to(loader, { opacity: 0, duration: reduced ? .25 : .5, ease: 'power2.out' })
        return
      }

      // A resize, a scroll or a late font would move the slot: reveal the
      // page instead of landing on an outdated rectangle.
      window.addEventListener('resize', finish, { passive: true })
      window.addEventListener('scroll', finish, { passive: true })
      document.fonts.addEventListener('loadingdone', finish)
      gsap.set(destination, { visibility: 'hidden' })
      timeline = gsap.timeline({ onComplete: finish })
        // The running light settles and the emblem fills to the Hero's mint
        // as it sets off, so it lands identical to the mark it replaces.
        .to('.home-loader-signal', { opacity: 0, duration: .45, ease: 'power2.out' }, 0)
        .to('.home-loader-shape path', { fillOpacity: 1, duration: .5, ease: 'power2.out' }, 0)
        .to(mark, {
          x: target.left + target.width / 2 - (from.left + from.width / 2),
          y: target.top + target.height / 2 - (from.top + from.height / 2),
          scale: target.width / from.width,
          duration: 1,
          ease: 'power3.inOut',
        }, .1)
        // The Hero rises out of the same dark ground as the mark settles: the
        // mark crosses the copy and the actions while they are still veiled
        // (over 80% opaque), and the page lights up around it as it lands.
        .to('.home-loader-backdrop', { opacity: 0, duration: .85, ease: 'power2.inOut' }, .5)
    })

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
      context.revert()
      if (destination) destination.style.visibility = originalVisibility
      delete loader.dataset.handoff
    }
  }, [loaderRef, ready, reduced, onComplete])
}
