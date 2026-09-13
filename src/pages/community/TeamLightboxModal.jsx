import { useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { TEAM_LAYOUT } from './teamMotion'

export default function TeamLightboxModal({ members, index, onChange, onClose, reduced, carouselId }) {
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const member = members[index]

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
      const currentFrame = document.getElementById(carouselId)?.querySelector('[data-active="true"] button')
      const focusTarget = currentFrame || previousFocus
      if (focusTarget instanceof HTMLElement && focusTarget.isConnected) focusTarget.focus({ preventScroll: true })
    }
  }, [carouselId])

  const move = (direction) => onChange((index + direction + members.length) % members.length)
  const onKeyDown = (event) => {
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
    <motion.div
      ref={panelRef}
      className="team-lightbox"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${carouselId}-viewer-title`}
      onKeyDown={onKeyDown}
      layoutRoot
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 1, transition: { duration: reduced ? .14 : .56 } }}
    >
      <motion.div className="team-lightbox-backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? .14 : .4 }} />
      <div className="team-lightbox-content">
        <motion.header initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
          <span>Infinity Club<span>Meet the Infiniters</span></span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close portrait viewer"><X size={22} strokeWidth={1.5} /></button>
        </motion.header>
        <div className="team-lightbox-image">
          {/* The portal shares its layout group with the frame: the photograph itself makes the journey. */}
          <motion.img
            key={member.id}
            layoutId={reduced ? undefined : `team-portrait-${member.id}`}
            src={member.src}
            alt={member.alt}
            width={member.width}
            height={member.height}
            draggable="false"
            initial={{ opacity: reduced ? 0 : 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: reduced ? 0 : 1 }}
            transition={{ opacity: { duration: .18 }, layout: TEAM_LAYOUT }}
          />
        </div>
        <motion.footer initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
          <button type="button" onClick={() => move(-1)} aria-label="Previous portrait"><ChevronLeft size={21} /></button>
          <div id={`${carouselId}-viewer-title`} aria-live="polite" aria-atomic="true"><strong>{member.name}</strong><span>{member.role}</span></div>
          <button type="button" onClick={() => move(1)} aria-label="Next portrait"><ChevronRight size={21} /></button>
        </motion.footer>
      </div>
    </motion.div>,
    document.body,
  )
}
