import { useId, useRef, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, ArrowUpRight, MoveHorizontal } from 'lucide-react'
import useMotionPreference from '../../hooks/useMotionPreference'
import { communityPortraits } from './communityData'
import TeamFrame from './TeamFrame'
import TeamNameSelector from './TeamNameSelector'
import TeamLightboxModal from './TeamLightboxModal'
import useTeamCarousel from './useTeamCarousel'
import './team-carousel.css'

const initialIndex = Math.max(0, communityPortraits.findIndex((member) => member.id === 'green-skhara'))

export default function TeamCarousel() {
  const stageRef = useRef(null)
  const [viewerIndex, setViewerIndex] = useState(null)
  const reduced = useMotionPreference()
  const groupId = useId()
  const carouselId = `${groupId}-portraits`
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
      <section id="meet-infiniters" className="team-gallery" aria-labelledby="community-people-title" data-motion-trigger="viewport">
        <div className="page-container">
          <p className="community-section-index community-section-index-dark" data-animated-text=""><span>01 / The collective</span><span>{String(communityPortraits.length).padStart(2, '0')} people. Endless possibilities.</span></p>
        </div>
        <div className="page-container team-gallery-heading">
          <div>
            <p className="team-gallery-overline" data-animated-text="">Meet the Infiniters</p>
            <h2 id="community-people-title">Many minds.<br /><em>One Infinity.</em></h2>
          </div>
          <p>The ideas, the craft, the energy.<br />Meet the people who bring Infinity to life.</p>
        </div>

        <div className="page-container">
          <div className="team-exhibition">
            <div className="team-caption-row" data-animated-text="">
              <div className="team-profile-label">
                <span>In the frame</span>
                <span className="team-counter" aria-label={`Portrait ${activeIndex + 1} of ${communityPortraits.length}`}>
                  <AnimatePresence mode="popLayout" initial={false}><motion.span key={activeIndex} initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -8 }} transition={{ duration: .19 }}>{String(activeIndex + 1).padStart(2, '0')}</motion.span></AnimatePresence>
                  <span> / {String(communityPortraits.length).padStart(2, '0')}</span>
                </span>
              </div>
              <div className="team-active-credit" aria-live="polite" aria-atomic="true">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={active.id} initial={{ opacity: 0, y: reduced ? 0 : 9 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -6 }} transition={{ duration: .2 }}>
                    <h3>{active.name}</h3><p>{active.role}</p>
                  </motion.div>
                </AnimatePresence>
              </div>
              <p className="team-profile-note">Different perspectives.<br />A shared sense of possibility.</p>
              <button type="button" className="team-view-action" onClick={() => openPortrait(activeIndex)} aria-haspopup="dialog" aria-label={`View ${active.name}'s portrait full size`}>
                View full portrait <ArrowUpRight size={18} strokeWidth={1.5} aria-hidden="true" />
              </button>
              <div className="team-profile-bottom">
                <p id={`${carouselId}-help`}>Explore the collective<span>Drag a portrait or choose a face below.</span><span className="sr-only">Use Left and Right to browse, Home and End to reach the first and last portrait, and Enter to open the selected portrait.</span></p>
                <div className="team-controls">
                  <button type="button" onClick={() => move(-1)} disabled={activeIndex === 0} aria-label="Previous portrait" aria-controls={carouselId}><ArrowLeft size={20} strokeWidth={1.5} /></button>
                  <button type="button" onClick={() => move(1)} disabled={activeIndex === communityPortraits.length - 1} aria-label="Next portrait" aria-controls={carouselId}><ArrowRight size={20} strokeWidth={1.5} /></button>
                </div>
              </div>
            </div>
            <div ref={stageRef} id={carouselId} className="team-stage" role="region" aria-roledescription="carousel" aria-label="Infinity team portraits" tabIndex={0} aria-describedby={`${carouselId}-help`} onKeyDown={handleKey}>
              <div className="team-stage-label" aria-hidden="true"><span>Infinity portrait collection</span><span>Scroll to discover</span></div>
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
              <span className="team-drag-hint" aria-hidden="true"><MoveHorizontal size={17} strokeWidth={1.25} /> Drag to explore</span>
            </div>
          </div>
          <TeamNameSelector members={communityPortraits} activeIndex={activeIndex} onSelect={(index) => goTo(index)} carouselId={carouselId} reduced={reduced} />
          <p className="team-gallery-footnote" data-animated-text=""><span>Individual voices. Collective spirit.</span><span>Infinity Club / No limits for Infiniters</span></p>
        </div>

        <AnimatePresence>
          {viewerIndex !== null && <TeamLightboxModal key="team-lightbox" members={communityPortraits} index={viewerIndex} onChange={(index) => { goTo(index, { immediate: true }); setViewerIndex(index) }} onClose={() => setViewerIndex(null)} reduced={reduced} carouselId={carouselId} />}
        </AnimatePresence>
      </section>
    </LayoutGroup>
  )
}
