import { AnimatePresence, motion, useSpring, useTransform } from 'framer-motion'
import { GALLERY_EASE } from './galleryTimeline'

export default function GalleryProgressBar({ gallery, photos }) {
  const count = photos.length
  const progress = useTransform(gallery.position, (value) => (value + 1) / count)
  const smooth = useSpring(progress, { stiffness: 330, damping: 36, mass: 0.38 })
  return (
    <div className="ax-gallery-progress-block min-w-0">
      <div className="ax-gallery-caption flex items-start gap-4">
        <div className="ax-gallery-counter flex shrink-0 items-baseline gap-1.5" aria-hidden="true">
          <span className="ax-gallery-count-window relative inline-block overflow-hidden">
            <AnimatePresence initial={false}>
              <motion.span
                key={gallery.activeIndex}
                className="absolute inset-0 block"
                initial={{ opacity: 0, y: gallery.reduced ? 0 : '65%' }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: gallery.reduced ? 0 : '-65%' }}
                transition={{ duration: gallery.reduced ? 0.16 : 0.32, ease: GALLERY_EASE }}
              >{String(gallery.activeIndex + 1).padStart(2, '0')}</motion.span>
            </AnimatePresence>
          </span>
          <span className="ax-gallery-total">/ {String(count).padStart(2, '0')}</span>
        </div>
        <div className="ax-gallery-caption-window relative min-w-0 flex-1" aria-hidden="true">
          <AnimatePresence initial={false}>
            <motion.p key={gallery.activeIndex} className="absolute inset-x-0 top-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.24 }}>
              {photos[gallery.activeIndex].caption}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
      <div className="ax-gallery-progress relative overflow-hidden" role="progressbar" aria-label="Position in the photo album" aria-valuemin={1} aria-valuemax={count} aria-valuenow={gallery.activeIndex + 1}>
        <motion.span className="absolute inset-0 block origin-left" style={{ scaleX: gallery.reduced ? progress : smooth }} />
      </div>
    </div>
  )
}
