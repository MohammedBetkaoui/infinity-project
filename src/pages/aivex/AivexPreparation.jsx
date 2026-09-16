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
    if (count === TOTAL) return 'All items checked. The official rules will refine the details — your groundwork already stands.'
    if (count === 0) return `${TOTAL} signals to work through. Nothing here is submitted: this stays on your device.`
    return `${count} of ${TOTAL} signals locked. Nothing is submitted here — this stays with you.`
  }, [count])

  return (
    <section className="ax-preparation" id="preparation" aria-labelledby="ax-preparation-title" tabIndex={-1}>
      <div className="ax-container ax-preparation-layout">
        <div className="ax-preparation-intro">
          <p className="ax-preparation-eyebrow">Before the doors open</p>
          <h2 id="ax-preparation-title">Five signals.<br />One working prototype.</h2>
          <p>The official rules are still on their way. That is not a reason to wait — work through these five signals now, at your own pace, and arrive with something real to show.</p>

          <aside className="ax-preparation-tracker" aria-label="Personal preparation progress">
            <div className="ax-tracker-heading"><Radar size={18} strokeWidth={1.6} aria-hidden="true" /><span>Preparation signal</span></div>
            <div className="ax-tracker-count">
              <SignalCount value={count} reduced={reduced} />
              <span>/ {TOTAL}<small>signals locked</small></span>
            </div>
            <div className="ax-tracker-line" aria-hidden="true">
              <motion.span animate={{ scaleX: count / TOTAL }} initial={false}
                transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 186, damping: 25 }} />
            </div>
            <p role="status" aria-live="polite">{statusMessage}</p>
            <button type="button" className="ax-tracker-reset" disabled={!count} onClick={() => setChecked([])}>
              <RotateCcw size={12} strokeWidth={2} aria-hidden="true" />Reset signals
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
          <p className="ax-preparation-disclaimer">A thinking tool, not a submission checklist or an evaluation rubric. Saved on this device only — it is never sent anywhere, and clearing your browser data clears it too.</p>
        </div>
      </div>
    </section>
  )
}
