import { useId, useRef } from 'react'
import { AnimatePresence, motion, useIsPresent } from 'framer-motion'
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react'
import { firstEditionPhotos, galleryIndex, GALLERY_INTERVAL_MS } from './aivexGalleryData'
import useAivexGallery from './useAivexGallery'
import './aivex-gallery.css'

const photoMotion = {
  enter: (direction) => ({ opacity: 0, x: `${direction * 12}%`, rotate: direction * 1.6, scale: 0.974 }),
  present: { opacity: 1, x: '0%', rotate: 0, scale: 1, zIndex: 2 },
  leave: (direction) => ({ opacity: 0, x: `${direction * -7}%`, rotate: direction * -1.1, scale: 0.975, zIndex: 1 }),
}
const stillMotion = {
  enter: { opacity: 0 },
  present: { opacity: 1 },
  leave: { opacity: 0 },
}

function GalleryPhotograph({ photo, direction, reduced, onError }) {
  const present = useIsPresent()
  return (
    <motion.div
      className="ax-gallery-photo"
      custom={direction}
      variants={reduced ? stillMotion : photoMotion}
      initial="enter"
      animate="present"
      exit="leave"
      aria-hidden={!present || undefined}
      transition={{ duration: reduced ? 0.16 : 0.62, ease: [0.19, 1, 0.24, 1] }}
    >
      <img
        src={photo.src}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        loading="lazy"
        decoding="async"
        draggable="false"
        onError={onError}
      />
    </motion.div>
  )
}

export default function AivexGallery({ ready }) {
  const rootRef = useRef(null)
  const gallery = useAivexGallery(rootRef, ready)
  const gestureRef = useRef(null)
  const id = useId()
  const photo = firstEditionPhotos[gallery.slide.index]
  const count = firstEditionPhotos.length
  const number = String(gallery.slide.index + 1).padStart(2, '0')

  const onKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    gallery.step(event.key === 'ArrowRight' ? 1 : -1)
  }

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' || !event.isPrimary) return
    gallery.pause()
    gestureRef.current = { x: event.clientX, y: event.clientY }
  }

  const onPointerUp = (event) => {
    const start = gestureRef.current
    gestureRef.current = null
    if (!start) return
    const x = event.clientX - start.x
    const y = event.clientY - start.y
    if (Math.abs(x) > 44 && Math.abs(x) > Math.abs(y) * 1.4) gallery.step(x < 0 ? 1 : -1)
  }

  return (
    <section className="ax-gallery" id="first-edition" aria-labelledby={`${id}-title`}>
      <div
        className="ax-container ax-gallery-layout"
        ref={rootRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="Photographs from the first AIVEX edition"
        onKeyDown={onKeyDown}
        onFocusCapture={gallery.onFocusCapture}
        onPointerEnter={gallery.onPointerEnter}
        onPointerLeave={gallery.onPointerLeave}
      >
        <div className="ax-gallery-intro">
          <h2 id={`${id}-title`}>The first edition,<br />up close.</h2>
          <p>The people behind the projects. A look back at the conversations, the code and the moments in between.</p>
          <div className="ax-gallery-edition">
            <span>AIVEX, first edition</span>
            <span>{count} photographs from the club</span>
          </div>
          <div className="ax-gallery-controls">
            {!gallery.reduced && (
              <button
                type="button"
                className="ax-gallery-playback"
                data-gallery-playback
                onClick={gallery.togglePlayback}
                aria-label={gallery.autoplay ? 'Pause slideshow' : 'Play slideshow'}
                aria-controls={`${id}-photo`}
              >
                {gallery.autoplay ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                <span>{gallery.autoplay ? 'Pause' : 'Play'}</span>
              </button>
            )}
            <div className="ax-gallery-arrows">
              <button type="button" onClick={() => gallery.step(-1)} aria-label="Previous photograph" aria-controls={`${id}-photo`}>
                <ArrowLeft size={19} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => gallery.step(1)} aria-label="Next photograph" aria-controls={`${id}-photo`}>
                <ArrowRight size={19} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div className="ax-gallery-album">
          <div className="ax-gallery-photo-column">
            <div
              className="ax-gallery-stage"
              id={`${id}-photo`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${gallery.slide.index + 1} of ${count}: ${photo.caption}`}
              aria-busy={gallery.loading || undefined}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={() => { gestureRef.current = null }}
            >
              <AnimatePresence initial={false} custom={gallery.slide.direction}>
                <GalleryPhotograph
                  key={photo.src}
                  photo={photo}
                  direction={gallery.slide.direction}
                  reduced={gallery.reduced}
                  onError={gallery.onImageError}
                />
              </AnimatePresence>
            </div>
            <div className="ax-gallery-caption" aria-hidden="true">
              <span>{number}<span> / {String(count).padStart(2, '0')}</span></span>
              <p>{photo.caption}</p>
            </div>
            <div className="ax-gallery-progress" aria-hidden="true">
              {firstEditionPhotos.map((item, index) => (
                <span key={item.src} className={index === gallery.slide.index ? 'is-current' : ''}>
                  {index === gallery.slide.index && (
                    <i
                      key={`${index}-${gallery.playing}`}
                      className={gallery.playing ? 'is-playing' : ''}
                      style={{ '--gallery-duration': `${GALLERY_INTERVAL_MS}ms` }}
                    />
                  )}
                </span>
              ))}
            </div>
          </div>

          <div className="ax-gallery-previews">
            <span className="ax-gallery-preview-label">Coming into view</span>
            {[1, 2].map((offset) => {
              const index = galleryIndex(gallery.slide.index + offset)
              const next = firstEditionPhotos[index]
              return (
                <button
                  className="ax-gallery-preview"
                  type="button"
                  key={offset}
                  onClick={() => gallery.showPhoto(index)}
                  aria-label={`View photograph ${index + 1}: ${next.caption}`}
                  aria-controls={`${id}-photo`}
                >
                  <img src={next.src} alt="" width={next.width} height={next.height} loading="lazy" decoding="async" draggable="false" />
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                </button>
              )
            })}
          </div>
        </div>
        <p className="ax-gallery-announcement" role="status" aria-live="polite" aria-atomic="true">
          {gallery.error || ((!gallery.autoplay || gallery.reduced) && (gallery.loading ? 'Loading photograph.' : `Photograph ${gallery.slide.index + 1} of ${count}. ${photo.caption}`))}
        </p>
        {gallery.error && <p className="ax-gallery-error">{gallery.error}</p>}
      </div>
    </section>
  )
}
