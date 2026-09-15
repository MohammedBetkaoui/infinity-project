import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import useMotionPreference from '../hooks/useMotionPreference'
import useScrollAnimations from '../hooks/useScrollAnimations'
import { Plus, Minus, Braces } from 'lucide-react'
import SectionHeading from '../components/SectionHeading'
import useMobileLayout from '../hooks/useMobileLayout'
import { poles } from '../data/siteData'
import { MOTION_EASE } from '../lib/motion'

function PoleDetail({ pole, reduced }) {
  const Icon = pole.icon
  return (
    <motion.div className="pole-detail" initial={reduced ? false : { opacity: .35 }}
      animate={{ opacity: 1 }} transition={{ duration: .25, ease: MOTION_EASE.smooth }}>
      <div className="pole-art" aria-hidden="true">
        <div className="pole-art-grid" />
        <span className="pole-art-label">The Infinity workshop</span>
        <div className="pole-icon-orbit"><Icon size={78} strokeWidth={.9} /></div>
        <Braces className="pole-art-corner" size={24} strokeWidth={1} />
      </div>
      <div className="pole-detail-copy">
        <p className="pole-focus">{pole.focus}</p>
        <h3>{pole.title}</h3>
        <p>{pole.description}</p>
        <Link to="/contact" className="text-link light-link">Count me in</Link>
      </div>
    </motion.div>
  )
}

export default function Poles() {
  const [selected, setSelected] = useState(2)
  const tabsRef = useRef([])
  const stageRef = useRef(null)
  const reduced = useMotionPreference()
  const mobile = useMobileLayout()

  // Same story as AIVEX: tab labels (inner spans, never the buttons), the
  // remounting detail card (depth + display/reading) and the empty state all
  // share one choreography. Rebuilt on every selection — and on layout
  // switch, since accordion and explorer are two different trees.
  useScrollAnimations(stageRef, ({ revealText, revealSection }) => {
    const stage = stageRef.current
    if (!stage) return
    stage.querySelectorAll('.pole-tab > span').forEach((label) => revealText(label, { drift: false }))
    const copy = stage.querySelector('.pole-detail-copy')
    if (copy) {
      revealSection(copy, { mode: 'depth' })
      copy.querySelectorAll('p').forEach((text) => revealText(text, { type: 'lines' }))
      revealText(copy.querySelector('h3'))
      revealText(copy.querySelector('a'), { drift: false })
    }
    revealText(stage.querySelector('.pole-empty'), { type: 'lines' })
  }, { rebuildKey: `${selected}:${mobile}` })

  const handleKeyDown = (event, index) => {
    let next
    if (event.key === 'ArrowDown') next = (index + 1) % poles.length
    else if (event.key === 'ArrowUp') next = (index - 1 + poles.length) % poles.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = poles.length - 1
    else return
    event.preventDefault()
    setSelected(next)
    tabsRef.current[next]?.focus()
  }

  const buttonContents = (pole, index) => {
    const Icon = pole.icon
    return <><Icon size={19} strokeWidth={1.5} /><span>{pole.title}</span>{selected === index ? <Minus size={18} /> : <Plus size={18} />}</>
  }

  return (
    <section id="poles" className="section-space poles-section">
      <div className="page-container">
        <div className="section-intro">
          <SectionHeading title="Find what sparks your curiosity." />
          <p>Seven fields. Seven ways to begin.<br />Follow a curiosity. Make it a skill.</p>
        </div>
        <div className="poles-stage" ref={stageRef}>
        {mobile ? (
          <div className="pole-accordion">
            {poles.map((pole, index) => (
              <div key={pole.title}>
                <button id={`pole-tab-${index}`} type="button"
                  className={`pole-tab ${selected === index ? 'is-selected' : ''}`}
                  aria-expanded={selected === index} aria-controls={`pole-panel-${index}`}
                  onClick={() => setSelected(selected === index ? -1 : index)}>
                  {buttonContents(pole, index)}
                </button>
                <div id={`pole-panel-${index}`} role="region" aria-labelledby={`pole-tab-${index}`} hidden={selected !== index}>
                  {selected === index && <PoleDetail pole={pole} reduced={reduced} />}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="poles-explorer">
            <div className="pole-tabs" role="tablist" aria-label="Explore our fields" aria-orientation="vertical">
              {poles.map((pole, index) => (
                <button key={pole.title} ref={(node) => { tabsRef.current[index] = node }} id={`pole-tab-${index}`}
                  type="button" role="tab" aria-selected={selected === index} aria-controls={`pole-panel-${index}`}
                  tabIndex={selected === index || (selected === -1 && index === 0) ? 0 : -1}
                  onKeyDown={(event) => handleKeyDown(event, index)} onClick={() => setSelected(index)}
                  className={`pole-tab ${selected === index ? 'is-selected' : ''}`}>
                  {buttonContents(pole, index)}
                </button>
              ))}
            </div>
            <div className="pole-detail-host">
              {poles.map((pole, index) => (
                <div key={pole.title} id={`pole-panel-${index}`} role="tabpanel"
                  aria-labelledby={`pole-tab-${index}`} hidden={selected !== index} tabIndex={0}>
                  {selected === index && <PoleDetail pole={pole} reduced={reduced} />}
                </div>
              ))}
              {selected === -1 && <p className="pole-empty">Choose a field to explore its workshop.</p>}
            </div>
          </div>
        )}
        </div>
        <p className="poles-note">Torn between a few fields? <Link to="/contact">Come and talk it through with us.</Link></p>
      </div>
    </section>
  )
}
