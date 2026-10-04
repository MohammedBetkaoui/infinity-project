import { useCallback, useEffect, useState } from 'react'

// The loader introduces Home once per visit: coming back to Home from another
// page goes straight to the Hero.
let introPlayed = false
const MINIMUM_LOADING_MS = 1500
// The Hero, and the emblem's slot in it, is laid out with the webfonts; a slow
// font must not hold the page longer than this.
const FONT_TIMEOUT_MS = 3200

export default function useHomeIntro() {
  const [loading, setLoading] = useState(() => !introPlayed)
  const [minimumElapsed, setMinimumElapsed] = useState(false)
  const [fontsReady, setFontsReady] = useState(false)
  const ready = loading && minimumElapsed && fontsReady
  const locked = loading && !ready

  useEffect(() => {
    if (!loading) return undefined
    let disposed = false
    const minimum = window.setTimeout(() => setMinimumElapsed(true), MINIMUM_LOADING_MS)
    const timeout = window.setTimeout(() => setFontsReady(true), FONT_TIMEOUT_MS)
    document.fonts.ready.then(() => { if (!disposed) setFontsReady(true) })
    return () => {
      disposed = true
      window.clearTimeout(minimum)
      window.clearTimeout(timeout)
    }
  }, [loading])

  // Released as the handoff begins rather than after the landing: the
  // scrollbar Lenis hides while stopped comes back under the opaque loader,
  // before the emblem's slot is measured, so nothing shifts once it lands.
  useEffect(() => {
    if (!locked) return undefined
    window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: true } }))
    return () => window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: false } }))
  }, [locked])

  const complete = useCallback(() => {
    introPlayed = true
    setLoading(false)
  }, [])

  return { loading, ready, complete }
}
