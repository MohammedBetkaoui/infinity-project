import { motion } from 'framer-motion'
import { SPRINGS } from '../../lib/motion'

export default function ApplicationProgress({ steps, current, onStep }) {
  return (
    <div className="af-progress" aria-label={`Step ${current + 1} of ${steps.length}`}>
      <div className="af-progress-track" aria-hidden="true">
        <motion.span animate={{ scaleX: (current + 1) / steps.length }} transition={SPRINGS.accordion} />
      </div>
      <ol>
        {steps.map((item, index) => (
          <li key={item.label} data-active={index === current ? '' : undefined} data-complete={index < current ? '' : undefined}>
            <button type="button" disabled={index >= current} onClick={() => onStep(index)}
              aria-current={index === current ? 'step' : undefined}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <small>{item.label}</small>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
