import { motion } from 'framer-motion'
import { SPRINGS } from '../../../lib/motion'

// Same language as the shared af-progress: number, label, hairline, pink fill.
// Confirmation is a terminal marker, not a fourth full-width column.
export default function RegistrationStepper({ current, done, onStep, t }) {
  const steps = t?.steps || ['Institution', 'Delegation', 'Students', 'Review']
  const confirmLabel = done ? (t?.confirmed || 'Confirmed') : (t?.confirm || 'Confirm')
  const reached = done ? steps.length : current + 1
  const navLabel = done
    ? (t?.stepperComplete || 'Registration complete')
    : (t?.stepperOf ? t.stepperOf({ current: current + 1, total: steps.length }) : `Step ${current + 1} of ${steps.length}`)
  return (
    <nav className="af-progress axr-stepper" aria-label={navLabel}>
      <div className="axr-stepper-track" aria-hidden="true">
        <span><motion.i animate={{ scaleX: reached / steps.length }} transition={SPRINGS.accordion} /></span>
        <span><motion.i animate={{ scaleX: done ? 1 : 0 }} transition={SPRINGS.accordion} /></span>
      </div>
      <ol>
        {steps.map((label, index) => {
          const active = !done && index === current
          const complete = done || index < current
          return (
            <li key={label} data-active={active ? '' : undefined} data-complete={complete ? '' : undefined}>
              <button type="button" disabled={done || index >= current} onClick={() => onStep(index)}
                aria-current={active ? 'step' : undefined}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <small>{label}</small>
              </button>
            </li>
          )
        })}
        <li className="axr-stepper-end" data-active={done ? '' : undefined} aria-current={done ? 'step' : undefined}>
          <span>{String(steps.length + 1).padStart(2, '0')}</span>
          <small>{confirmLabel}</small>
        </li>
      </ol>
    </nav>
  )
}
