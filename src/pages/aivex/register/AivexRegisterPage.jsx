import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, CheckCircle2, Copy, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import ApplicationChoice from '../../../components/forms/ApplicationChoice'
import ApplicationConsent from '../../../components/forms/ApplicationConsent'
import ApplicationField from '../../../components/forms/ApplicationField'
import ApplicationProgress from '../../../components/forms/ApplicationProgress'
import useApplicationForm from '../../../hooks/useApplicationForm'
import useMotionPreference from '../../../hooks/useMotionPreference'
import { MOTION_EASE } from '../../../lib/motion'
import AivexLogoMark from '../AivexLogoMark'
import InfinityClubMark from '../../../components/InfinityClubMark'
import MiFacultyMark from '../../../components/MiFacultyMark'
import '../../../components/forms/application-form.css'
import './aivex-register.css'

const FORM_ID = 'aivex-registration'
const STORAGE_KEY = 'aivex-registration-draft-v1'
const INSTAGRAM_URL = 'https://www.instagram.com/club_.infinity/'

const initialValues = {
  participantType: '',
  contactName: '',
  email: '',
  phone: '',
  university: '',
  studyLevel: '',
  teamName: '',
  teamSize: '',
  projectTitle: '',
  projectTrack: '',
  projectStage: '',
  projectSummary: '',
  teammateNames: '',
  consent: false,
  website: '',
}

const steps = [
  { label: 'Applicant', fields: ['participantType', 'contactName', 'email', 'phone', 'university', 'studyLevel', 'teamName', 'teamSize'] },
  { label: 'Project', fields: ['projectTitle', 'projectTrack', 'projectStage', 'projectSummary', 'teammateNames'] },
  { label: 'Review', fields: ['consent'] },
]

const required = (label) => (value) => String(value || '').trim() ? '' : `${label} is required.`
const validators = {
  participantType: required('A participation format'),
  contactName: (value) => String(value).trim().length >= 3 ? '' : 'Please enter the main contact name.',
  email: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? '' : 'Enter a valid email address.',
  phone: (value) => !value || String(value).replace(/\D/g, '').length >= 8 ? '' : 'Enter a valid number or leave it empty.',
  university: required('Your university'),
  studyLevel: required('Your study level'),
  teamName: (value, values) => values.participantType !== 'team' || String(value).trim() ? '' : 'Enter a working team name.',
  teamSize: (value, values) => values.participantType !== 'team' || Number(value) >= 2 ? '' : 'A team must include at least two people.',
  projectTitle: (value) => String(value).trim().length >= 3 ? '' : 'Give the project a short working title.',
  projectTrack: required('A project direction'),
  projectStage: required('A current project stage'),
  projectSummary: (value) => String(value).trim().length >= 60 ? '' : 'Describe the idea in at least 60 characters.',
  teammateNames: () => '',
  consent: (value) => value ? '' : 'Please confirm the registration statement before sending.',
}

const participationOptions = [
  { value: 'individual', label: 'Individual', description: 'Register now and let the organisers confirm the final format.' },
  { value: 'team', label: 'Team', description: 'One main contact completes this form for the group.' },
]

const projectStageOptions = [
  { value: 'idea', label: 'Clear idea', description: 'The problem and intended user are identified.' },
  { value: 'prototype', label: 'Early prototype', description: 'A first technical path is being tested.' },
  { value: 'demo', label: 'Working demo', description: 'There is something tangible to refine.' },
]

const projectTracks = [
  { value: '', label: 'Choose the closest direction' },
  { value: 'Language and information', label: 'Language and information retrieval' },
  { value: 'Computer vision', label: 'Computer vision' },
  { value: 'Data and visualisation', label: 'Data analysis and visualisation' },
  { value: 'Automation and agents', label: 'Automation and intelligent agents' },
  { value: 'Other applied AI', label: 'Another applied AI direction' },
]

const studyLevels = [
  { value: '', label: 'Select your current level' },
  { value: 'Licence', label: 'Licence / undergraduate' },
  { value: 'Master', label: 'Master' },
  { value: 'Engineering', label: 'Engineering cycle' },
  { value: 'Doctorate', label: 'Doctorate' },
  { value: 'Other', label: 'Another programme' },
]

