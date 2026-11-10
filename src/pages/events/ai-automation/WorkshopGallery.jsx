import { useCallback, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import InfinityClubMark from '../../../components/InfinityClubMark'
import { aiAutomationGallery } from './aiAutomationMedia'
import WorkshopPhoto from './WorkshopPhoto'
import WorkshopLightbox from './WorkshopLightbox'

const filters = [
  { id: 'all', label: 'Full deck' },
  { id: '01', label: 'Day 01 · Talks' },
  { id: '02', label: 'Day 02 · Lab' },
]
const countOf = (id) => (id === 'all' ? aiAutomationGallery.length : aiAutomationGallery.filter((photo) => photo.day === id).length)
const pad = (value) => String(value).padStart(2, '0')

function tilt(event) {
  if (event.pointerType !== 'mouse') return
  const card = event.currentTarget
  const box = card.getBoundingClientRect()
  const x = (event.clientX - box.left) / box.width
  const y = (event.clientY - box.top) / box.height
  card.style.setProperty('--rx', `${(.5 - y) * 10}deg`)
  card.style.setProperty('--ry', `${(x - .5) * 12}deg`)
  card.style.setProperty('--mx', `${x * 100}%`)
  card.style.setProperty('--my', `${y * 100}%`)
}
function untilt(event) {
  for (const name of ['--rx', '--ry', '--mx', '--my']) event.currentTarget.style.removeProperty(name)
}

export default function WorkshopGallery() {
  const gridRef = useRef(null)
  const reduced = useReducedMotion()
  const [filter, setFilter] = useState('all')
  const [activeIndex, setActiveIndex] = useState(null)
  const photos = useMemo(() => (filter === 'all' ? aiAutomationGallery : aiAutomationGallery.filter((photo) => photo.day === filter)), [filter])
  const originOf = useCallback((index) => gridRef.current?.querySelectorAll('.ai-deck-card img')[index] ?? null, [])
  const transition = reduced ? { duration: 0 } : { duration: .6, ease: [.16, 1, .3, 1] }

  return (
    <section id="ai-gallery" className="ai-gallery ai-section" aria-labelledby="ai-gallery-title">
      <div className="ai-shell">
        <div className="ai-section-rail ai-mono"><span>06 / The full deck</span><span>{pad(aiAutomationGallery.length)} cards / two days</span></div>
        <header className="ai-gallery-heading">
          <h2 id="ai-gallery-title" data-ai-heading>The moments<br /><em>we keep.</em></h2>
          <div>
            <p>A workshop, dealt in frames. Pick a card to look closer.</p>
            <div className="ai-filters" role="group" aria-label="Filter the photographs">
              {filters.map((item) => (
                <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
                  {item.label}<span className="ai-mono">{pad(countOf(item.id))}</span>
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="ai-deck-reveal">
        <motion.ul ref={gridRef} className="ai-deck-grid" layout={!reduced}>
          <AnimatePresence mode="popLayout" initial={false}>
            {photos.map((photo, index) => (
              <motion.li
                key={photo.id}
                className="ai-deck-item"
                layout={!reduced}
                initial={{ opacity: 0, rotateY: -100, scale: .9 }}
                animate={{ opacity: 1, rotateY: 0, scale: 1 }}
                exit={{ opacity: 0, scale: .85, transition: { duration: reduced ? 0 : .25 } }}
                transition={{ ...transition, delay: reduced ? 0 : Math.min(index, 12) * .03 }}
                style={{ '--tilt': `${((index * 37) % 7) - 3}deg` }}
              >
                <button type="button" className="ai-deck-card" aria-haspopup="dialog" aria-label={`Enlarge photograph ${index + 1}: ${photo.alt}`} onClick={() => setActiveIndex(index)} onPointerMove={tilt} onPointerLeave={untilt}>
                  <span className="ai-deck-index" aria-hidden="true"><b>{pad(index + 1)}</b><InfinityClubMark title="" /></span>
                  <span className="ai-deck-photo"><WorkshopPhoto photo={photo} sizes="(max-width: 540px) 44vw, (max-width: 1100px) 30vw, 300px" /></span>
                  <span className="ai-deck-meta ai-mono" aria-hidden="true"><span>Day {photo.day}</span><span>{photo.category}</span></span>
                  <span className="ai-deck-glare" aria-hidden="true" />
                  <span className="ai-deck-halo" aria-hidden="true" />
                  <span className="ai-deck-expand" aria-hidden="true"><ArrowUpRight size={16} /></span>
                </button>
                <p className="ai-deck-caption">{photo.caption}</p>
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
        </div>
        <div className="ai-gallery-end ai-mono"><span>End of the deck</span><span>The ideas stay open. ↗</span></div>
      </div>
      {activeIndex !== null && <WorkshopLightbox photos={photos} index={activeIndex} onChange={setActiveIndex} onClose={() => setActiveIndex(null)} originOf={originOf} />}
    </section>
  )
}
