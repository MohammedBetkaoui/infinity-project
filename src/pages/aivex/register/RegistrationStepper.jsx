import { motion } from 'framer-motion'
import { SPRINGS } from '../../../lib/motion'
import { STEPS } from './registrationModel'

// Same language as the shared af-progress: number, label, hairline, pink fill.
// Confirmation is a terminal marker, not a fourth full-width column.
export default function RegistrationStepper({ current, done, onStep }) {
  const reached = done ? STEPS.length : current + 1
  return (
    <nav className="af-progress axr-stepper" aria-label={done ? 'Registration complete' : `Step ${current + 1} of ${STEPS.length}`}>
      <div className="axr-stepper-track" aria-hidden="true">
        <span><motion.i animate={{ scaleX: reached / STEPS.length }} transition={SPRINGS.accordion} /></span>
        <span><motion.i animate={{ scaleX: done ? 1 : 0 }} transition={SPRINGS.accordion} /></span>
      </div>
      <ol>
        {STEPS.map((label, index) => {
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
          <span>04</span>
          <small>{done ? 'Confirmed' : 'Confirm'}</small>
        </li>
      </ol>
    </nav>
  )
}
