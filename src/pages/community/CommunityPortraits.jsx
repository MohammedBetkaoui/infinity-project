import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { MOTION_EASE } from '../../lib/motion'
import { communityPortraits } from './communityData'
import CommunityPortrait from './CommunityPortrait'
import PortraitViewer from './PortraitViewer'
import usePortraitRail from './usePortraitRail'

export default function CommunityPortraits() {
  const railRef = useRef(null)
  const [viewerIndex, setViewerIndex] = useState(null)
  const { activeIndex, goTo, onKeyDown, scrollX, step, origin, reduced } = usePortraitRail(railRef, communityPortraits.length, 3)
  const active = communityPortraits[activeIndex]

  return (
    <section id="meet-infiniters" className="community-people" aria-labelledby="community-people-title">
      <div className="page-container community-people-heading">
        <h2 id="community-people-title">Meet the Infiniters.</h2>
        <p>Behind the workshops, the visuals and the shared projects: students who give the club their time, their skills and their own way of seeing things.</p>
      </div>

      <div className="community-wall-scene">
        <div className="community-wall-plane">
          <div
            ref={railRef}
            id="community-portrait-rail"
            className="community-portrait-rail"
            role="region"
            aria-label="Infinity team portraits"
            tabIndex={0}
            aria-describedby="community-gallery-help"
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault()
                setViewerIndex(activeIndex)
              } else onKeyDown(event)
            }}
          >
            <ul className="community-portrait-track">
              {communityPortraits.map((portrait, index) => (
                <CommunityPortrait key={portrait.id} portrait={portrait} index={index} active={index === activeIndex} scrollX={scrollX} step={step} origin={origin} reduced={reduced} onSelect={() => goTo(index)} onOpen={() => setViewerIndex(index)} />
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="page-container">
        <div className="community-gallery-caption">
          <p id="community-gallery-help">Explore the portraits.<span>Swipe, use the arrows or choose a name below.</span><span className="sr-only">Use the left and right arrow keys to browse, then press Enter to open the selected portrait. Home and End select the first and last portraits.</span></p>
          <div className="community-portrait-credit" aria-live="polite" aria-atomic="true">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={active.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? .08 : .16, ease: MOTION_EASE.smooth }}>
                <h3>{active.name}</h3><p>{active.role}</p>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="community-gallery-controls">
            <span aria-label={`Portrait ${activeIndex + 1} of ${communityPortraits.length}`}>{String(activeIndex + 1).padStart(2, '0')}<span> / {String(communityPortraits.length).padStart(2, '0')}</span></span>
            <button type="button" onClick={() => goTo(activeIndex - 1)} disabled={activeIndex === 0} aria-label="Previous portrait" aria-controls="community-portrait-rail"><ChevronLeft size={19} /></button>
            <button type="button" onClick={() => goTo(activeIndex + 1)} disabled={activeIndex === communityPortraits.length - 1} aria-label="Next portrait" aria-controls="community-portrait-rail"><ChevronRight size={19} /></button>
          </div>
        </div>
        <div className="community-name-index" role="group" aria-label="Choose a team portrait">
          {communityPortraits.map((portrait, index) => (
            <button type="button" key={portrait.id} aria-pressed={activeIndex === index} aria-controls="community-portrait-rail" onClick={() => goTo(index)}>
              <span>{portrait.name}</span><span>{portrait.role}</span>
            </button>
          ))}
        </div>
        <p className="community-portrait-footnote">A few faces from the club, in their own frames. There is a place here for yours, too.</p>
      </div>

      {viewerIndex !== null && <PortraitViewer index={viewerIndex} onChange={setViewerIndex} onClose={() => setViewerIndex(null)} />}
    </section>
  )
}
