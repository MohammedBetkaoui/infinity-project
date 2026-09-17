import { motion } from 'framer-motion'
import { RotateCcw } from 'lucide-react'

export default function RegistrationSuccess({ teamName, institution, studentCount, contactEmail, reference, reduced, onReset, t }) {
  return (
    <motion.div className="axr-success" role="status"
      initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .4, ease: [0.16, 1, 0.3, 1] }}>
      <span className="axr-success-kicker">{t.successKicker}</span>
      <h2 id="axr-success-heading" tabIndex={-1}>{t.successTitle}</h2>
      <p className="axr-success-stamp">{t.successStamp}</p>

      <dl className="axr-success-record">
        <div><dt>{t.successTeam}</dt><dd>{teamName}</dd></div>
        <div><dt>{t.successInstitution}</dt><dd>{institution}</dd></div>
        <div><dt>{t.successStudents}</dt><dd>{t.successStudentsValue({ count: studentCount })}</dd></div>
        <div><dt>{t.successContact}</dt><dd>{contactEmail}</dd></div>
        {reference && <div><dt>{t.successReference}</dt><dd className="axr-success-ref">{reference}</dd></div>}
      </dl>

      <p className="axr-success-note">
        {t.successNote}
      </p>
      <button type="button" className="af-button af-button-secondary" onClick={onReset}>
        <RotateCcw size={14} aria-hidden="true" /> {t.restart}
      </button>
    </motion.div>
  )
}
