import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, Clock3, Copy, LockKeyhole, RotateCcw } from 'lucide-react'
import { Link } from 'react-router-dom'
import ApplicationChoice from '../../components/forms/ApplicationChoice'
import ApplicationConsent from '../../components/forms/ApplicationConsent'
import ApplicationField from '../../components/forms/ApplicationField'
import ApplicationProgress from '../../components/forms/ApplicationProgress'
import InfinityClubMark from '../../components/InfinityClubMark'
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
  const lastPresentedStep = useRef(form.step)
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
        <div className="page-container join-page-topline">
          <Link to="/" className="join-back-link"><ArrowLeft size={14} aria-hidden="true" /> Back to Infinity</Link>
          <span>THE COMMUNITY STARTS WITH YOU</span>
        </div>
        <div className="page-container join-layout">
          <motion.aside className="join-context"
            initial={reduced ? false : { opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: .62, ease: MOTION_EASE.smooth }}>
            <div className="join-context-line">
              <span className="join-emblem" aria-hidden="true"><InfinityClubMark /></span>
              <span>Different minds.<br /><strong>One Infinity.</strong></span>
            </div>
            <h1 id="join-title">Become an<br /><span>Infiniter.</span></h1>
            <p className="join-lead">
              The people you build with make all the difference.
              Find yours at Infinity — a community to learn, create, and make things happen together.
            </p>
            <figure className="join-community-photo">
              <img src="/infinity/IMG_0199.JPG" alt="Infinity Club members gathered for a group photo." width="720" height="480" />
              <figcaption>
                <span><span className="join-photo-eyebrow">THIS IS INFINITY</span><strong>Good ideas. Better company.</strong></span>
                <Link to="/community" aria-label="Meet the Infinity community"><ArrowUpRight size={20} aria-hidden="true" /></Link>
              </figcaption>
            </figure>
            <ul className="join-notes">
              <li><Check size={14} aria-hidden="true" /><span>No experience required</span></li>
              <li><Check size={14} aria-hidden="true" /><span>All study levels welcome</span></li>
            </ul>
            <p className="join-context-footnote">Bring your curiosity. We will figure out the rest together.</p>
          </motion.aside>

          <motion.div className="join-form-paper"
            initial={reduced ? false : { opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: .68, delay: reduced ? 0 : .08, ease: MOTION_EASE.smooth }}>
            <header className="join-form-header">
              <div><span>YOUR NEXT CHAPTER</span><strong>Join the club</strong></div>
              <span className="join-time"><Clock3 size={14} aria-hidden="true" /> About 3 min</span>
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
              <form onSubmit={form.submit} noValidate aria-label="Infinity Club membership application" aria-busy={form.status === 'submitting'}>
                <ApplicationProgress steps={steps} current={form.step} onStep={form.editStep} />
                <div className="af-trap" aria-hidden="true">
                  <label htmlFor={`${FORM_ID}-website`}>Website</label>
                  <input id={`${FORM_ID}-website`} name="website" value={form.values.website} tabIndex={-1} autoComplete="off"
                    onChange={(event) => form.setField('website', event.target.value)} />
                </div>

                <AnimatePresence mode="wait" initial={false}>
                  <motion.div key={form.step} className="join-form-step"
                    initial={reduced ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
                    exit={reduced ? { opacity: 0 } : { opacity: 0, x: -12 }} transition={stepMotion}
                    onAnimationComplete={() => {
                      if (lastPresentedStep.current === form.step) return
                      lastPresentedStep.current = form.step
                      const heading = document.querySelector('#join-page [data-form-step-heading]')
                      heading?.focus({ preventScroll: true })
                      heading?.scrollIntoView({ block: 'nearest', behavior: 'instant' })
                    }}>
                    {form.step === 0 ? (
                      <>
                        <div className="af-step-heading" tabIndex={-1} data-form-step-heading>
                          <span>STEP 01 / A LITTLE INTRODUCTION</span>
                          <h2>Let’s start with you.</h2>
                          <p>A few details so we can get to know you and stay in touch.</p>
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
                              onChange={form.setField} error={form.errors.department} autoComplete="organization-title" placeholder="e.g. Computer Science" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="af-step-heading" tabIndex={-1} data-form-step-heading>
                          <span>STEP 02 / MAKE IT YOURS</span>
                          <h2>Find your place.</h2>
                          <p>Here to explore, or ready to help run the club? Choose how you would like to be involved.</p>
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
                  {form.step > 0 ? <button type="button" className="af-button af-button-secondary" onClick={form.back}><ArrowLeft size={16} aria-hidden="true" /> Back</button> : <span className="af-submit-note">Next up: your place in the club</span>}
                  {form.step < steps.length - 1 ? (
                    <button type="button" className="af-button af-button-primary" onClick={form.advance}>Continue <ArrowRight size={16} aria-hidden="true" /></button>
                  ) : (
                    <button type="submit" className="af-button af-button-primary" disabled={form.status === 'submitting'}>
                      {form.status === 'submitting' ? 'Sending application...' : form.endpointConfigured ? 'Send application' : 'Prepare application'}
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
                <p className="join-form-reassurance"><LockKeyhole size={12} aria-hidden="true" />{form.hasDraft ? 'Your saved progress has been restored.' : 'Your progress is saved in this tab.'}</p>
              </form>
            )}
          </motion.div>
        </div>
      </section>
      <div className="join-page-note page-container">
        <span className="join-signature"><span aria-hidden="true"><InfinityClubMark /></span> No Limits For Infiniters</span>
        <span className="join-location">MI Faculty · Bordj Bou Arreridj</span>
        <Link to="/contact">A question before you join? <ArrowUpRight size={14} aria-hidden="true" /></Link>
      </div>
    </div>
  )
}
