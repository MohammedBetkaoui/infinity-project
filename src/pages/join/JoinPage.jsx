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
import JoinPanelChoice from './JoinPanelChoice'
import {
  JOIN_TYPES, STAFF_DEPARTMENTS, availabilityOptions, buildSummary, experienceOptions, initialValues,
  interestOptions, joinTypeLabel, serialize, steps, studyLevels, validators,
} from './joinModel'
import '../../components/forms/application-form.css'
import './join.css'

const FORM_ID = 'membership-application'
// v2: the essay field is gone and the role fields are new; v1 drafts are ignored.
const STORAGE_KEY = 'infinity-membership-draft-v2'
const INSTAGRAM_URL = 'https://www.instagram.com/club_.infinity/'

function RoleNote({ label, children }) {
  return <p className="join-role-note"><strong>{label}</strong><span>{children}</span></p>
}

export default function JoinPage() {
  const reduced = useMotionPreference()
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef(null)
  const form = useApplicationForm({ kind: 'membership', storageKey: STORAGE_KEY, initialValues, steps, validators, serialize, version: 2 })
  const { joinType } = form.values

  // Switching path drops the answer that belongs only to the other path.
  const chooseJoinType = (name, value) => {
    form.setField(name, value)
    if (value === 'member') form.setField('staffDepartment', '')
    if (value === 'staff') form.setField('memberInterest', '')
  }

  useEffect(() => {
    try { window.sessionStorage.removeItem('infinity-membership-draft-v1') } catch { /* storage may be unavailable */ }
  }, [])

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
            <div className="join-context-line"><span>Member &amp; staff application</span><span>MI Faculty / BBA</span></div>
            <div className="join-mark" aria-hidden="true"><InfinityMark /></div>
            <p className="join-intro">No perfect portfolio required.</p>
            <h1 id="join-title">Start curious.<br /><span>Grow together.</span></h1>
            <p className="join-lead">
              Whether you want to learn with the community or help build the club, there is a place for you at Infinity.
              Choose how you want to participate and tell us a little about yourself.
            </p>
            <ul className="join-notes">
              <li><i aria-hidden="true" /><span><strong>Open to students</strong>Different levels and backgrounds can find a place in the club.</span></li>
              <li><i aria-hidden="true" /><span><strong>Beginner-friendly</strong>You do not need to already be an expert to join the community.</span></li>
              <li><i aria-hidden="true" /><span><strong>Two ways to contribute</strong>Join as a Member, or take a more active role as Staff.</span></li>
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
                <p>Your {joinTypeLabel(joinType).toLowerCase()} application has reached Infinity Club. Keep this reference if you need to follow up.</p>
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
                          <span>Find your place in Infinity</span>
                          <h2>How would you like to join?</h2>
                          <p>There are two ways to be part of Infinity. Choose the one that best matches how involved you want to be this season.</p>
                        </div>
                        <div className="af-fields">
                          <JoinPanelChoice formId={FORM_ID} name="joinType" legend="How would you like to join?" legendHidden variant="role"
                            options={JOIN_TYPES} value={joinType} onChange={chooseJoinType} error={form.errors.joinType} />

                          <AnimatePresence mode="wait" initial={false}>
                            <motion.div key={joinType || 'none'} className="join-path"
                              initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4, transition: { duration: .14 } }}
                              transition={{ duration: .28, ease: MOTION_EASE.smooth }}>
                              {!joinType && (
                                <p className="join-path-empty">Choose Member or Staff to see the questions that apply to you.</p>
                              )}

                              {joinType === 'member' && (
                                <>
                                  <RoleNote label="Member">
                                    Come to workshops and events at your own pace. There is no team to join and no fixed schedule.
                                  </RoleNote>
                                  <ApplicationChoice formId={FORM_ID} name="experience" legend="Where are you starting from?" options={experienceOptions}
                                    value={form.values.experience} onChange={form.setField} error={form.errors.experience} />
                                  <ApplicationField formId={FORM_ID} name="memberInterest" label="What would you like to explore with Infinity?" as="select"
                                    options={interestOptions} value={form.values.memberInterest} onChange={form.setField} error={form.errors.memberInterest}
                                    hint="An interest, not a commitment: you can explore other fields at any time." />
                                  <ApplicationField formId={FORM_ID} name="availability" label="Availability during the semester" as="select"
                                    options={availabilityOptions} value={form.values.availability} onChange={form.setField} error={form.errors.availability}
                                    hint="Helps us plan activities. Members take part whenever they can." />
                                </>
                              )}

                              {joinType === 'staff' && (
                                <>
                                  <RoleNote label="Staff note">
                                    Staff members contribute regularly to club activities and collaborate with their department throughout the season.
                                  </RoleNote>
                                  <ApplicationChoice formId={FORM_ID} name="experience" legend="Where are you starting from?" options={experienceOptions}
                                    value={form.values.experience} onChange={form.setField} error={form.errors.experience} />
                                  <JoinPanelChoice formId={FORM_ID} name="staffDepartment" legend="Choose your department" variant="department"
                                    description="Staff members actively collaborate with one of Infinity’s core teams. Choose the area where you would like to contribute."
                                    options={STAFF_DEPARTMENTS} value={form.values.staffDepartment} onChange={form.setField} error={form.errors.staffDepartment} />
                                  <ApplicationField formId={FORM_ID} name="availability" label="Availability during the semester" as="select"
                                    options={availabilityOptions} value={form.values.availability} onChange={form.setField} error={form.errors.availability}
                                    hint="Staff roles involve regular collaboration during the semester." />
                                </>
                              )}
                            </motion.div>
                          </AnimatePresence>

                          <ApplicationConsent formId={FORM_ID} name="consent" checked={form.values.consent} onChange={form.setField} error={form.errors.consent}>
                            Infinity Club may use these details only to review this application, contact me about membership or recruitment, and organise club activities.
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
