import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function OpenDayLightbox({ photos, index, onChange, onClose }) {
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const photo = photos[index]

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

  const move = (direction) => onChange((index + direction + photos.length) % photos.length)
  const handleKey = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
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
    <div ref={panelRef} className="od-lightbox" role="dialog" aria-modal="true" aria-labelledby="od-viewer-title" aria-describedby="od-viewer-help" onKeyDown={handleKey} data-lenis-prevent="">
      <div className="od-lightbox-backdrop" onClick={onClose} aria-hidden="true" />
      <header className="od-lightbox-head"><span id="od-viewer-title" className="od-label">Infinity Club / Open Day / 05 OCT 2026</span><button ref={closeRef} type="button" onClick={onClose} aria-label="Close photo viewer"><X size={24} aria-hidden="true" /></button></header>
      <p id="od-viewer-help" className="sr-only">Use the left and right arrow keys to browse images, and Escape to close.</p>
      <figure className="od-lightbox-figure">
        <img key={photo.id} src={photo.src} width={photo.width} height={photo.height} alt={photo.alt} decoding="async" draggable="false" />
        <figcaption aria-live="polite" aria-atomic="true"><span>{String(index + 1).padStart(2, '0')} / {String(photos.length).padStart(2, '0')}</span><span>{photo.caption}</span></figcaption>
      </figure>
      <div className="od-lightbox-controls"><button type="button" onClick={() => move(-1)} aria-label="Previous photo"><ChevronLeft size={24} aria-hidden="true" /></button><button type="button" onClick={() => move(1)} aria-label="Next photo"><ChevronRight size={24} aria-hidden="true" /></button></div>
    </div>,
    document.body,
  )
}
