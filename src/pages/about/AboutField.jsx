import { useId, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import useMotionPreference from '../../hooks/useMotionPreference'
import { SPRINGS } from '../../lib/motion'

export default function AboutField({ pole }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const reduced = useMotionPreference()
  const Icon = pole.icon

  return (
    <li className="about-field" data-open={open}>
      <h3>
        <button id={`${id}-button`} type="button" aria-expanded={open} aria-controls={`${id}-detail`} onClick={() => setOpen(!open)}>
          <Icon className="about-field-icon" aria-hidden="true" />
          <span>{pole.title}</span>
          <motion.span className="about-field-toggle" aria-hidden="true" animate={{ rotate: open ? 45 : 0 }} transition={reduced ? { duration: 0 } : SPRINGS.control}>
            <Plus size={17} />
          </motion.span>
        </button>
      </h3>
      <p className="about-field-focus">{pole.focus}</p>
      <motion.div id={`${id}-detail`} aria-labelledby={`${id}-button`} aria-hidden={!open} initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        transition={reduced ? { duration: 0 } : SPRINGS.accordion} className="about-field-detail">
        <p>{pole.description}</p>
      </motion.div>
    </li>
  )
}
