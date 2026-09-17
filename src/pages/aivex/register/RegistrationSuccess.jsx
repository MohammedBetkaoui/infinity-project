import { motion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'

export default function RegistrationSuccess({ teamName, institution, studentCount, contactEmail, reference, reduced, onReset }) {
  return (
    <motion.div className="axr-success" role="status"
      initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .4, ease: [0.16, 1, 0.3, 1] }}>
      <span className="axr-success-kicker">Registration signal</span>
      <h2 id="axr-success-heading" tabIndex={-1}>Team registered.</h2>
      <p className="axr-success-stamp">Registration received ✓</p>

      <dl className="axr-success-record">
        <div><dt>Team</dt><dd>{teamName}</dd></div>
        <div><dt>Institution</dt><dd>{institution}</dd></div>
        <div><dt>Students</dt><dd>{studentCount} students</dd></div>
        <div><dt>Contact</dt><dd>{contactEmail}</dd></div>
        {reference && <div><dt>Reference</dt><dd className="axr-success-ref">{reference}</dd></div>}
      </dl>

      <p className="axr-success-note">
        The next AIVEX updates will be sent to the activity administration contact above. The challenge itself stays sealed until the competition opens.
        Keep the reference for any follow-up with the organisers.
      </p>
      <button type="button" className="af-button af-button-secondary" onClick={onReset}>
        <RotateCcw size={14} aria-hidden="true" /> Start a new registration
      </button>
    </motion.div>
  )
}