const buildSummary = (values) => [
  'AIVEX - SECOND EDITION REGISTRATION',
  `Format: ${values.participantType}`,
  `Main contact: ${values.contactName}`,
  `Email: ${values.email}`,
  `Phone: ${values.phone || 'Not provided'}`,
  `University: ${values.university}`,
  `Study level: ${values.studyLevel}`,
  ...(values.participantType === 'team' ? [`Team: ${values.teamName}`, `Expected size: ${values.teamSize}`, `Members: ${values.teammateNames || 'To be confirmed'}`] : []),
  '',
  `Project: ${values.projectTitle}`,
  `Direction: ${values.projectTrack}`,
  `Stage: ${values.projectStage}`,
  'Summary:',
  values.projectSummary,
].join('\n')

function ReviewBlock({ title, onEdit, children }) {
  return (
    <section className="axr-review-block">
      <header><h3>{title}</h3><button type="button" onClick={onEdit}>Edit</button></header>
      {children}
    </section>
  )
}

function ReviewItem({ label, value }) {
  return <div className="axr-review-item"><span>{label}</span><strong>{value || 'Not provided'}</strong></div>
}

export default function AivexRegisterPage() {
  const reduced = useMotionPreference()
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef(null)
  const form = useApplicationForm({ kind: 'aivex', storageKey: STORAGE_KEY, initialValues, steps, validators })
  const completedSignals = [form.values.contactName, form.values.email, form.values.university, form.values.projectTitle, form.values.projectTrack, form.values.projectSummary].filter(Boolean).length

  useEffect(() => {
    const html = document.documentElement
    const previousPage = html.dataset.page
    const previousTitle = document.title
    const favicon = document.querySelector('link[rel="icon"]')
    const previousIcon = favicon?.getAttribute('href')
    html.dataset.page = 'aivex'
    document.title = 'Register | AIVEX, second edition'
    favicon?.setAttribute('href', '/aivex-favicon.svg')
    return () => {
      if (previousPage) html.dataset.page = previousPage
      else delete html.dataset.page
      document.title = previousTitle
      if (favicon && previousIcon) favicon.setAttribute('href', previousIcon)
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

  const setParticipationType = (name, value) => {
    form.setField(name, value)
    if (value !== 'individual') return
    form.setField('teamName', '')
    form.setField('teamSize', '')
    form.setField('teammateNames', '')
  }

  const stepMotion = reduced ? { duration: .01 } : { duration: .36, ease: MOTION_EASE.smooth }

  return (
    <div className="ax-registration-page">
      <a className="axr-skip" href="#aivex-registration-form">Skip to registration form</a>
      <header className="axr-header">
        <div className="axr-container axr-header-inner">
          <Link to="/aivex" className="axr-brand" aria-label="Back to the AIVEX event page"><AivexLogoMark /><span>Registration desk</span></Link>
          <Link to="/aivex" className="axr-back"><ArrowLeft size={14} aria-hidden="true" /> Event page</Link>
        </div>
      </header>

      <main className="axr-main">
        <div className="axr-container axr-layout">
          <motion.aside className="axr-context"
            initial={reduced ? false : { opacity: 0, x: -22 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: .64, ease: MOTION_EASE.smooth }}>
            <div className="axr-context-top"><span>National AI competition</span><span>Second edition</span></div>
            <p className="axr-kicker">From an idea to the machine.</p>
            <h1>Bring the idea.<br /><span>Build the proof.</span></h1>
            <p className="axr-lead">Register the people behind the project, then give the organisers enough context to understand what you want to build.</p>
            <div className="axr-signal" aria-hidden="true">
              <div className="axr-signal-grid" />
              <motion.div className="axr-signal-orbit" animate={{ rotate: form.step * 118 }} transition={stepMotion}><i /><i /></motion.div>
              <div className="axr-signal-core"><span>AI</span><small>{completedSignals}/6 signals</small></div>
              <span className="axr-coordinate axr-coordinate-one">36.07 N</span>
              <span className="axr-coordinate axr-coordinate-two">4.76 E</span>
            </div>
            <p className="axr-confirmation-note"><i aria-hidden="true" />Registration is reviewed by the organising team. Participation remains subject to the official rules and confirmation.</p>
          </motion.aside>

          <motion.div id="aivex-registration-form" className="axr-form-paper"
            initial={reduced ? false : { opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: .7, delay: reduced ? 0 : .07, ease: MOTION_EASE.smooth }}>
            <div className="axr-paper-head"><AivexLogoMark /><span>{form.hasDraft ? 'Draft recovered' : 'Application form / 02'}</span></div>

            {form.status === 'success' ? (
              <motion.div className="axr-success" role="status" initial={{ opacity: 0, scale: .985 }} animate={{ opacity: 1, scale: 1 }}>
                <CheckCircle2 size={35} strokeWidth={1.3} aria-hidden="true" />
                <span>Transmission complete</span>
                <h2>Your signal<br />reached AIVEX.</h2>
                <p>The organising team has received this registration. Keep the reference below for any follow-up.</p>
                <strong>{form.result?.reference}</strong>
                <button type="button" className="af-button af-button-secondary" onClick={form.reset}><RotateCcw size={14} /> Register another project</button>
              </motion.div>
            ) : (
              <form onSubmit={form.submit} noValidate aria-label="AIVEX second edition registration">
                <ApplicationProgress steps={steps} current={form.step} onStep={form.editStep} />
                <div className="af-trap" aria-hidden="true">
                  <label htmlFor={`${FORM_ID}-website`}>Website</label>
                  <input id={`${FORM_ID}-website`} name="website" value={form.values.website} tabIndex={-1} autoComplete="off"
                    onChange={(event) => form.setField('website', event.target.value)} />
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={form.step} className="axr-form-step"
                    initial={reduced ? false : { opacity: 0, x: 19 }} animate={{ opacity: 1, x: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, x: -13 }} transition={stepMotion}>
                    {form.step === 0 && (
                      <>
                        <div className="af-step-heading" tabIndex={-1} data-form-step-heading>
                          <span>Applicant signal</span><h2>Who is entering?</h2>
                          <p>One person acts as the main contact. Team details can still be updated when the organisers confirm the final rules.</p>
                        </div>
                        <div className="af-fields">
                          <ApplicationChoice formId={FORM_ID} name="participantType" legend="Participation format" options={participationOptions}
                            value={form.values.participantType} onChange={setParticipationType} error={form.errors.participantType} />
                          <ApplicationField formId={FORM_ID} name="contactName" label="Main contact" value={form.values.contactName}
                            onChange={form.setField} error={form.errors.contactName} autoComplete="name" placeholder="Full name" />
                          <div className="af-grid-two">
                            <ApplicationField formId={FORM_ID} name="email" label="Email address" type="email" value={form.values.email}
                              onChange={form.setField} error={form.errors.email} autoComplete="email" inputMode="email" placeholder="name@example.com" />
                            <ApplicationField formId={FORM_ID} name="phone" label="Phone number" optional type="tel" value={form.values.phone}
                              onChange={form.setField} error={form.errors.phone} autoComplete="tel" inputMode="tel" placeholder="+213 ..." />
                          </div>
                          <div className="af-grid-two">
                            <ApplicationField formId={FORM_ID} name="university" label="University or institution" value={form.values.university}
                              onChange={form.setField} error={form.errors.university} autoComplete="organization" placeholder="Your institution" />
                            <ApplicationField formId={FORM_ID} name="studyLevel" label="Study level" as="select" options={studyLevels}
                              value={form.values.studyLevel} onChange={form.setField} error={form.errors.studyLevel} />
                          </div>
                          {form.values.participantType === 'team' && (
                            <motion.div className="af-grid-two" initial={{ opacity: 0, y: reduced ? 0 : -5 }} animate={{ opacity: 1, y: 0 }}>
                              <ApplicationField formId={FORM_ID} name="teamName" label="Working team name" value={form.values.teamName}
                                onChange={form.setField} error={form.errors.teamName} placeholder="Team name" />
                              <ApplicationField formId={FORM_ID} name="teamSize" label="Expected team size" type="number" min="2" value={form.values.teamSize}
                                onChange={form.setField} error={form.errors.teamSize} inputMode="numeric" placeholder="2" />
                            </motion.div>
                          )}
                        </div>
                      </>
                    )}

                    {form.step === 1 && (
                      <>
                        <div className="af-step-heading" tabIndex={-1} data-form-step-heading>
                          <span>Project signal</span><h2>What are you building?</h2>
                          <p>A focused problem is more useful than a long list of technologies. Working titles and early ideas are welcome.</p>
                        </div>
                        <div className="af-fields">
                          <ApplicationField formId={FORM_ID} name="projectTitle" label="Project title" value={form.values.projectTitle}
                            onChange={form.setField} error={form.errors.projectTitle} placeholder="A short working title" maxLength={80} />
                          <ApplicationField formId={FORM_ID} name="projectTrack" label="Closest AI direction" as="select" options={projectTracks}
                            value={form.values.projectTrack} onChange={form.setField} error={form.errors.projectTrack} />
                          <ApplicationChoice formId={FORM_ID} name="projectStage" legend="Current stage" options={projectStageOptions}
                            value={form.values.projectStage} onChange={form.setField} error={form.errors.projectStage} />
                          <ApplicationField formId={FORM_ID} name="projectSummary" label="Problem, user and proposed result" as="textarea" maxLength={700}
                            value={form.values.projectSummary} onChange={form.setField} error={form.errors.projectSummary}
                            hint="Do not include passwords, private datasets or other sensitive information." placeholder="We observed... Our application would help..." />
                          {form.values.participantType === 'team' && (
                            <ApplicationField formId={FORM_ID} name="teammateNames" label="Other team members" optional as="textarea" maxLength={300}
                              value={form.values.teammateNames} onChange={form.setField} error={form.errors.teammateNames}
                              hint="Names can be updated later if the team is still taking shape." placeholder="One name per line" />
                          )}
                        </div>
                      </>
                    )}

                    {form.step === 2 && (
                      <>
                        <div className="af-step-heading" tabIndex={-1} data-form-step-heading>
                          <span>Final check</span><h2>Read the signal once.</h2>
                          <p>Confirm that the contact details and project direction below are clear enough for the organising team.</p>
                        </div>
                        <div className="axr-review">
                          <ReviewBlock title="Applicant" onEdit={() => form.editStep(0)}>
                            <ReviewItem label="Main contact" value={form.values.contactName} />
                            <ReviewItem label="Format" value={form.values.participantType === 'team' ? `${form.values.teamName} / ${form.values.teamSize} people` : 'Individual'} />
                            <ReviewItem label="Institution" value={`${form.values.university} / ${form.values.studyLevel}`} />
                            <ReviewItem label="Contact" value={form.values.email} />
                          </ReviewBlock>
                          <ReviewBlock title="Project" onEdit={() => form.editStep(1)}>
                            <ReviewItem label="Working title" value={form.values.projectTitle} />
                            <ReviewItem label="Direction" value={form.values.projectTrack} />
                            <ReviewItem label="Current stage" value={form.values.projectStage} />
                          </ReviewBlock>
                          <ApplicationConsent formId={FORM_ID} name="consent" checked={form.values.consent} onChange={form.setField} error={form.errors.consent}>
                            I confirm that these details are accurate. I understand that this is a registration request, and that final participation depends on the official AIVEX rules and organiser confirmation.
                          </ApplicationConsent>
                        </div>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>

                {(form.status === 'draft' || form.status === 'error') && (
                  <motion.div className="af-form-alert" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <strong>{form.status === 'draft' ? 'The registration is prepared, but not transmitted.' : 'The transmission did not complete.'}</strong>
                    <p>{form.result?.message || 'Online delivery is not connected yet. This draft remains available in the current tab.'}</p>
                    <div className="axr-alert-actions">
                      <button type="button" onClick={copyAnswers}><Copy size={13} />{copied ? 'Copied' : 'Copy registration'}</button>
                      <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer">Ask the AIVEX team</a>
                    </div>
                  </motion.div>
                )}

                <div className="af-actions">
                  {form.step > 0 ? <button type="button" className="af-button af-button-secondary" onClick={form.back}>Back</button> : <span className="af-submit-note">Three focused steps. Your draft stays in this tab.</span>}
                  {form.step < steps.length - 1 ? (
                    <button type="button" className="af-button af-button-primary" onClick={form.advance}>Continue</button>
                  ) : (
                    <button type="submit" className="af-button af-button-primary" disabled={form.status === 'submitting'}>
                      {form.status === 'submitting' ? 'Transmitting...' : form.endpointConfigured ? 'Send registration' : 'Prepare registration'}
                    </button>
                  )}
                </div>
              </form>
            )}

            <p className="axr-paper-credit"><MiFacultyMark lockup className="axr-paper-credit-mark" /></p>
          </motion.div>
        </div>
      </main>

      <footer className="axr-footer"><div className="axr-container"><span>AIVEX / Second edition</span><span className="axr-footer-mi"><InfinityClubMark className="axr-footer-mi-mark" />Organised by Infinity Club, BBA</span></div></footer>
    </div>
  )
}
