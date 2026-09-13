import { motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Pause, Play } from 'lucide-react'

export default function GalleryControls({ gallery, count, targetId }) {
  return (
    <div className="ax-gallery-controls flex items-center justify-between gap-4">
      {!gallery.reduced ? (
        <motion.button
          type="button"
          className="ax-gallery-playback inline-flex items-center gap-2.5"
          data-gallery-playback
          onClick={gallery.togglePlayback}
          aria-label={gallery.autoplay ? 'Pause slideshow' : 'Play slideshow'}
          aria-controls={targetId}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.22 }}
        >
          {gallery.autoplay ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          <span>{gallery.autoplay ? 'Pause' : 'Play the album'}</span>
        </motion.button>
      ) : <span className="ax-gallery-motion-note">Browse at your own pace</span>}
      <div className="flex gap-2">
        <motion.button
          type="button" className="ax-gallery-arrow grid size-11 place-items-center"
          onClick={() => gallery.step(-1)} disabled={gallery.activeIndex === 0}
          aria-label="Previous photograph" aria-controls={targetId}
          whileTap={gallery.reduced ? undefined : { scale: 0.94 }} transition={{ duration: 0.22 }}
        ><ArrowLeft size={18} aria-hidden="true" /></motion.button>
        <motion.button
          type="button" className="ax-gallery-arrow grid size-11 place-items-center"
          onClick={() => gallery.step(1)} disabled={gallery.activeIndex === count - 1}
          aria-label="Next photograph" aria-controls={targetId}
          whileTap={gallery.reduced ? undefined : { scale: 0.94 }} transition={{ duration: 0.22 }}
        ><ArrowRight size={18} aria-hidden="true" /></motion.button>
      </div>
    </div>
  )
}
