import { motion } from 'framer-motion'
import { Braces } from 'lucide-react'
import useMotionPreference from '../../hooks/useMotionPreference'

export default function AivexCodeStudy({ current, selected }) {
  const reduced = useMotionPreference()
  return (
    <div className="ax-code-perspective" aria-hidden="true">
      <motion.div className="ax-code-stack" animate={{ rotateY: reduced ? 0 : [0, -3.5, 2.4][selected], rotateX: reduced ? 0 : [0, 2.5, -1.5][selected] }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 148, damping: 23, mass: .75 }}>
        <div className="ax-code-layer ax-code-layer-back" />
        <div className="ax-code-layer ax-code-layer-mid" />
        <div className="ax-code-study">
          <div className="ax-code-header"><Braces size={18} /><span>idea in progress</span><i /></div>
          <div className="ax-code-lines">{current.code.map(line => <p key={line}><span>{line.split(' ')[0]}</span>{line.slice(line.indexOf(' '))}</p>)}</div>
          <p className="ax-code-caption">{current.caption}</p>
          <svg className="ax-circuit" viewBox="0 0 440 88" fill="none">
            <path className="ax-circuit-guide" d="M0 50H87L112 25H220L259 64H341L365 40H440" />
            <path className="ax-circuit-ink" pathLength="1" d="M0 50H87L112 25H220L259 64H341L365 40H440" />
            <circle cx="112" cy="25" r="4" /><circle cx="259" cy="64" r="4" /><circle cx="365" cy="40" r="4" />
          </svg>
        </div>
      </motion.div>
    </div>
  )
}
