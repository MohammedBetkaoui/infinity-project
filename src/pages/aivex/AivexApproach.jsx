import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import AivexCodeStudy from './AivexCodeStudy'
import useMotionPreference from '../../hooks/useMotionPreference'
import { approach } from './aivexData'

export default function AivexApproach() {
  const [selected, setSelected] = useState(0)
  const tabsRef = useRef([])
  const reduced = useMotionPreference()
  const current = approach[selected]

  const onKeyDown = (event, index) => {
    let next
    if (event.key === 'ArrowRight') next = (index + 1) % approach.length
    if (event.key === 'ArrowLeft') next = (index + approach.length - 1) % approach.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = approach.length - 1
    if (next === undefined) return
    event.preventDefault()
    setSelected(next)
    tabsRef.current[next]?.focus()
  }

  return (
    <section className="ax-approach" id="approche" aria-labelledby="ax-approach-title" tabIndex={-1}>
      <div className="ax-container">
        <div className="ax-manifesto">
          <h2 id="ax-approach-title">Less talk.<br />More <span>making.<svg viewBox="0 0 280 18" aria-hidden="true"><path className="ax-ink-line" pathLength="1" d="M3 12 Q132 0 277 8 M30 16 Q150 9 251 13" /></svg></span></h2>
          <div className="ax-manifesto-copy">
            <p>AIVEX is a national competition dedicated to programming artificial intelligence applications.</p>
            <p>Led by Infinity Club at Mohamed El Bachir El Ibrahimi University in Bordj Bou Arreridj, this second edition puts one conviction first: AI matters most when we do something with it.</p>
          </div>
        </div>
        <div className="ax-workbench">
          <div className="ax-workbench-top"><h3>From an idea to an application.</h3><p>The way we see it.</p></div>
          <div className="ax-process-tabs" role="tablist" aria-label="Explore the AIVEX approach">
            {approach.map((item, index) => (
              <button key={item.id} role="tab" id={`ax-tab-${item.id}`} aria-selected={selected === index}
                aria-controls="ax-process-panel" tabIndex={selected === index ? 0 : -1}
                ref={node => { tabsRef.current[index] = node }} onClick={() => setSelected(index)} onKeyDown={event => onKeyDown(event, index)}>
                <span className="ax-process-node" aria-hidden="true" />{item.label}
              </button>
            ))}
          </div>
          <div className="ax-process-panel" role="tabpanel" id="ax-process-panel" aria-labelledby={`ax-tab-${current.id}`} tabIndex={0}>
            <div className="ax-process-copy">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={current.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? .08 : .14 }}>
                  <h4>{current.title}</h4><p>{current.text}</p>
                </motion.div>
              </AnimatePresence>
            </div>
            <AivexCodeStudy current={current} selected={selected} />
          </div>
        </div>
      </div>
    </section>
  )
}
