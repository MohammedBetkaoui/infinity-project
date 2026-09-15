import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Copy, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import ApplicationChoice from '../../components/forms/ApplicationChoice'
import ApplicationConsent from '../../components/forms/ApplicationConsent'
import ApplicationField from '../../components/forms/ApplicationField'
import ApplicationProgress from '../../components/forms/ApplicationProgress'
import InfinityMark from '../../components/InfinityMark'
import useApplicationForm from '../../hooks/useApplicationForm'
import useMotionPreference from '../../hooks/useMotionPreference'
import { MOTION_EASE } from '../../lib/motion'
import { poles } from '../../data/siteData'
import '../../components/forms/application-form.css'
import './join.css'

const FORM_ID = 'membership-application'
const STORAGE_KEY = 'infinity-membership-draft-v1'
const INSTAGRAM_URL = 'https://www.instagram.com/club_.infinity/'

const initialValues = {
  fullName: '',
  email: '',
  phone: '',
  studyYear: '',
  department: '',
  primaryField: '',
  experience: '',
  motivation: '',
  availability: '',
  consent: false,
  website: '',
}

const steps = [
  { label: 'About you', fields: ['fullName', 'email', 'phone', 'studyYear', 'department'] },
  { label: 'Your place', fields: ['primaryField', 'experience', 'motivation', 'availability', 'consent'] },
]

const required = (label) => (value) => String(value || '').trim() ? '' : `${label} is required.`
const validators = {
  fullName: (value) => String(value).trim().length >= 3 ? '' : 'Please enter your full name.',
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : 'Enter a valid email address.',
  phone: (value) => !value || String(value).replace(/\D/g, '').length >= 8 ? '' : 'Enter a valid phone number or leave it empty.',
  studyYear: required('Your study level'),
  department: required('Your department'),
  primaryField: required('A field'),
  experience: required('Your starting point'),
  motivation: (value) => String(value).trim().length >= 45 ? '' : 'Tell us a little more, using at least 45 characters.',
  availability: required('Your availability'),
  consent: (value) => value ? '' : 'Please confirm that the club may contact you about this application.',
}

const studyLevels = [
  { value: '', label: 'Select your level' },
  { value: 'L1', label: 'Licence 1' },
  { value: 'L2', label: 'Licence 2' },
  { value: 'L3', label: 'Licence 3' },
  { value: 'M1', label: 'Master 1' },
  { value: 'M2', label: 'Master 2' },
  { value: 'other', label: 'Another level' },
]

const availabilityOptions = [
  { value: '', label: 'Choose a realistic rhythm' },
  { value: 'weekly', label: 'A few hours each week' },
  { value: 'events', label: 'Mostly around events and projects' },
  { value: 'flexible', label: 'It changes during the semester' },
]

const experienceOptions = [
  { value: 'starting', label: 'Starting out', description: 'Curious, with little or no prior experience.' },
  { value: 'learning', label: 'Already learning', description: 'Following courses or building first exercises.' },
  { value: 'building', label: 'Building things', description: 'Ready to contribute and share practical skills.' },
]

const fieldOptions = [
  { value: '', label: 'Choose the field that attracts you most' },
  ...poles.map(({ title }) => ({ value: title, label: title })),
  { value: 'Not sure yet', label: 'I would like help choosing' },
]

const buildSummary = (values) => [
  'INFINITY CLUB - MEMBERSHIP APPLICATION',
  `Name: ${values.fullName}`,
  `Email: ${values.email}`,
  `Phone: ${values.phone || 'Not provided'}`,
  `Study level: ${values.studyYear}`,
  `Department: ${values.department}`,
  `Preferred field: ${values.primaryField}`,
  `Starting point: ${values.experience}`,
  `Availability: ${values.availability}`,
  '',
  'Motivation:',
  values.motivation,
].join('\n')

