import { useRef } from 'react'
import { AnimatePresence, motion, useIsPresent } from 'framer-motion'
import useClubMoments from '../hooks/useClubMoments'
import useClubMosaicMotion from '../hooks/useClubMosaicMotion'
import { clubMomentSets } from '../data/clubMoments'
import { MOTION_EASE } from '../lib/motion'

function PhotoLayer({ photo, reduced, slot }) {
  const present = useIsPresent()
  return (
    <motion.img
      src={photo.src} alt={present ? photo.alt : ''} aria-hidden={!present || undefined}
      width={photo.width} height={photo.height} loading="lazy" decoding="async" draggable="false"
      style={{ objectPosition: photo.position, zIndex: present ? 2 : 1 }}
      initial={{ opacity: 0, scale: reduced ? 1 : 1.075, x: reduced ? 0 : (slot === 0 ? -6 : 6) }}
      animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0 }}
      transition={{
        opacity: { duration: reduced ? .16 : .52, delay: reduced ? 0 : slot * .055 },
        scale: { duration: reduced ? 0 : 1.12, ease: MOTION_EASE.smooth },
        x: { duration: reduced ? 0 : .86, ease: MOTION_EASE.smooth },
      }}
    />
  )
}

export default function ClubPhotoMosaic() {
  const galleryRef = useRef(null)
  const gallery = useClubMoments(galleryRef)
  useClubMosaicMotion(galleryRef)
  const set = clubMomentSets[gallery.activeIndex]

  return (
    <div ref={galleryRef} className="club-moments" role="region" tabIndex={0}
      aria-label="Infinity Club photographs from the first AIVEX edition" aria-describedby="club-moments-help"
      data-photo-set={set.id} data-playing={gallery.playing}
      onPointerEnter={gallery.onPointerEnter} onPointerLeave={gallery.onPointerLeave}
      onFocus={gallery.onFocus} onBlur={gallery.onBlur}>
      <div className="club-moments-mosaic" role="group" aria-label={set.label} aria-busy={!gallery.ready && !gallery.failed || undefined}>
        {set.photos.map((photo, slot) => (
          <div key={slot} className={`club-moments-frame club-moments-frame-${slot + 1}`}>
            <div className="club-moments-window">
              <AnimatePresence initial={false}>
                <PhotoLayer key={photo.src} photo={photo} reduced={gallery.reduced} slot={slot} />
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>

      <p id="club-moments-help" className="sr-only">
        Three photographs change automatically. Hover over or focus this gallery to pause the changes.
      </p>
    </div>
  )
}
