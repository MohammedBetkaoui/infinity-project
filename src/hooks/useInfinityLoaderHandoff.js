import { useEffectEvent, useLayoutEffect } from 'react'
import gsap from 'gsap'
import useMotionPreference from './useMotionPreference'

export default function useInfinityLoaderHandoff(loaderRef, leaving, onComplete) {
  const reduced = useMotionPreference()
  const complete = useEffectEvent(onComplete)

  useLayoutEffect(() => {
    if (!leaving) return undefined
    const loader = loaderRef.current
    const mark = loader.querySelector('.infinity-loader-mark')
    const heroMark = document.querySelector('.hero-emblem .infinity-mark')
    const navigationMark = document.querySelector('.site-header .brand-mark')
    const compact = window.matchMedia('(max-width: 760px)').matches
    const candidates = [navigationMark, heroMark]
    const destination = candidates.find((candidate) => {
      const bounds = candidate?.getBoundingClientRect()
      return bounds?.width > 0 && bounds.top >= 0 && bounds.bottom <= window.innerHeight
    })
    const source = mark.getBoundingClientRect()
    const target = destination?.getBoundingClientRect()
    const canTravel = !reduced && target?.width > 0
    const originalVisibility = destination?.style.visibility
    let finished = false

    const finish = () => {
      if (finished) return
      finished = true
      if (destination) destination.style.visibility = originalVisibility
      complete()
    }

    const context = gsap.context(() => {
      loader.dataset.handoff = canTravel ? 'hero' : 'curtain'
      loader.dataset.handoffTarget = destination === navigationMark ? 'navigation' : 'hero'
      if (!canTravel) {
        gsap.timeline({ onComplete: finish })
          .to('.infinity-loader-shell, .infinity-loader-place', { opacity: 0, y: reduced ? 0 : -12, duration: reduced ? .12 : .3, ease: 'power2.out' })
          .to('.infinity-loader-backdrop', { clipPath: 'inset(0 0 100% 0)', duration: reduced ? .08 : .52, ease: 'power3.inOut' }, reduced ? .04 : .08)
        return
      }

      gsap.set(destination, { visibility: 'hidden' })
      const shape = mark.querySelector('.infinity-mark-shape')
      const signal = mark.querySelector('.infinity-mark-signal')
      gsap.set([shape, signal], { animation: 'none' })
      gsap.set(mark, { transformOrigin: '0 0', willChange: 'transform' })

      gsap.timeline({ onComplete: finish })
        .to('.infinity-loader-top, .infinity-loader-story, .infinity-loader-bottom, .infinity-loader-place', {
          opacity: 0, y: compact ? -6 : -9, duration: compact ? .2 : .24, stagger: .025, ease: 'power2.out',
        }, 0)
        .to('.infinity-loader-backdrop', {
          clipPath: compact ? 'inset(0 0 100% 0 round 0 0 18px 18px)' : 'inset(0 0 100% 0)',
          duration: compact ? .66 : .72,
          ease: 'power3.inOut',
        }, compact ? .08 : .12)
        .to(mark, {
          x: target.left - source.left,
          y: target.top - source.top,
          scaleX: target.width / source.width,
          scaleY: target.height / source.height,
          duration: compact ? .76 : .82,
          ease: 'power3.inOut',
        }, .03)
        .to(shape, { strokeWidth: 13, duration: compact ? .7 : .76, ease: 'power3.inOut' }, .03)
        .to(signal, { strokeWidth: 2.2, opacity: .88, duration: compact ? .7 : .76, ease: 'power3.inOut' }, .03)
    }, loader)

    return () => {
      finished = true
      context.revert()
      if (destination) destination.style.visibility = originalVisibility
      delete loader.dataset.handoff
      delete loader.dataset.handoffTarget
    }
  }, [leaving, loaderRef, reduced])
}
