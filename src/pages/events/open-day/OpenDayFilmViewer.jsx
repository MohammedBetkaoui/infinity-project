import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { filmTime } from './openDayFilms.js'

export default function OpenDayFilmViewer({ films, index, onChange, onClose }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const film = films[index]

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    const { overflow, paddingRight } = document.body.style
    const gutter = innerWidth - document.documentElement.clientWidth
    const padding = parseFloat(getComputedStyle(document.body).paddingRight) || 0
    // Native modal dialog provides focus containment and background inertness.
    dialog.showModal()
    closeRef.current?.focus({ preventScroll: true })
    document.body.style.overflow = 'hidden'
    document.body.style.paddingRight = `${padding + gutter}px`
    window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: true } }))
    return () => {
      dialog.querySelector('video')?.pause()
      dialog.close()
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
      window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: false } }))
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  const move = (direction) => onChange((index + direction + films.length) % films.length)
  const handleKey = (event) => {
    if (event.key === 'Escape' && !document.fullscreenElement) { event.preventDefault(); onClose(); return }
    if (event.key === 'Tab') {
      const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), video[controls]')]
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      return
    }
    // Leave native video controls their seeking/volume keyboard shortcuts.
    if (event.target.tagName === 'VIDEO' || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1) }
  }
  return createPortal(
    <dialog ref={dialogRef} className="od-film-viewer" aria-labelledby="od-film-viewer-title" aria-describedby="od-film-viewer-description" onKeyDown={handleKey} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) onClose() }} data-lenis-prevent="">
      <div className="od-film-viewer-inner">
        <header><div><p className="od-label">Infinity Club / Original footage / 05 OCT 26</p><h2 id="od-film-viewer-title">{film.label}</h2></div><button ref={closeRef} type="button" onClick={onClose} aria-label="Close video player"><X size={24} aria-hidden="true" /></button></header>
        <div className="od-film-viewer-media"><video key={film.id} src={film.src} poster={film.poster} width={film.width} height={film.height} controls playsInline autoPlay preload="metadata" aria-label={film.description}><a href={film.src}>Open the original video</a></video></div>
        <footer><button type="button" onClick={() => move(-1)} aria-label="Previous clip"><ChevronLeft size={22} aria-hidden="true" /></button><div aria-live="polite" aria-atomic="true"><p id="od-film-viewer-description">{film.description}</p><span className="od-label">{String(index + 1).padStart(2, '0')} / {String(films.length).padStart(2, '0')} · {filmTime(film.duration)} · Original audio</span></div><button type="button" onClick={() => move(1)} aria-label="Next clip"><ChevronRight size={22} aria-hidden="true" /></button></footer>
      </div>
    </dialog>, document.body,
  )
}
