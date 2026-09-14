import { useEffectEvent, useLayoutEffect } from 'react'
import gsap from 'gsap'
import { createScrollAnimations } from '../lib/scrollAnimations'
import { requestScrollRefresh } from '../lib/scrollRefresh'

export default function useScrollAnimations(scopeRef, configure, { enabled = true, rebuildKey = null } = {}) {
  const configureScene = useEffectEvent(configure)
  useLayoutEffect(() => {
    if (!enabled || !scopeRef.current) return
    const media = gsap.matchMedia()
    media.add({
      all: 'all', reduced: '(prefers-reduced-motion: reduce)',
      compact: '(max-width: 767px), (pointer: coarse)',
      spacious: '(min-width: 1024px) and (min-height: 760px)',
    }, ({ conditions }) => {
      const api = createScrollAnimations(scopeRef.current, {
        compact: conditions.compact, reduced: conditions.reduced,
        canPin: conditions.spacious && !conditions.compact && !conditions.reduced,
      })
      const cleanup = configureScene(api)
      requestScrollRefresh()
      return () => { if (typeof cleanup === 'function') cleanup(); api.cleanup() }
    }, scopeRef)
    // matchMedia owns a GSAP context for each responsive mode, including StrictMode cleanup.
    return () => media.revert()
  }, [scopeRef, enabled, rebuildKey])
}
