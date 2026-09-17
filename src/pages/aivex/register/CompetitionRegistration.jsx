import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Copy } from 'lucide-react'
import { Link } from 'react-router-dom'
import useMotionPreference from '../../../hooks/useMotionPreference'
import { MOTION_EASE } from '../../../lib/motion'
import DelegationStep from './DelegationStep'
import InstitutionStep from './InstitutionStep'
import { SECTIONS, STEP, STEPS, STUDENT_COUNT, buildSummary, institutionLabel } from './registrationModel'
import RegistrationLayout from './RegistrationLayout'
import RegistrationStepper from './RegistrationStepper'
import RegistrationSuccess from './RegistrationSuccess'
import ReviewStep from './ReviewStep'
import StudentsStep from './StudentsStep'
import useCompetitionRegistration from './useCompetitionRegistration'

const INSTAGRAM_URL = 'https://www.instagram.com/club_.infinity/'

export default function CompetitionRegistration() {
  const reduced = useMotionPreference()
  const registration = useCompetitionRegistration()
  const { step, status, team, activityOfficial, result, sectionComplete, completeCount } = registration
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef(0)
  const done = status === 'success'

  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildSummary(registration))
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
  const paperLabel = done ? 'Registration / received' : registration.hasDraft ? 'Draft recovered' : 'Team registration / 02'
  const stepMotion = reduced ? { duration: .01 } : { duration: .36, ease: MOTION_EASE.smooth }

  return (
    <RegistrationLayout phase={done ? STEPS.length : step} signals={signals} paperLabel={paperLabel} reduced={reduced}>
      {!done && (
        <div className="axr-paper-nav">
          {step > STEP.institution ? (
            <button type="button" className="axr-paper-back" onClick={registration.back}>
              <ArrowLeft size={14} aria-hidden="true" /> Back to {STEPS[step - 1]}
            </button>
          ) : (
            <Link to="/aivex" className="axr-paper-back">
              <ArrowLeft size={14} aria-hidden="true" /> Back to event page
            </Link>
          )}
        </div>
      )}
      <RegistrationStepper current={step} done={done} onStep={registration.goTo} />

      {done ? (
        <RegistrationSuccess teamName={team.name.trim()} institution={institutionLabel(team)} studentCount={STUDENT_COUNT}
          contactEmail={activityOfficial.email.trim()} reference={result?.reference} reduced={reduced} onReset={registration.reset} />
      ) : (
        <form onSubmit={registration.submit} noValidate aria-label="AIVEX second edition team registration">
          <div className="af-trap" aria-hidden="true">
            <label htmlFor="axr-website">Website</label>
            <input id="axr-website" name="website" value={registration.website} tabIndex={-1} autoComplete="off"
              onChange={(event) => registration.setWebsite(event.target.value)} />
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={step} className="axr-form-step"
              initial={reduced ? false : { opacity: 0, x: 19 }} animate={{ opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: -13 }} transition={stepMotion}>
              {step === STEP.institution && <InstitutionStep registration={registration} reduced={reduced} />}
              {step === STEP.delegation && <DelegationStep registration={registration} reduced={reduced} />}
              {step === STEP.students && <StudentsStep registration={registration} reduced={reduced} />}
              {step === STEP.review && <ReviewStep registration={registration} />}
            </motion.div>
          </AnimatePresence>

          {(status === 'draft' || status === 'error') && (
            <motion.div className="af-form-alert" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <strong>{status === 'draft' ? 'The registration is prepared, but not transmitted.' : 'The registration was not sent.'}</strong>
              <p>{result?.message || 'Online delivery is not connected yet. Every answer stays in this tab; student card photos need to be attached again if the page reloads.'}</p>
              <div className="axr-alert-actions">
                <button type="button" onClick={copySummary}><Copy size={13} aria-hidden="true" />{copied ? 'Copied' : 'Copy registration summary'}</button>
                <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">Contact the AIVEX team</a>
              </div>
            </motion.div>
          )}

          <div className="af-actions">
            {step > STEP.institution
              ? <button type="button" className="af-button af-button-secondary axr-back-button" onClick={registration.back}>Back</button>
              : <span className="af-submit-note">Institution, delegation, students, review. Your draft stays in this tab.</span>}
            {step < STEP.review ? (
              <button type="button" className="af-button af-button-primary" onClick={registration.advance}>Continue</button>
            ) : (
              <button type="submit" className="af-button af-button-primary" disabled={status === 'submitting'}>
                {status === 'submitting' ? 'Submitting…' : 'Submit registration'}
              </button>
            )}
          </div>
        </form>
      )}
    </RegistrationLayout>
  )
}
