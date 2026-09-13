import { useEffect, useRef } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'
import useMotionPreference from '../../hooks/useMotionPreference'

const spring = { stiffness: 142, damping: 26, mass: .58 }

export default function EventPreview({ preview }) {
  const bounds = useRef(null)
  const reduced = useMotionPreference()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useSpring(x, spring)
  const rotateY = useSpring(y, spring)

  useEffect(() => {
    // A stationary cursor must not leave the screenshot leaning as the reader scrolls away.
    const reset = () => {
      if (!bounds.current) return
      bounds.current = null
      x.set(0)
      y.set(0)
    }
    const pointer = window.matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)')
    reset()
    pointer.addEventListener('change', reset)
    window.addEventListener('scroll', reset, { passive: true })
    window.addEventListener('blur', reset)
    return () => {
      pointer.removeEventListener('change', reset)
      window.removeEventListener('scroll', reset)
      window.removeEventListener('blur', reset)
    }
  }, [x, y, reduced])

  const reset = () => { bounds.current = null; x.set(0); y.set(0) }

  return (
    <div className="events-preview"
      onPointerEnter={(event) => {
        if (reduced || event.pointerType !== 'mouse' || !window.matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)').matches) return
        bounds.current = event.currentTarget.getBoundingClientRect()
      }}
      onPointerMove={(event) => {
        const rect = bounds.current
        if (reduced || event.pointerType !== 'mouse' || !rect) return
        x.set(Math.max(-1.3, Math.min(1.3, (event.clientY - rect.top - rect.height / 2) / rect.height * -2.6)))
        y.set(Math.max(-1.6, Math.min(1.6, (event.clientX - rect.left - rect.width / 2) / rect.width * 3.2)))
      }}
      onPointerLeave={reset} onPointerCancel={reset}>
      <div className="events-preview-shadow" aria-hidden="true" />
      <div className="events-preview-depth">
        <motion.div className="events-preview-surface"
          style={reduced ? { rotateX: 0, rotateY: 0 } : { rotateX, rotateY }}>
          <img src={preview.src} width={preview.width} height={preview.height} alt={preview.alt} decoding="async" />
          <span className="events-preview-edge" aria-hidden="true" />
        </motion.div>
      </div>
    </div>
  )
}
