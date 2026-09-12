import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, NotebookPen } from 'lucide-react'
import useMotionPreference from '../../hooks/useMotionPreference'
import { preparationItems } from './aivexData'

export default function AivexPreparation() {
  const [checked, setChecked] = useState([])
  const reduced = useMotionPreference()
  const count = checked.length
  const toggle = id => setChecked(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])

  return (
    <section className="ax-preparation" id="preparation" aria-labelledby="ax-preparation-title" tabIndex={-1}>
      <div className="ax-container ax-preparation-layout">
        <div className="ax-preparation-intro">
          <h2 id="ax-preparation-title">Give your idea a head start.<br />No need to wait.</h2>
          <p>While the official details are on their way, start shaping your project. Use this notebook to move forward at your own pace.</p>
          <aside className="ax-preparation-tracker" aria-label="Personal notebook progress">
            <div className="ax-tracker-heading"><NotebookPen size={20} strokeWidth={1.5} aria-hidden="true" /><span>My preparation notebook</span></div>
            <div className="ax-tracker-count" aria-hidden="true"><strong>{count}</strong><span>/ {preparationItems.length}<small>items checked</small></span></div>
            <div className="ax-tracker-line" aria-hidden="true"><motion.span animate={{ scaleX: count / preparationItems.length }} initial={false} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 186, damping: 25 }} /></div>
            <p role="status" aria-live="polite">{count === preparationItems.length ? 'All items checked. Remember to read the official rules, too.' : `${count} of ${preparationItems.length} items checked. Nothing to submit: this notebook is just for you.`}</p>
            <button type="button" className="ax-tracker-reset" disabled={!count} onClick={() => setChecked([])}>Uncheck all</button>
          </aside>
        </div>
        <div>
          <fieldset className="ax-preparation-list"><legend className="sr-only">My project preparation checklist</legend>
            {preparationItems.map(item => <label className={`ax-preparation-item${checked.includes(item.id) ? ' is-checked' : ''}`} key={item.id}>
              <input className="ax-preparation-input" type="checkbox" checked={checked.includes(item.id)} onChange={() => toggle(item.id)} aria-labelledby={`ax-prep-title-${item.id}`} aria-describedby={`ax-prep-note-${item.id}`} />
              <span className="ax-preparation-check" aria-hidden="true"><Check size={16} strokeWidth={1.8} /></span>
              <span className="ax-preparation-copy"><strong id={`ax-prep-title-${item.id}`}>{item.title}</strong><span id={`ax-prep-note-${item.id}`}>{item.detail}</span></span>
            </label>)}
          </fieldset>
          <p className="ax-preparation-disclaimer">A thinking tool, not a submission checklist or an evaluation rubric. Your selections last only for this visit to the page.</p>
        </div>
      </div>
    </section>
  )
}
