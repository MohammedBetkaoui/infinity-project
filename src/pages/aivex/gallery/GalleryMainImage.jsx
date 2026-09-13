import { useRef } from 'react'
import { AnimatePresence, motion, useIsPresent, useTransform } from 'framer-motion'
import { frameOpacity, GALLERY_EASE } from './galleryTimeline'

function ImageLayer({ photo, index, position, reduced, onError }) {
  const present = useIsPresent()
  const opacity = useTransform(position, (value) => frameOpacity(value, index))
  const y = useTransform(position, [index - 1, index, index + 1], reduced ? [0, 0, 0] : [6, 0, -6])
  const scale = useTransform(position, [index - 1, index, index + 1], reduced ? [1, 1, 1] : [0.965, 0.988, 0.974])
  return (
    <motion.div
      className="ax-gallery-layer absolute inset-0"
      style={{ zIndex: index + 1 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduced ? 0.16 : 0.28, ease: GALLERY_EASE }}
      aria-hidden={!present || undefined}
    >
      <motion.div className="ax-gallery-print absolute inset-0" style={{ opacity }}>
        <motion.img
          src={photo.src} alt="" width={photo.width} height={photo.height}
          style={{ y, scale }} loading="lazy" decoding="async"
          draggable="false" onError={onError}
        />
      </motion.div>
    </motion.div>
  )
}

export default function GalleryMainImage({ photos, gallery, id }) {
  const gestureRef = useRef(null)
  const photo = photos[gallery.activeIndex]
  const fallback = photos[gallery.fallbackIndex]
  const layers = [gallery.activeIndex - 1, gallery.activeIndex, gallery.activeIndex + 1]
    .filter((index) => index >= 0 && index < photos.length && gallery.loaded.has(index))

  const onPointerUp = (event) => {
    const start = gestureRef.current
    gestureRef.current = null
    if (!start) return
    const x = event.clientX - start.x
    const y = event.clientY - start.y
    if (Math.abs(x) > 44 && Math.abs(x) > Math.abs(y) * 1.4) gallery.step(x < 0 ? 1 : -1)
  }

  return (
    <div
      id={id}
      className="ax-gallery-stage relative isolate overflow-hidden"
      role="group"
      aria-roledescription="slide"
      aria-label={`${gallery.activeIndex + 1} of ${photos.length}. ${photo.alt}`}
      aria-busy={gallery.loading || !gallery.loaded.has(gallery.activeIndex) || undefined}
      onPointerDown={(event) => {
        if (event.pointerType === 'mouse' || !event.isPrimary) return
        gallery.pause()
        gestureRef.current = { x: event.clientX, y: event.clientY }
      }}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { gestureRef.current = null }}
    >
      <img
        className="ax-gallery-base absolute inset-0"
        src={fallback.src} alt="" aria-hidden="true"
        width={fallback.width} height={fallback.height}
        loading="lazy" decoding="async" draggable="false" onError={gallery.onImageError}
      />
      <AnimatePresence initial={false}>
        {layers.map((index) => (
          <ImageLayer key={photos[index].src} photo={photos[index]} index={index} position={gallery.position} reduced={gallery.reduced} onError={gallery.onImageError} />
        ))}
      </AnimatePresence>
    </div>
  )
}
