import gsap from 'gsap'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { shouldReduceMotion } from '../../../lib/motion'

const CHROME = '.od-lightbox-backdrop, .od-lightbox-head, .od-lightbox-figure figcaption, .od-lightbox-controls'

// The print on the sheet and the viewer's image share the photo's ratio, so
// one translate and one uniform scale carry the image between them.
function offsetFrom(origin, image) {
  const from = origin.getBoundingClientRect()
  const to = image.getBoundingClientRect()
  return {
    x: from.left + from.width / 2 - (to.left + to.width / 2),
    y: from.top + from.height / 2 - (to.top + to.height / 2),
    scale: from.width / to.width,
  }
}

// While a photo is "lifted" off the sheet, its print there is hidden.
function lift(store, print) {
  if (store.current) store.current.style.visibility = ''
  store.current = print
  if (print) print.style.visibility = 'hidden'
}

export default function OpenDayLightbox({ photos, index, onChange, onClose, originOf, title = 'Infinity Club / Open Day / 05 OCT 2026', className = '', showThumbnails = false }) {
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const imageRef = useRef(null)
  const openedAt = useRef(index)
  const lifted = useRef(null)
  const flight = useRef([])
  const closing = useRef(false)
  const openingCancelled = useRef(false)
  const touchStart = useRef(null)
  const [browsing, setBrowsing] = useState(false)
  const photo = photos[index]

  useLayoutEffect(() => () => {
    flight.current.forEach((tween) => tween.kill())
    lift(lifted, null)
  }, [])

  // Portal sits outside the inert site shell. Use the site's lock event so
  // Lenis also stops, and restore both the original styles and opener focus.
  useLayoutEffect(() => {
    const root = document.getElementById('root')
    const previousFocus = document.activeElement
    const previousInert = root?.inert
    const { overflow, paddingRight } = document.body.style
    const gutter = window.innerWidth - document.documentElement.clientWidth
    const padding = parseFloat(getComputedStyle(document.body).paddingRight) || 0
    closeRef.current?.focus({ preventScroll: true })
    if (root) root.inert = true
    document.body.style.overflow = 'hidden'
    document.body.style.paddingRight = `${padding + gutter}px`
    window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: true } }))
    return () => {
      if (root) root.inert = previousInert
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
      window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: false } }))
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  // Opening: the photo flies out of its print while the room fades in. The
  // image is measured once decoded, so its box is final before the flight.
  // Explicit fromTo + revert keeps StrictMode's double mount from freezing
  // anything halfway.
  useLayoutEffect(() => {
    if (shouldReduceMotion()) return undefined
    const image = imageRef.current
    const print = originOf?.(openedAt.current)
    const tweens = [gsap.fromTo(panelRef.current.querySelectorAll(CHROME), { opacity: 0 }, { opacity: 1, duration: .45, ease: 'power2.out' })]
    let cancelled = false
    flight.current = tweens
    gsap.set(image, { opacity: 0 })
    image.decode().catch(() => {}).then(() => {
      if (cancelled || closing.current || openingCancelled.current) return
      gsap.set(image, { opacity: 1 })
      if (!print?.isConnected) return
      lift(lifted, print)
      tweens.push(gsap.fromTo(image, offsetFrom(print, image), { x: 0, y: 0, scale: 1, duration: .75, ease: 'expo.out', onComplete: () => lift(lifted, null) }))
    })
    return () => {
      cancelled = true
      tweens.forEach((tween) => tween.revert())
      gsap.set(image, { clearProps: 'opacity' })
      lift(lifted, null)
    }
  }, [originOf])

  // Closing lands the photo in view on its own print, then unmounts.
  const requestClose = () => {
    if (closing.current) return
    closing.current = true
    const image = imageRef.current
    const print = originOf?.(index)
    if (shouldReduceMotion() || !image || !print?.isConnected) {
      onClose()
      return
    }
    flight.current.forEach((tween) => tween.kill())
    gsap.set(image, { clearProps: 'transform', opacity: 1 })
    lift(lifted, print)
    const closingFlight = gsap.timeline({ onComplete: onClose })
      .to(panelRef.current.querySelectorAll(`${CHROME}, .od-lightbox-ambient`), { opacity: 0, duration: .45, ease: 'power2.in' }, 0)
      .to(image, { ...offsetFrom(print, image), duration: .6, ease: 'expo.inOut' }, 0)
    flight.current.push(closingFlight)
  }

  const selectPhoto = (nextIndex) => {
    if (closing.current) return
    openingCancelled.current = true
    flight.current.forEach((tween) => tween.kill())
    lift(lifted, null)
    gsap.set(imageRef.current, { clearProps: 'transform,opacity' })
    gsap.set(panelRef.current.querySelectorAll(CHROME), { clearProps: 'opacity' })
    setBrowsing(true)
    onChange(nextIndex)
  }
  const move = (direction) => selectPhoto((index + direction + photos.length) % photos.length)

  const startTouch = (event) => {
    touchStart.current = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null
  }
  const endTouch = (event) => {
    const start = touchStart.current
    touchStart.current = null
    const end = event.changedTouches[0]
    if (!start || !end) return
    const dx = end.clientX - start.x
    const dy = end.clientY - start.y
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1)
  }
  const handleKey = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); requestClose(); return }
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      move(event.key === 'ArrowLeft' ? -1 : 1)
    }
    if (event.key === 'Tab') {
      const buttons = [...panelRef.current.querySelectorAll('button:not(:disabled)')]
      const first = buttons[0]
      const last = buttons.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }

  return createPortal(
    <div ref={panelRef} className={`od-lightbox ${className}`} role="dialog" aria-modal="true" aria-labelledby="od-viewer-title" aria-describedby="od-viewer-help" onKeyDown={handleKey} data-lenis-prevent="">
      <div className="od-lightbox-backdrop" onClick={requestClose} aria-hidden="true" />
      {/* The room takes the photo's colour: a deep blur of the same image. */}
      <div key={photo.id} className="od-lightbox-ambient" style={{ backgroundImage: `url(${photo.src})` }} aria-hidden="true" />
      <header className="od-lightbox-head"><span id="od-viewer-title" className="od-label">{title}</span><button ref={closeRef} type="button" onClick={requestClose} aria-label="Close photo viewer"><X size={24} aria-hidden="true" /></button></header>
      <p id="od-viewer-help" className="sr-only">Use the left and right arrow keys or swipe to browse images, and Escape to close.</p>
      <figure className="od-lightbox-figure" onTouchStart={startTouch} onTouchEnd={endTouch} onTouchCancel={() => { touchStart.current = null }}>
        <img ref={imageRef} key={photo.id} className={browsing ? 'is-swap' : undefined} src={photo.fullSrc || photo.src} width={photo.width} height={photo.height} alt={photo.alt} decoding="async" draggable="false" />
        <figcaption aria-live="polite" aria-atomic="true"><span>{String(index + 1).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}</span><span>{photo.caption}</span></figcaption>
      </figure>
      <div className="od-lightbox-controls"><button type="button" onClick={() => move(-1)} aria-label="Previous photo"><ChevronLeft size={24} aria-hidden="true" /></button>{showThumbnails && <div className="ai-lightbox-thumbs" aria-label="Photographs">{photos.map((item, itemIndex) => <button type="button" key={item.id} onClick={() => selectPhoto(itemIndex)} aria-label={`View photograph ${itemIndex + 1}: ${item.caption}`} aria-current={index === itemIndex ? 'true' : undefined}><img src={item.thumb || item.src} width="40" height="50" alt="" loading="lazy" decoding="async" /></button>)}</div>}<button type="button" onClick={() => move(1)} aria-label="Next photo"><ChevronRight size={24} aria-hidden="true" /></button></div>
    </div>,
    document.body,
  )
}
