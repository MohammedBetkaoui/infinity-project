import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import useMotionPreference from '../../hooks/useMotionPreference'

export default function useAivexLogoHandoff(loaderRef, ready, onComplete) {
  const reduced = useMotionPreference()

  useLayoutEffect(() => {
    if (!ready) return
    const loader = loaderRef.current
    const mark = loader.querySelector('.aivex-loader-mark')
    const tiles = [...mark.querySelectorAll('.aivex-loader-tile')]
    const destination = document.querySelector('[data-aivex-logo-target]')
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
      if (destination) destination.style.visibility = originalVisibility
      mark.style.opacity = '0'
      onComplete(true)
    }

    const start = () => context.add(() => {
      if (disposed || finished) return
      const target = artwork?.getBoundingClientRect()
      const canTravel = !reduced && tiles.length > 0 && target?.width > 0 && target.top >= 0 && target.bottom <= innerHeight
      loader.dataset.handoff = canTravel ? 'travel' : 'fade'
      if (!canTravel) {
        timeline = gsap.timeline({ onComplete: finish })
          .to(loader, { opacity: 0, duration: reduced ? .14 : .25, ease: 'power2.out' })
        return
      }

      // A resize or an early scroll should reveal the page, not chase an outdated
      // target. Only the flight depends on geometry: a fade (deep links, whose
      // page re-aligns under the loader) is left to finish on its own.
      window.addEventListener('resize', finish, { passive: true })
      window.addEventListener('scroll', finish, { passive: true })
      document.fonts.addEventListener('loadingdone', finish)
      // Keep the moving letters intact; the Hero takes over at the exact same rectangle.
      gsap.set(destination, { visibility: 'hidden' })
      // Each tile is a window on the same artwork as the Hero lockup, so it can
      // fly to its own letter slot there: the gaps close as the letters land and
      // the five tiles fuse into the logo, with no jump at the swap.
      const artBox = artwork.viewBox.baseVal
      const unitX = target.width / artBox.width
      const unitY = target.height / artBox.height
      const flights = tiles.map((tile) => {
        // Freeze the snake where it is, so the wave flows straight into the flight.
        const { transform, opacity } = getComputedStyle(tile)
        gsap.set(tile, { animation: 'none', transform, opacity, transformOrigin: '0 0' })
        const rect = tile.getBoundingClientRect()
        const slot = tile.querySelector('svg').viewBox.baseVal
        return {
          x: target.left + (slot.x - artBox.x) * unitX - rect.left,
          y: target.top + (slot.y - artBox.y) * unitY - (rect.top - gsap.getProperty(tile, 'y')),
          scaleX: slot.width * unitX / rect.width,
          scaleY: slot.height * unitY / rect.height,
        }
      })
      const flight = (key) => (index) => flights[index][key]
      timeline = gsap.timeline({ onComplete: finish })
        .to('.aivex-loader-caption > *', { y: 8, opacity: 0, duration: .28, stagger: .05, ease: 'power2.in' }, 0)
        .to('.aivex-loader-caption', { borderTopColor: 'rgba(239, 237, 232, 0)', duration: .34, ease: 'power2.in' }, 0)
        // One shared progress for every tile: the wave flattens and the gaps
        // close steadily on the way, so the row never scatters mid-flight.
        .to(tiles, {
          x: flight('x'),
          y: flight('y'),
          scaleX: flight('scaleX'),
          scaleY: flight('scaleY'),
          opacity: 1,
          duration: 1,
          ease: 'power3.inOut',
        }, .04)
        .to('.aivex-loader-backdrop', { opacity: 0, duration: .7, ease: 'power2.inOut' }, .2)
    })

    // The ready commit also mounts the page's scroll motion, which blocks the
    // main thread for about half a second. Starting on the frame after keeps
    // the flight whole: a timeline created before that stall would jump ahead
    // (or sit frozen) once it ends. Meanwhile the snake keeps waving. The Hero
    // intro waits for the same frame (see useAivexExperience).
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
