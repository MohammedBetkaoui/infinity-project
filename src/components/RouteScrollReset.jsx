import { useLayoutEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function RouteScrollReset() {
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    // Reset before the new page measures its scroll scenes; each page aligns its own fragment afterwards.
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}
