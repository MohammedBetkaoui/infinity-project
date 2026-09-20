import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import { IDENTITY_CARD_SUBJECTS } from '../../../../shared/aivex/contract-v4.js'
import IdentityCardUpload from './IdentityCardUpload'
import { fieldId } from './useCompetitionRegistration'

// "Identity documents": one national identity card image for the head of
// delegation and one for the driver, kept apart from the two records above so
// the section, its privacy note and its progress read as one unit.
//
// Data minimisation: only the image is collected. Nothing is read from it
// (no number, no OCR), and it is not displayed back — the form shows the file
// name, type and size only.
export default function IdentityDocuments({ registration, order = 2, reduced, t }) {
  const { delegationHead, driver, droppedIdCards, fieldError, setIdentityCard, touch } = registration
  const people = { delegationHead, driver }
  const labels = { delegationHead: t.idHeadLabel, driver: t.idDriverLabel }
  const attached = IDENTITY_CARD_SUBJECTS.filter((subject) => people[subject].idCard).length
  const total = IDENTITY_CARD_SUBJECTS.length
  const complete = attached === total

  return (
    <motion.section
      id="axr-identity-documents"
      className="axr-record axr-identity"
      aria-labelledby="axr-identity-title"
      aria-describedby="axr-identity-privacy"
      data-complete={complete ? '' : undefined}
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: .32, delay: reduced ? 0 : order * .05, ease: [0.16, 1, 0.3, 1] }}
    >
      <header className="axr-record-head">
        <div className="axr-record-title">
          <span className="axr-record-index"><b>{String(order + 1).padStart(2, '0')}</b> / {t.idKicker}</span>
          <h3 id="axr-identity-title">{t.idTitle}</h3>
        </div>
        <span className="axr-record-state" data-complete={complete ? '' : undefined} aria-live="polite">
          {t.idProgress({ attached, total })}
        </span>
      </header>

      <div className="axr-record-body axr-identity-body">
        <p className="axr-identity-intro">{t.idIntro}</p>
        <p id="axr-identity-privacy" className="axr-identity-privacy">
          <Lock size={13} strokeWidth={1.8} aria-hidden="true" />
          <span>{t.idPrivacy}</span>
        </p>
        <div className="axr-identity-grid">
          {IDENTITY_CARD_SUBJECTS.map((subject) => (
            <IdentityCardUpload
              key={subject}
              inputId={fieldId('identityDocuments', subject)}
              label={labels[subject]}
              file={people[subject].idCard}
              dropped={droppedIdCards[subject]}
              error={fieldError('identityDocuments', subject)}
              t={t}
              onChange={(file) => {
                setIdentityCard(subject, file)
                touch(`identityDocuments.${subject}`)
              }}
            />
          ))}
        </div>
      </div>
    </motion.section>
  )
}
