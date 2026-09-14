import { useId, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion, useInView } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import useMotionPreference from '../../hooks/useMotionPreference'
import { communityPortraits } from './communityData'
import TeamFrame from './TeamFrame'
import TeamNameSelector from './TeamNameSelector'
import TeamLightboxModal from './TeamLightboxModal'
import useTeamCarousel from './useTeamCarousel'
import './team-carousel.css'

const initialIndex = Math.max(0, communityPortraits.findIndex((member) => member.role === 'President'))

export default function TeamCarousel() {
  const sectionRef = useRef(null)
  const stageRef = useRef(null)
  const [viewerIndex, setViewerIndex] = useState(null)
  const reduced = useMotionPreference()
  const groupId = useId()
  const carouselId = `${groupId}-portraits`
  const inView = useInView(sectionRef, { margin: '40px' })
  const { activeIndex, x, step, geometry, goTo, move, stop, onDragStart, onDragEnd, onPointerCancel, suppressClick } = useTeamCarousel(stageRef, communityPortraits.length, initialIndex, reduced)
  const active = communityPortraits[activeIndex]

  const openPortrait = (index) => {
    if (suppressClick()) return
    goTo(index, { onComplete: () => setViewerIndex(index) })
  }
  const handleKey = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      stageRef.current.focus({ preventScroll: true })
      if (event.key === 'Home') goTo(0)
      else if (event.key === 'End') goTo(communityPortraits.length - 1)
      else move(event.key === 'ArrowLeft' ? -1 : 1)
    } else if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      openPortrait(activeIndex)
    }
  }

  return (
    <LayoutGroup id={groupId}>
      <section ref={sectionRef} id="meet-infiniters" className="team-gallery" aria-labelledby="community-people-title" data-in-view={inView} data-modal-open={viewerIndex !== null}>
        <div className="page-container team-gallery-heading">
          <h2 id="community-people-title">Meet the Infiniters.</h2>
          <p>Behind the workshops, the visuals and the shared projects: students who give the club their time, their skills and their own way of seeing things.</p>
        </div>

        <div ref={stageRef} id={carouselId} className="team-stage" role="region" aria-roledescription="carousel" aria-label="Infinity team portraits" tabIndex={0} aria-describedby={`${carouselId}-help`} onKeyDown={handleKey}>
          <div className="team-spot-breathe" aria-hidden="true">
            <motion.div className="team-spotlight" key={active.id} initial={reduced ? false : { opacity: .24, scale: 1 }} animate={reduced ? { opacity: .36 } : { opacity: [.3, .62, .36], scale: [1, 1.04, 1] }} transition={{ duration: .48, ease: 'easeOut' }} />
          </div>
          <span className="team-wall-rule" aria-hidden="true" />
          <motion.ul
            className="team-track"
            style={{ x }}
            drag="x"
            dragConstraints={{ left: -(communityPortraits.length - 1) * geometry.step, right: 0 }}
            dragElastic={reduced ? 0 : .045}
            dragMomentum={false}
            onPointerDown={stop}
            onPointerCancel={onPointerCancel}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            {communityPortraits.map((member, index) => (
              <TeamFrame
                key={member.id}
                member={member}
                index={index}
                initialIndex={initialIndex}
                active={index === activeIndex}
                near={Math.abs(index - activeIndex) <= 2}
                x={x}
                step={step}
                compact={geometry.compact}
                reduced={reduced}
                layoutId={`team-portrait-${member.id}`}
                onActivate={() => {
                  if (suppressClick()) return
                  if (index === activeIndex) openPortrait(index)
                  else goTo(index)
                }}
              />
            ))}
          </motion.ul>
        </div>

        <div className="page-container">
          <div className="team-caption-row">
            <p id={`${carouselId}-help`}>A closer look at our people.<span>Drag a portrait or choose a name.</span><span className="sr-only">Use Left and Right to browse, Home and End to reach the first and last portrait, and Enter to open the selected portrait.</span></p>
            <div className="team-active-credit" aria-live="polite" aria-atomic="true">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={active.id} initial={{ opacity: 0, y: reduced ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -4 }} transition={{ duration: .16 }}>
                  <h3>{active.name}</h3><p>{active.role}</p>
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="team-controls">
              <span className="team-counter" aria-label={`Portrait ${activeIndex + 1} of ${communityPortraits.length}`}>
                <AnimatePresence mode="popLayout" initial={false}><motion.span key={activeIndex} initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -8 }} transition={{ duration: .19 }}>{String(activeIndex + 1).padStart(2, '0')}</motion.span></AnimatePresence>
                <span> / {String(communityPortraits.length).padStart(2, '0')}</span>
              </span>
              <button type="button" onClick={() => move(-1)} disabled={activeIndex === 0} aria-label="Previous portrait" aria-controls={carouselId}><ChevronLeft size={20} strokeWidth={1.5} /></button>
              <button type="button" onClick={() => move(1)} disabled={activeIndex === communityPortraits.length - 1} aria-label="Next portrait" aria-controls={carouselId}><ChevronRight size={20} strokeWidth={1.5} /></button>
            </div>
          </div>
          <TeamNameSelector members={communityPortraits} activeIndex={activeIndex} onSelect={(index) => goTo(index)} carouselId={carouselId} reduced={reduced} />
          <p className="team-gallery-footnote">A few faces from the club, in their own frames. There is a place here for yours, too.</p>
        </div>

        <AnimatePresence>
          {viewerIndex !== null && <TeamLightboxModal key="team-lightbox" members={communityPortraits} index={viewerIndex} onChange={(index) => { goTo(index, { immediate: true }); setViewerIndex(index) }} onClose={() => setViewerIndex(null)} reduced={reduced} carouselId={carouselId} />}
        </AnimatePresence>
      </section>
    </LayoutGroup>
  )
}
