import { useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import useMotionPreference from '../../hooks/useMotionPreference'
import { communityPortraits } from './communityData'

export default function PortraitViewer({ index, onChange, onClose }) {
  const dialogRef = useRef(null)
  const reduced = useMotionPreference()
  const portrait = communityPortraits[index]

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    dialog.showModal()
    document.body.style.overflow = 'hidden'
    window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: true } }))
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      window.dispatchEvent(new CustomEvent('infinity:scroll-lock', { detail: { locked: false } }))
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  const move = (direction) => onChange((index + direction + communityPortraits.length) % communityPortraits.length)

  return (
    <dialog
      ref={dialogRef}
      className="community-portrait-viewer"
      aria-labelledby="community-viewer-title"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        move(event.key === 'ArrowLeft' ? -1 : 1)
      }}
    >
      <div className="community-viewer-panel">
        <header><span>Infinity Club</span><button type="button" onClick={onClose} aria-label="Close portrait viewer" autoFocus><X size={22} /></button></header>
        <div className="community-viewer-image">
          <AnimatePresence initial={false}>
            <motion.img key={portrait.id} src={portrait.src} alt={portrait.alt} width={portrait.width} height={portrait.height} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .23 }} />
          </AnimatePresence>
        </div>
        <footer>
          <div className="community-gallery-controls"><button type="button" onClick={() => move(-1)} aria-label="Previous portrait"><ChevronLeft size={20} /></button></div>
          <div id="community-viewer-title" aria-live="polite"><strong>{portrait.name}</strong><span>{portrait.role}</span></div>
          <div className="community-gallery-controls"><button type="button" onClick={() => move(1)} aria-label="Next portrait"><ChevronRight size={20} /></button></div>
        </footer>
      </div>
    </dialog>
  )
}
