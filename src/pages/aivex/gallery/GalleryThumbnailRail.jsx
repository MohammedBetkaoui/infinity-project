import { useEffect, useRef } from 'react'
import { motion, useSpring, useTransform } from 'framer-motion'

function Thumbnail({ photo, index, activeIndex, position, reduced, onSelect, targetId }) {
  const opacity = useTransform(position, (value) => Math.max(0.34, 1 - Math.abs(value - index) * 0.33))
  const scale = useTransform(position, (value) => reduced ? 1 : 1 - Math.min(Math.abs(value - index), 2) * 0.045)
  const nearby = Math.abs(index - activeIndex) <= 2
  return (
    <motion.button
      type="button"
      className="ax-gallery-thumbnail relative shrink-0"
      style={{ opacity, scale }}
      whileHover={reduced ? undefined : { scale: 1.045, opacity: 1 }}
      whileFocus={{ opacity: 1 }}
      transition={{ duration: 0.24, ease: 'easeOut' }}
      aria-label={`View photograph ${index + 1}: ${photo.caption}`}
      aria-current={index === activeIndex ? 'true' : undefined}
      aria-controls={targetId}
      tabIndex={index === activeIndex ? 0 : -1}
      data-photo-index={index}
      onClick={() => onSelect(index)}
    >
      {nearby && <img src={photo.src} alt="" width={photo.width} height={photo.height} loading="lazy" decoding="async" draggable="false" />}
      <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
    </motion.button>
  )
}

export default function GalleryThumbnailRail({ photos, gallery, targetId }) {
  const railRef = useRef(null)
  // Matching the fixed thumbnail pitch avoids measuring layout on every scroll frame.
  const offset = useTransform(gallery.position, (value) => (gallery.mobile ? 100 : 104) - value * (gallery.mobile ? 58 : 96))
  const settledOffset = useSpring(offset, { stiffness: 310, damping: 34, mass: 0.42 })
  const transform = gallery.reduced ? offset : settledOffset

  useEffect(() => {
    if (railRef.current.contains(document.activeElement)) {
      railRef.current.querySelector(`[data-photo-index="${gallery.activeIndex}"]`)?.focus({ preventScroll: true })
    }
  }, [gallery.activeIndex])

  return (
    <aside className="ax-gallery-rail min-w-0" aria-label="Choose a photograph" ref={railRef}>
      <p className="ax-gallery-rail-label">Coming into view</p>
      <div className="ax-gallery-rail-window relative overflow-hidden">
        <motion.div
          className="ax-gallery-rail-track flex"
          style={gallery.mobile ? { x: transform, y: 0 } : { x: 0, y: transform }}
        >
          {photos.map((photo, index) => (
            <Thumbnail key={photo.src} photo={photo} index={index} activeIndex={gallery.activeIndex} position={gallery.position} reduced={gallery.reduced} onSelect={gallery.showPhoto} targetId={targetId} />
          ))}
        </motion.div>
      </div>
    </aside>
  )
}
