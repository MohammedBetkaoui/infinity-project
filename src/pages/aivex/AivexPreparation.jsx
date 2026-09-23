import { useEffect, useMemo, useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Check, Radar, RotateCcw } from 'lucide-react'
import useMotionPreference from '../../hooks/useMotionPreference'
import { preparationItems } from './aivexData'
import './aivex-preparation.css'

const STORAGE_KEY = 'aivex-2026-preparation-checklist'
const TOTAL = preparationItems.length
const VALID_IDS = new Set(preparationItems.map((item) => item.id))

const readStoredChecklist = () => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id) => VALID_IDS.has(id)) : []
  } catch {
    return []
  }
}

// Big tabular counter that tweens between values instead of jumping,
// mirroring the spring already used for the progress bar below it.
function SignalCount({ value, reduced }) {
  const spring = useMotionValue(value)
  const rounded = useTransform(spring, (latest) => Math.round(latest))
  useEffect(() => {
    if (reduced) { spring.set(value); return undefined }
    const controls = animate(spring, value, { type: 'spring', stiffness: 210, damping: 26 })
    return () => controls.stop()
  }, [value, reduced, spring])
  return <motion.strong aria-hidden="true">{rounded}</motion.strong>
}

export default function AivexPreparation() {
  const [checked, setChecked] = useState(readStoredChecklist)
  const reduced = useMotionPreference()
  const count = checked.length

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(checked))
    } catch {
      // A private browser can refuse storage; the checklist still works for this visit.
    }
  }, [checked])

  const toggle = (id) => setChecked((previous) => (
    previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]
  ))

  const statusMessage = useMemo(() => {
    if (count === TOTAL) return 'All skill areas covered. Your team can now turn this map into a focused AI challenge response.'
    if (count === 0) return `${TOTAL} skill areas to explore. Nothing here is submitted: this stays on your device.`
    return `${count} of ${TOTAL} skill areas mapped. Nothing is submitted here — this stays with you.`
  }, [count])

  return (
    <section className="ax-preparation" id="preparation" aria-labelledby="ax-preparation-title" tabIndex={-1}>
      <div className="ax-container ax-preparation-layout">
        <div className="ax-preparation-intro">
          <p className="ax-preparation-eyebrow">BE READY FOR THE CHALLENGE</p>
          <h2 id="ax-preparation-title">Five skills.<br />One AI challenge.</h2>
          <p>AIVEX challenges participants to tackle a problem proposed by the jury. The nature of the challenge may vary from one edition to another, requiring teams to adapt, explore the problem, make relevant technical choices and develop a well-founded AI-based solution.</p>

          <aside className="ax-preparation-tracker" aria-label="Personal preparation progress">
            <div className="ax-tracker-heading"><Radar size={18} strokeWidth={1.6} aria-hidden="true" /><span>Team readiness</span></div>
            <div className="ax-tracker-count">
              <SignalCount value={count} reduced={reduced} />
              <span>/ {TOTAL}<small>skill areas</small></span>
            </div>
            <div className="ax-tracker-line" aria-hidden="true">
              <motion.span animate={{ scaleX: count / TOTAL }} initial={false}
                transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 186, damping: 25 }} />
            </div>
            <p role="status" aria-live="polite">{statusMessage}</p>
            <button type="button" className="ax-tracker-reset" disabled={!count} onClick={() => setChecked([])}>
              <RotateCcw size={12} strokeWidth={2} aria-hidden="true" />Reset skills
            </button>
          </aside>
        </div>

        <div>
          <fieldset className="ax-preparation-list"><legend className="sr-only">My AIVEX preparation checklist</legend>
            {preparationItems.map((item, index) => (
              <label className={`ax-preparation-item${checked.includes(item.id) ? ' is-checked' : ''}`} key={item.id}>
                <input className="ax-preparation-input" type="checkbox" checked={checked.includes(item.id)}
                  onChange={() => toggle(item.id)} aria-labelledby={`ax-prep-title-${item.id}`} aria-describedby={`ax-prep-note-${item.id}`} />
                <span className="ax-preparation-check" aria-hidden="true">
                  <span className="ax-check-index">{String(index + 1).padStart(2, '0')}</span>
                  <Check size={15} strokeWidth={2.2} />
                </span>
                <span className="ax-preparation-copy">
                  <strong id={`ax-prep-title-${item.id}`}>{item.title}</strong>
                  <span id={`ax-prep-note-${item.id}`}>{item.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="ax-preparation-disclaimer">These skill areas are guidance only. They are not registration requirements or judging criteria. Team members may cover several areas, and the exact domain, dataset, objectives and technical constraints will be defined by the jury.</p>
        </div>
      </div>
    </section>
  )
}