export default function JoinPage() {
  const reduced = useMotionPreference()
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef(null)
  const form = useApplicationForm({ kind: 'membership', storageKey: STORAGE_KEY, initialValues, steps, validators })

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Join Infinity Club | Membership application'
    return () => {
      document.title = previousTitle
      window.clearTimeout(copyTimer.current)
    }
  }, [])

  const copyAnswers = async () => {
    try {
      await navigator.clipboard.writeText(buildSummary(form.values))
      setCopied(true)
      window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  const stepMotion = reduced ? { duration: .01 } : { duration: .34, ease: MOTION_EASE.smooth }

  return (
    <div id="join-page" className="join-page">
      <section className="join-application" aria-labelledby="join-title">
        <div className="page-container join-layout">
          <motion.aside className="join-context"
            initial={reduced ? false : { opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: .62, ease: MOTION_EASE.smooth }}>
            <div className="join-context-line"><span>Membership application</span><span>MI Faculty / BBA</span></div>
            <div className="join-mark" aria-hidden="true"><InfinityMark /></div>
            <p className="join-intro">No perfect portfolio required.</p>
            <h1 id="join-title">Start curious.<br /><span>Grow together.</span></h1>
            <p className="join-lead">Tell us where you are now and what you would like to explore. We are looking for commitment, kindness and the willingness to learn.</p>
            <ul className="join-notes">
              <li><i aria-hidden="true" /><span><strong>For BBA students</strong>Across mathematics, computer science and related paths.</span></li>
              <li><i aria-hidden="true" /><span><strong>Beginner-friendly</strong>Your starting level does not define your potential.</span></li>
              <li><i aria-hidden="true" /><span><strong>A real conversation</strong>The form helps the team prepare a useful follow-up.</span></li>
            </ul>
          </motion.aside>

          <motion.div className="join-form-paper"
            initial={reduced ? false : { opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: .68, delay: reduced ? 0 : .08, ease: MOTION_EASE.smooth }}>
            <header className="join-form-header">
              <div><span>Infinity Club</span><strong>Application desk</strong></div>
              <p>{form.hasDraft ? 'Draft restored from this tab' : 'Your progress stays in this tab'}</p>
            </header>

            {form.status === 'success' ? (
              <motion.div className="join-success" role="status" initial={{ opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }}>
                <CheckCircle2 size={34} strokeWidth={1.35} aria-hidden="true" />
                <span>Application received</span>
                <h2>Welcome to the first step.</h2>
                <p>Your application has reached Infinity Club. Keep this reference if you need to follow up.</p>
                <strong>{form.result?.reference}</strong>
                <button type="button" className="af-button af-button-secondary" onClick={form.reset}><RotateCcw size={14} /> Start another application</button>
              </motion.div>
            ) : (
              <form onSubmit={form.submit} noValidate aria-label="Infinity Club membership application">
                <ApplicationProgress steps={steps} current={form.step} onStep={form.editStep} />
                <div className="af-trap" aria-hidden="true">
                  <label htmlFor={`${FORM_ID}-website`}>Website</label>
                  <input id={`${FORM_ID}-website`} name="website" value={form.values.website} tabIndex={-1} autoComplete="off"
                    onChange={(event) => form.setField('website', event.target.value)} />
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={form.step} className="join-form-step"
                    initial={reduced ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, x: -12 }} transition={stepMotion}>
                    {form.step === 0 ? (
                      <>
                        <div className="af-step-heading" tabIndex={-1} data-form-step-heading>
                          <span>Let us begin with the essentials</span>
                          <h2>Who are we meeting?</h2>
                          <p>Use the details where the club can genuinely reach you. Optional information can be left blank.</p>
                        </div>
                        <div className="af-fields">
                          <ApplicationField formId={FORM_ID} name="fullName" label="Full name" value={form.values.fullName}
                            onChange={form.setField} error={form.errors.fullName} autoComplete="name" placeholder="Your first and last name" />
                          <div className="af-grid-two">
                            <ApplicationField formId={FORM_ID} name="email" label="Email address" type="email" value={form.values.email}
                              onChange={form.setField} error={form.errors.email} autoComplete="email" inputMode="email" placeholder="name@example.com" />
                            <ApplicationField formId={FORM_ID} name="phone" label="Phone number" optional type="tel" value={form.values.phone}
                              onChange={form.setField} error={form.errors.phone} autoComplete="tel" inputMode="tel" placeholder="+213 ..." />
                          </div>
                          <div className="af-grid-two">
                            <ApplicationField formId={FORM_ID} name="studyYear" label="Study level" as="select" options={studyLevels}
                              value={form.values.studyYear} onChange={form.setField} error={form.errors.studyYear} />
                            <ApplicationField formId={FORM_ID} name="department" label="Department or speciality" value={form.values.department}
                              onChange={form.setField} error={form.errors.department} autoComplete="organization-title" placeholder="Computer Science, Mathematics..." />
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="af-step-heading" tabIndex={-1} data-form-step-heading>
                          <span>There is more than one way to contribute</span>
                          <h2>What would you like to grow?</h2>
                          <p>Choose a direction, not a permanent label. Members often discover new fields after joining.</p>
                        </div>
                        <div className="af-fields">
                          <ApplicationField formId={FORM_ID} name="primaryField" label="Field you want to explore first" as="select" options={fieldOptions}
                            value={form.values.primaryField} onChange={form.setField} error={form.errors.primaryField} />
                          <ApplicationChoice formId={FORM_ID} name="experience" legend="Where are you starting from?" options={experienceOptions}
                            value={form.values.experience} onChange={form.setField} error={form.errors.experience} />
                          <ApplicationField formId={FORM_ID} name="motivation" label="Why Infinity, and why now?" as="textarea" maxLength={520}
                            value={form.values.motivation} onChange={form.setField} error={form.errors.motivation}
                            hint="A few honest sentences are more useful than a formal cover letter." placeholder="I would like to learn, contribute or build..." />
                          <ApplicationField formId={FORM_ID} name="availability" label="Availability during the semester" as="select" options={availabilityOptions}
                            value={form.values.availability} onChange={form.setField} error={form.errors.availability} />
                          <ApplicationConsent formId={FORM_ID} name="consent" checked={form.values.consent} onChange={form.setField} error={form.errors.consent}>
                            Infinity Club may use these details only to review this application and contact me about recruitment.
                          </ApplicationConsent>
                        </div>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>

                {(form.status === 'draft' || form.status === 'error') && (
                  <motion.div className="af-form-alert" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <strong>{form.status === 'draft' ? 'Your application is ready, but has not been sent.' : 'The connection did not complete.'}</strong>
                    <p>{form.result?.message || 'Online delivery is not connected yet. Your answers remain saved in this tab.'}</p>
                    <div className="join-alert-actions">
                      <button type="button" onClick={copyAnswers}><Copy size={13} />{copied ? 'Copied' : 'Copy my answers'}</button>
                      <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">Contact @club_.infinity</a>
                    </div>
                  </motion.div>
                )}

                <div className="af-actions">
                  {form.step > 0 ? <button type="button" className="af-button af-button-secondary" onClick={form.back}>Back</button> : <span className="af-submit-note">Two short steps. About three minutes.</span>}
                  {form.step < steps.length - 1 ? (
                    <button type="button" className="af-button af-button-primary" onClick={form.advance}>Continue</button>
                  ) : (
                    <button type="submit" className="af-button af-button-primary" disabled={form.status === 'submitting'}>
                      {form.status === 'submitting' ? 'Sending application...' : form.endpointConfigured ? 'Send application' : 'Prepare application'}
                    </button>
                  )}
                </div>
              </form>
            )}
          </motion.div>
        </div>
      </section>
      <div className="join-page-note page-container"><span>No Limits For Infiniters</span><Link to="/contact">Need to ask something first?</Link></div>
    </div>
  )
}
