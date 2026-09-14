import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAnimationContext } from '../lib/AnimationContext'

export default function RouteScrollReset() {
  const { pathname } = useLocation()
  const lenis = useAnimationContext()
  useLayoutEffect(() => {
    // Reset before the new page measures its scroll scenes; each page aligns its own fragment afterwards.
    if (lenis?.current) lenis.current.scrollTo(0, { immediate: true, force: true })
    else window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname, lenis])
  return null
}
