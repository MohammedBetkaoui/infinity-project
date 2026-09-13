import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { navigation } from '../data/siteData'
import { GSAP_EASE } from '../lib/motion'
import NavigationLink from './NavigationLink'

export default function DesktopNavigation({ activeHref, reduced }) {
  const linksRef = useRef(null)
  const markerRef = useRef(null)
  const initialized = useRef(false)

  useLayoutEffect(() => {
    const links = linksRef.current
    const marker = markerRef.current
    const active = links.querySelector('[aria-current="location"]')
    const place = (animate) => {
      if (!active || !links.getClientRects().length) return
      gsap.to(marker, {
        x: active.offsetLeft + 9,
        scaleX: active.offsetWidth - 18,
        opacity: 1,
        duration: animate && initialized.current && !reduced ? .34 : 0,
        ease: GSAP_EASE.smooth,
        overwrite: true,
      })
      initialized.current = true
    }
    place(true)
    // Only real layout changes (fonts, viewport) remeasure the active underline.
    let previousWidth = links.offsetWidth
    const observer = new ResizeObserver(() => {
      const width = links.offsetWidth
      if (width === previousWidth) return
      previousWidth = width
      place(false)
    })
    observer.observe(links)
    return () => { observer.disconnect(); gsap.killTweensOf(marker) }
  }, [activeHref, reduced])

  return (
    <div ref={linksRef} className="nav-links">
      {navigation.map((item) => (
        <NavigationLink key={item.href} item={item} className="nav-link"
          aria-current={activeHref === item.href ? 'location' : undefined}>{item.label}</NavigationLink>
      ))}
      <span ref={markerRef} className="nav-active-line" aria-hidden="true" />
    </div>
  )
}
