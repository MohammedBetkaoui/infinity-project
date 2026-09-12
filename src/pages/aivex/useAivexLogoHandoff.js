import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import useMotionPreference from '../../hooks/useMotionPreference'

export default function useAivexLogoHandoff(loaderRef, ready, onComplete) {
  const reduced = useMotionPreference()

  useLayoutEffect(() => {
    if (!ready) return
    const loader = loaderRef.current
    const mark = loader.querySelector('.aivex-loader-mark')
    const destination = document.querySelector('[data-aivex-logo-target]')
    const target = destination?.getBoundingClientRect()
    const source = mark.getBoundingClientRect()
    const canTravel = !reduced && target?.width > 0 && target.top >= 0 && target.bottom <= innerHeight
    let disposed = false
    let finished = false
    let timeline
    const originalVisibility = destination?.style.visibility

    const finish = () => {
      if (disposed || finished) return
      finished = true
      timeline?.kill()
      if (destination) destination.style.visibility = originalVisibility
      mark.style.opacity = '0'
      onComplete(true)
    }

    const context = gsap.context(() => {
      loader.dataset.handoff = canTravel ? 'travel' : 'fade'
      if (!canTravel) {
        timeline = gsap.timeline({ onComplete: finish })
          .to(loader, { opacity: 0, duration: reduced ? .14 : .25, ease: 'power2.out' })
        return
      }

      // Keep the moving logo intact; the Hero takes over at the exact same rectangle.
      gsap.set(destination, { visibility: 'hidden' })
      const tiles = [...mark.querySelectorAll('.ax-letter-tile')]
      const poses = tiles.map(tile => {
        const style = getComputedStyle(tile)
        return { transform: style.transform, opacity: style.opacity }
      })
      tiles.forEach((tile, index) => gsap.set(tile, { animation: 'none', ...poses[index] }))
      gsap.set(mark, { transformOrigin: '0 0', willChange: 'transform' })
      timeline = gsap.timeline({ onComplete: finish })
        .to(tiles, { y: 0, rotationX: 0, opacity: 1, duration: .18, ease: 'power2.out' }, 0)
        .to('.aivex-loader-caption', { opacity: 0, duration: .16 }, 0)
        .to('.aivex-loader-backdrop', { opacity: 0, duration: .52, ease: 'power2.inOut' }, .14)
        .to(mark, {
          x: target.left - source.left,
          y: target.top - source.top,
          scaleX: target.width / source.width,
          scaleY: target.height / source.height,
          duration: .82,
          ease: 'power3.inOut',
        }, .08)
    }, loader)

    // A resize or an early scroll should reveal the page, not chase an outdated target.
    window.addEventListener('resize', finish, { passive: true })
    window.addEventListener('scroll', finish, { passive: true })
    document.fonts.addEventListener('loadingdone', finish)
    return () => {
      disposed = true
      window.removeEventListener('resize', finish)
      window.removeEventListener('scroll', finish)
      document.fonts.removeEventListener('loadingdone', finish)
      context.revert()
      if (destination) destination.style.visibility = originalVisibility
      delete loader.dataset.handoff
    }
  }, [loaderRef, ready, reduced, onComplete])
}
