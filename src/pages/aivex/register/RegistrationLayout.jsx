import { motion } from 'framer-motion'
import { MOTION_EASE } from '../../../lib/motion'
import MiFacultyMark from '../../../components/MiFacultyMark'
import AivexLogoMark from '../AivexLogoMark'

export default function RegistrationLayout({ phase, signals, paperLabel, reduced, children }) {
  const orbitMotion = reduced ? { duration: .01 } : { duration: .36, ease: MOTION_EASE.smooth }

  return (
    <div className="axr-container axr-layout">
      <motion.aside className="axr-context"
        initial={reduced ? false : { opacity: 0, x: -22 }} animate={{ opacity: 1, x: 0 }}
        transition={{ duration: .64, ease: MOTION_EASE.smooth }}>
        <div className="axr-context-top"><span>National AI competition</span><span>Second edition</span></div>
        <p className="axr-kicker">The challenge stays sealed.</p>
        <h1>Bring the team.<br /><span>Meet the challenge.</span></h1>
        <p className="axr-lead">
          Register the students who will compete together. The organising committee reveals the challenge when AIVEX opens, so every team starts from the same brief, on the same day.
        </p>
        <div className="axr-signal" aria-hidden="true">
          <div className="axr-signal-grid" />
          <motion.div className="axr-signal-orbit" animate={{ rotate: phase * 118 }} transition={orbitMotion}><i /><i /></motion.div>
          <div className="axr-signal-core">
            <span>AI</span>
            <small>{signals.done ? 'Team signal received' : `${signals.ready}/${signals.total} signals`}</small>
          </div>
          <span className="axr-coordinate axr-coordinate-one">36.07 N</span>
          <span className="axr-coordinate axr-coordinate-two">4.76 E</span>
        </div>
        <p className="axr-confirmation-note"><i aria-hidden="true" />Registration is reviewed by the organising team. Participation remains subject to the official rules and confirmation.</p>
      </motion.aside>

      <motion.div id="aivex-registration-form" className="axr-form-paper"
        initial={reduced ? false : { opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }}
        transition={{ duration: .7, delay: reduced ? 0 : .07, ease: MOTION_EASE.smooth }}>
        <div className="axr-paper-head"><AivexLogoMark /><span>{paperLabel}</span></div>
        {children}
        <p className="axr-paper-credit"><MiFacultyMark lockup className="axr-paper-credit-mark" /></p>
      </motion.div>
    </div>
  )
}
