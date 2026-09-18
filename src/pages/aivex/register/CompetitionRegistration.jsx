import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Copy } from 'lucide-react'
import { Link } from 'react-router-dom'
import useMotionPreference from '../../../hooks/useMotionPreference'
import { MOTION_EASE } from '../../../lib/motion'
import DelegationStep from './DelegationStep'
import InstitutionStep from './InstitutionStep'
import { SECTIONS, STEP, STUDENT_COUNT, institutionLabel } from './registrationModel'
import { REGISTER_LANG_STORAGE_KEY, getRegistrationStrings } from './registrationI18n'
import RegistrationLayout from './RegistrationLayout'
import RegistrationStepper from './RegistrationStepper'
import RegistrationSuccess from './RegistrationSuccess'
import ReviewStep from './ReviewStep'
import StudentsStep from './StudentsStep'
import useCompetitionRegistration from './useCompetitionRegistration'

const INSTAGRAM_URL = 'https://www.instagram.com/club_.infinity/'

const readLang = () => {
  try {
    const saved = window.localStorage.getItem(REGISTER_LANG_STORAGE_KEY)
    if (saved === 'fr' || saved === 'ar' || saved === 'en') return saved
  } catch {
    // Private browsing: keep default.
  }
  return 'en'
}

export default function CompetitionRegistration() {
  const reduced = useMotionPreference()
  const [lang, setLang] = useState(readLang)
  const t = getRegistrationStrings(lang)
  const registration = useCompetitionRegistration(lang)
  const { step, status, team, activityOfficial, result, sectionComplete, completeCount } = registration
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef(0)
  const done = status === 'success'

  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  useEffect(() => {
    try {
      window.localStorage.setItem(REGISTER_LANG_STORAGE_KEY, lang)
    } catch {
      // Ignore storage failures.
    }
  }, [lang])

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(registration.summary())
      setCopied(true)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const signals = {
    done,
    ready: Object.values(sectionComplete).filter(Boolean).length + completeCount,
    total: Object.keys(SECTIONS).length + STUDENT_COUNT,
  }
  const paperLabel = done ? t.paperReceived : registration.hasDraft ? t.paperDraft : t.paperDefault
  const stepMotion = reduced ? { duration: .01 } : { duration: .36, ease: MOTION_EASE.smooth }

  return (
    <RegistrationLayout phase={done ? t.steps.length : step} signals={signals} paperLabel={paperLabel} reduced={reduced}
      lang={lang} onLang={setLang} t={t}>
      {!done && (
        <div className="axr-paper-nav">
          {step > STEP.institution ? (
            <button type="button" className="axr-paper-back" onClick={registration.back}>
              <ArrowLeft size={14} aria-hidden="true" /> {t.backToPrefix} {t.steps[step - 1]}
            </button>
          ) : (
            <Link to="/aivex" className="axr-paper-back">
              <ArrowLeft size={14} aria-hidden="true" /> {t.backToEvent}
            </Link>
          )}
        </div>
      )}
      <RegistrationStepper current={step} done={done} onStep={registration.goTo} t={t} />

      {done ? (
        <RegistrationSuccess teamName={team.name.trim()} institution={institutionLabel(team, lang)} studentCount={STUDENT_COUNT}
          contactEmail={activityOfficial.email.trim()} reference={result?.reference} reduced={reduced} onReset={registration.reset} t={t} />
      ) : (
        <form onSubmit={registration.submit} noValidate aria-label={t.formAria}>
          <div className="af-trap" aria-hidden="true">
            <label htmlFor="axr-website">Website</label>
            <input id="axr-website" name="website" value={registration.website} tabIndex={-1} autoComplete="off"
              onChange={(event) => registration.setWebsite(event.target.value)} />
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={`${lang}-${step}`} className="axr-form-step"
              initial={reduced ? false : { opacity: 0, x: 19 }} animate={{ opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: -13 }} transition={stepMotion}>
              {step === STEP.institution && <InstitutionStep registration={registration} reduced={reduced} t={t} lang={lang} />}
              {step === STEP.delegation && <DelegationStep registration={registration} reduced={reduced} t={t} />}
              {step === STEP.students && <StudentsStep registration={registration} reduced={reduced} t={t} />}
              {step === STEP.review && <ReviewStep registration={registration} t={t} lang={lang} />}
            </motion.div>
          </AnimatePresence>

          {(status === 'draft' || status === 'error') && (
            <motion.div className="af-form-alert" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <strong>{status === 'draft' ? t.alertDraftTitle : t.alertErrorTitle}</strong>
              <p>{result?.message || t.alertFallback}</p>
              <div className="axr-alert-actions">
                <button type="button" onClick={copySummary}><Copy size={13} aria-hidden="true" />{copied ? t.copied : t.copySummary}</button>
                <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">{t.contactTeam}</a>
              </div>
            </motion.div>
          )}

          <div className="af-actions">
            {step > STEP.institution
              ? <button type="button" className="af-button af-button-secondary axr-back-button" onClick={registration.back}>{t.back}</button>
              : <span className="af-submit-note">{t.draftNote}</span>}
            {step < STEP.review ? (
              <button type="button" className="af-button af-button-primary" onClick={registration.advance}>{t.continue}</button>
            ) : (
              <button type="submit" className="af-button af-button-primary" disabled={status === 'submitting'}>
                {status === 'submitting' ? t.submitting : t.submit}
              </button>
            )}
          </div>
        </form>
      )}
    </RegistrationLayout>
  )
}
