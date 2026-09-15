import { useEffectEvent, useLayoutEffect, useState } from 'react'
import gsap from 'gsap'
import { createScrollAnimations } from '../lib/scrollAnimations'
import { requestScrollRefresh } from '../lib/scrollRefresh'

export default function useScrollAnimations(scopeRef, configure, { enabled = true, rebuildKey = null } = {}) {
  const configureScene = useEffectEvent(configure)
  const [fontCycle, setFontCycle] = useState(0)
  // First open with slow webfonts: SplitText measured fallback metrics, so
  // line masks clip the real glyphs once they swap in. Re-run the scene once
  // fonts settle — scrub progress is recomputed from scroll, nothing jumps.
  // Skipped when fonts were already final before the first split.
  useLayoutEffect(() => {
    if (document.fonts.status === 'loaded') return
    let disposed = false
    document.fonts.ready.then(() => { if (!disposed) setFontCycle(1) })
    return () => { disposed = true }
  }, [])
  const sceneKey = rebuildKey == null ? fontCycle : `${rebuildKey}:${fontCycle}`
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
  }, [scopeRef, enabled, sceneKey])
}
