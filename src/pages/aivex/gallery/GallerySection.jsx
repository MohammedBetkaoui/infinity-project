import { useId, useRef } from 'react'
import { motion } from 'framer-motion'
import { firstEditionPhotos } from '../aivexGalleryData'
import useAivexGallery from '../useAivexGallery'
import GalleryMainImage from './GalleryMainImage'
import GalleryThumbnailRail from './GalleryThumbnailRail'
import GalleryControls from './GalleryControls'
import GalleryProgressBar from './GalleryProgressBar'
import { GALLERY_EASE } from './galleryTimeline'
import '../aivex-gallery.css'

export default function GallerySection({ ready = true }) {
  const trackRef = useRef(null)
  const panelRef = useRef(null)
  const gallery = useAivexGallery(trackRef, panelRef, ready)
  const id = useId()
  const photos = firstEditionPhotos

  const onKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.target.closest('.ax-gallery-rail')) {
      const keys = { ArrowUp: -1, ArrowDown: 1 }
      if (keys[event.key]) {
        event.preventDefault()
        gallery.step(keys[event.key])
        return
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        gallery.showPhoto(event.key === 'Home' ? 0 : photos.length - 1)
        return
      }
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    gallery.step(event.key === 'ArrowRight' ? 1 : -1)
  }

  return (
    <section
      className="ax-gallery relative"
      id="first-edition"
      aria-labelledby={`${id}-title`}
      data-scroll-gallery={gallery.scrollEnabled ? 'true' : 'false'}
      style={{ '--gallery-travel': `${(photos.length - 1) * (gallery.mobile ? 88 : 104)}px` }}
    >
      <div className="ax-container ax-gallery-layout grid items-start">
        <header className="ax-gallery-intro">
          <motion.h2
            id={`${id}-title`}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: gallery.reduced ? 0 : 0.075 } } }}
          >
            {['The first edition,', 'up close.'].map((line) => (
              <motion.span
                className="block" key={line}
                variants={{ hidden: { opacity: 0, y: gallery.reduced ? 0 : 16 }, visible: { opacity: 1, y: 0 } }}
                transition={{ duration: gallery.reduced ? 0.18 : 0.46, ease: GALLERY_EASE }}
              >{line}</motion.span>
            ))}
          </motion.h2>
          <p className="ax-gallery-description">The people behind the projects. A look back at the conversations, the code and the moments in between.</p>
          <div className="ax-gallery-edition flex flex-wrap items-center gap-x-5 gap-y-2">
            <span>AIVEX, first edition</span><span>{photos.length} photographs</span>
          </div>
          <div className="ax-gallery-reading-note">
            <p>{gallery.scrollEnabled ? 'Scroll to move through the album.' : 'Take a closer look, one photograph at a time.'}</p>
            <a href="#approche">Continue to our approach</a>
          </div>
        </header>

        <div className="ax-gallery-track relative min-w-0" ref={trackRef}>
          <div
            className="ax-gallery-panel" ref={panelRef}
            role="region" aria-roledescription="carousel" aria-label="Photographs from the first AIVEX edition"
            onKeyDown={onKeyDown} onFocusCapture={gallery.onFocusCapture}
            onPointerEnter={gallery.onPointerEnter} onPointerLeave={gallery.onPointerLeave}
          >
            <div className="ax-gallery-album grid min-w-0 items-center">
              <div className="ax-gallery-photo-column min-w-0">
                <GalleryMainImage photos={photos} gallery={gallery} id={`${id}-photo`} />
              </div>
              <GalleryThumbnailRail photos={photos} gallery={gallery} targetId={`${id}-photo`} />
            </div>
            <div className="ax-gallery-bottom">
              <GalleryProgressBar gallery={gallery} photos={photos} />
              <GalleryControls gallery={gallery} count={photos.length} targetId={`${id}-photo`} />
            </div>
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{gallery.error || gallery.announcement}</p>
            {gallery.error && <p className="ax-gallery-error" aria-hidden="true">{gallery.error}</p>}
          </div>
        </div>
      </div>
    </section>
  )
}
