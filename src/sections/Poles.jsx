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
  const stageRef = useRef(null)
  const tabsRef = useRef([])
  const reduced = useMotionPreference()
  const mobile = useMobileLayout()

  // Same story as the FAQ: tab labels (inner spans, never the buttons) plus
  // the open panel copy share one choreography. Rebuilt on every toggle —
  // mounts are synchronous here.
  useScrollAnimations(stageRef, ({ revealText }) => {
    const stage = stageRef.current
    if (!stage) return
    stage.querySelectorAll('.pole-tab > span').forEach((label) => revealText(label, { drift: false }))
    stage.querySelectorAll('[role="tabpanel"] h3, [role="tabpanel"] p, [role="region"] h3, [role="region"] p')
      .forEach((copy) => revealText(copy, { type: copy.tagName === 'H3' ? 'words' : 'lines' }))
    stage.querySelectorAll('.pole-detail-copy a').forEach((link) => revealText(link, { drift: false }))
  }, { rebuildKey: selected })

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
          <p>Six fields. Six ways to begin.<br />Follow a curiosity. Make it a skill.</p>
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
        <p className="poles-note"><span>Torn between a few fields? </span><Link to="/contact">Come and talk it through with us.</Link></p>
      </div>
    </section>
  )
}
