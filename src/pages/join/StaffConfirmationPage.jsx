import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, Info, Lightbulb, LockKeyhole, Plus, Send, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { STAFF_WORK_LINKS_MAX, normalizeStaffWorkLink } from '../../../shared/membership/staff-work-links.js'
import InfinityClubMark from '../../components/InfinityClubMark'
import { STAFF_MOTIVATION_QUESTION, staffMotivationGuidance } from './staffMotivationGuidance'
import './staff-confirmation.css'

const VERIFY_ENDPOINT = '/api/join/staff-confirmation/verify'
const SUBMIT_ENDPOINT = '/api/join/staff-confirmation/submit'
const MIN_LENGTH = 150
const MAX_LENGTH = 2000
const NEAR_LIMIT = 1800
const REQUEST_TIMEOUT_MS = 12000

const LINK_ERRORS = Object.freeze({
  invalid: 'Enter a complete URL beginning with https://',
  scheme: 'Enter a complete URL beginning with https://',
  empty: 'Enter a complete URL beginning with https://',
  too_long: 'Maximum 500 characters.',
  credentials: 'Remove the username or password from this link.',
  duplicate: 'You have already added this link.',
})

const COUNTER_ANNOUNCEMENTS = Object.freeze({
  ok: 'Minimum length reached.', near: 'Close to the 2,000 character limit.', over: 'Over the 2,000 character limit.',
})

let capturedToken
function captureInvitationToken() {
  if (capturedToken !== undefined) return capturedToken
  try {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
    capturedToken = new URLSearchParams(hash).get('token') || ''
    if (capturedToken) window.history.replaceState(window.history.state, '', window.location.pathname)
  } catch {
    capturedToken = ''
  }
  return capturedToken
}

const characterCount = (value) => [...value].length
const normalizeMotivationText = (value) => value.replace(/\r\n?/g, '\n').trim()
const numberLabel = (value) => value.toLocaleString('en-GB')

function counterStatus(count) {
  if (count > MAX_LENGTH) return { tone: 'over', note: `${numberLabel(count - MAX_LENGTH)} over the limit` }
  if (count > NEAR_LIMIT) return { tone: 'near', note: `${numberLabel(MAX_LENGTH - count)} characters left` }
  if (count >= MIN_LENGTH) return { tone: 'ok', note: 'Minimum reached' }
  if (count > 0) return { tone: 'short', note: `${MIN_LENGTH - count} more to reach the minimum` }
  return { tone: 'empty', note: `Minimum ${MIN_LENGTH} characters` }
}

// Same rules as the API (which stays authoritative), keyed by row id. Empty rows are ignored.
function workLinkErrors(rows) {
  const errors = {}
  const seen = new Set()
  for (const row of rows) {
    if (!row.value.trim()) continue
    const link = normalizeStaffWorkLink(row.value)
    if (!link.ok) errors[row.id] = link.code
    else if (seen.has(link.value)) errors[row.id] = 'duplicate'
    else seen.add(link.value)
  }
  return errors
}

const deadlineLabel = (value) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Algiers' }).format(date)
    : 'Contact Infinity Club'
}

async function postJson(endpoint, body, signal) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

function StatusCard({ kind, reference }) {
  const states = {
    success: {
      icon: <CheckCircle2 aria-hidden="true" />,
      eyebrow: 'Motivation received',
      title: 'Your motivation has been received',
      copy: 'Thank you. The Infinity team will review your Staff confirmation.',
    },
    already_submitted: {
      icon: <CheckCircle2 aria-hidden="true" />,
      eyebrow: 'Submission recorded',
      title: 'This confirmation has already been submitted',
      copy: 'No further action is needed now. If Infinity requests a revision, use this same private link again.',
    },
    complete: {
      icon: <CheckCircle2 aria-hidden="true" />,
      eyebrow: 'Staff confirmation complete',
      title: 'Your Staff confirmation is complete',
      copy: 'Thank you. This private link no longer accepts motivation submissions.',
    },
    expired: {
      icon: <Clock3 aria-hidden="true" />,
      eyebrow: 'Invitation inactive',
      title: 'This invitation is no longer active',
      copy: 'Please contact Infinity Club if you still need to submit your Staff confirmation.',
    },
    invalid: {
      icon: <LockKeyhole aria-hidden="true" />,
      eyebrow: 'Private link required',
      title: 'This Staff confirmation link is invalid or no longer active',
      copy: 'Please reopen the complete private invitation link sent by Infinity Club. A refreshed page cannot recover the private token.',
    },
    unavailable: {
      icon: <LockKeyhole aria-hidden="true" />,
      eyebrow: 'Link unavailable',
      title: 'This Staff confirmation link is currently unavailable',
      copy: 'Please contact Infinity Club if you still need access to this Staff confirmation.',
    },
    service_unavailable: {
      icon: <TriangleAlert aria-hidden="true" />,
      eyebrow: 'Service unavailable',
      title: 'We could not verify your invitation',
      copy: 'Please try the private link again in a few minutes. Your application has not been changed.',
    },
  }
  const state = states[kind] || states.invalid
  return <section className={`sc-status is-${kind}`} aria-live="polite" role={kind === 'service_unavailable' ? 'alert' : 'status'}>
    <span className="sc-status__icon">{state.icon}</span>
    <p className="sc-eyebrow">{state.eyebrow}</p>
    <h1>{state.title}</h1>
    <p>{state.copy}</p>
    {reference && <div className="sc-success-reference"><span>Application</span><strong>{reference}</strong></div>}
    <Link to="/" className="sc-text-link"><ArrowLeft size={14} aria-hidden="true" /> Back to Infinity</Link>
  </section>
}

export default function StaffConfirmationPage() {
  const [token] = useState(captureInvitationToken)
  const [view, setView] = useState(() => token ? { status: 'verifying', confirmation: null } : { status: 'invalid', confirmation: null })
  const [motivation, setMotivation] = useState('')
  const [workLinks, setWorkLinks] = useState([])
  const [linkErrors, setLinkErrors] = useState({})
  const [linksError, setLinksError] = useState('')
  const [formError, setFormError] = useState('')
  const [submittedReference, setSubmittedReference] = useState('')
  const textareaRef = useRef(null)
  const addLinkRef = useRef(null)
  const linkInputs = useRef(new Map())
  const nextLinkId = useRef(1)
  const pendingFocus = useRef(null)
  const count = useMemo(() => characterCount(normalizeMotivationText(motivation)), [motivation])
  const counter = counterStatus(count)

  useEffect(() => () => { capturedToken = undefined }, [])

  // Moves focus once the target has rendered and is enabled again: after a link
  // row is added or removed, or after the API rejects a field.
  useEffect(() => {
    const target = pendingFocus.current
    if (target === null || view.status === 'submitting') return
    pendingFocus.current = null
    if (target === 'add') addLinkRef.current?.focus()
    else if (target === 'motivation') textareaRef.current?.focus()
    else linkInputs.current.get(target)?.focus()
  }, [workLinks, view.status])

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Staff confirmation | Infinity Club'
    return () => { document.title = previousTitle }
  }, [])

  useEffect(() => {
    if (!token) return undefined
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    postJson(VERIFY_ENDPOINT, { token }, controller.signal)
      .then(({ response, payload }) => {
        if (!active) return
        if (response.ok && payload.success && payload.status === 'valid' && payload.confirmation) {
          setView({ status: 'ready', confirmation: payload.confirmation })
          return
        }
        if (response.ok && payload.status === 'already_submitted') {
          setView({ status: 'already_submitted', confirmation: null })
          return
        }
        if (response.ok && payload.status === 'complete') {
          setView({ status: 'complete', confirmation: null })
          return
        }
        setView({
          status: payload.status === 'expired' ? 'expired' : payload.status === 'unavailable' ? 'unavailable' : payload.status === 'invalid' ? 'invalid' : 'service_unavailable',
          confirmation: null,
        })
      })
      .catch(() => { if (active) setView({ status: 'service_unavailable', confirmation: null }) })
      .finally(() => window.clearTimeout(timeout))
    return () => {
      active = false
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [token])

  const clearLinkError = (id) => {
    setLinkErrors((current) => {
      if (!(id in current)) return current
      const next = { ...current }
      delete next[id]
      return next
    })
    setLinksError('')
  }

  const changeLink = (id, value) => {
    setWorkLinks((rows) => rows.map((row) => (row.id === id ? { ...row, value } : row)))
    clearLinkError(id)
  }

  const addLink = () => {
    if (workLinks.length >= STAFF_WORK_LINKS_MAX) return
    const id = nextLinkId.current
    nextLinkId.current += 1
    pendingFocus.current = id
    setWorkLinks((rows) => [...rows, { id, value: '' }])
  }

  const removeLink = (id) => {
    const index = workLinks.findIndex((row) => row.id === id)
    const remaining = workLinks.filter((row) => row.id !== id)
    pendingFocus.current = remaining.length ? remaining[Math.max(0, index - 1)].id : 'add'
    setWorkLinks(remaining)
    clearLinkError(id)
  }

  const submit = async (event) => {
    event.preventDefault()
    if (view.status === 'submitting') return
    const clean = normalizeMotivationText(motivation)
    const length = characterCount(clean)
    const filled = workLinks.filter((row) => row.value.trim())
    const errors = workLinkErrors(workLinks)
    setLinkErrors(errors)
    setLinksError('')
    if (length < MIN_LENGTH || length > MAX_LENGTH) {
      setFormError(length > MAX_LENGTH
        ? `Shorten your motivation to ${numberLabel(MAX_LENGTH)} characters or fewer.`
        : `Write at least ${MIN_LENGTH} characters before submitting.`)
      textareaRef.current?.focus()
      return
    }
    setFormError('')
    const firstInvalid = filled.find((row) => errors[row.id])
    if (firstInvalid) {
      linkInputs.current.get(firstInvalid.id)?.focus()
      return
    }
    setView((current) => ({ ...current, status: 'submitting' }))
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const { response, payload } = await postJson(SUBMIT_ENDPOINT, {
        token, motivation: clean, workLinks: filled.map((row) => normalizeStaffWorkLink(row.value).value),
      }, controller.signal)
      if (response.ok && payload.success) {
        if (payload.status === 'already_submitted') setView({ status: 'already_submitted', confirmation: null })
        else {
          setSubmittedReference(payload.reference || view.confirmation?.reference || '')
          setView({ status: 'success', confirmation: null })
        }
        return
      }
      if (payload.field === 'motivation') {
        setFormError(payload.message || `Write between ${MIN_LENGTH} and ${MAX_LENGTH} characters.`)
        pendingFocus.current = 'motivation'
        setView((current) => ({ ...current, status: 'ready' }))
        return
      }
      if (payload.field === 'workLinks') {
        const serverErrors = Object.fromEntries((Array.isArray(payload.errors) ? payload.errors : [])
          .filter((error) => filled[error?.index])
          .map((error) => [filled[error.index].id, LINK_ERRORS[error.code] ? error.code : 'invalid']))
        setLinkErrors(serverErrors)
        if (!Object.keys(serverErrors).length) setLinksError(payload.message || 'Check the links to your work and try again.')
        const firstRejected = filled.find((row) => serverErrors[row.id]) || filled[0]
        pendingFocus.current = firstRejected ? firstRejected.id : 'add'
        setView((current) => ({ ...current, status: 'ready' }))
        return
      }
      setView({ status: payload.status === 'expired' ? 'expired' : payload.status === 'unavailable' ? 'unavailable' : payload.status === 'invalid' ? 'invalid' : 'service_unavailable', confirmation: null })
    } catch {
      setFormError('We could not submit your motivation. Please check your connection and try again.')
      setView((current) => ({ ...current, status: 'ready' }))
    } finally {
      window.clearTimeout(timeout)
    }
  }

  const terminal = ['success', 'already_submitted', 'complete', 'expired', 'unavailable', 'invalid', 'service_unavailable'].includes(view.status)
  const confirmation = view.confirmation
  const revision = confirmation?.status === 'revision_requested'
  const submitting = view.status === 'submitting'
  const guidance = staffMotivationGuidance(confirmation?.staffDepartmentKey)
  const linksFull = workLinks.length >= STAFF_WORK_LINKS_MAX

  return <div className="staff-confirmation-page">
    <section className="sc-shell">
      <div className="page-container sc-topline">
        <Link to="/" className="sc-back"><ArrowLeft size={14} aria-hidden="true" /> Back to Infinity</Link>
        <span><LockKeyhole size={13} aria-hidden="true" /> Private candidate workflow</span>
      </div>
      <div className="page-container sc-layout">
        <aside className="sc-context" aria-label="Infinity Club Staff confirmation">
          <span className="sc-mark"><InfinityClubMark /></span>
          <p className="sc-kicker">JOIN / STAFF</p>
          <h2>Your next<br />chapter starts<br /><em>with intent.</em></h2>
          <p>One thoughtful letter is enough. Links to your work are welcome, but never required.</p>
          <div className="sc-privacy-note"><ShieldCheck size={17} aria-hidden="true" /><span><b>Your link is private.</b> Infinity never uses your public application reference as a password.</span></div>
        </aside>

        <div className="sc-paper">
          {view.status === 'verifying' && <section className="sc-verifying" role="status" aria-live="polite">
            <span className="sc-loader" aria-hidden="true" />
            <p className="sc-eyebrow">Staff confirmation</p>
            <h1>Verifying your private invitation...</h1>
            <p>Please keep this page open for a moment.</p>
          </section>}

          {terminal && <StatusCard kind={view.status} reference={submittedReference} />}

          {['ready', 'submitting'].includes(view.status) && confirmation && <>
            <header className="sc-form-header">
              <div><p className="sc-eyebrow">{revision ? 'Revision requested' : 'Staff confirmation'}</p><h1>{revision ? 'Add a clearer version.' : 'Tell us what drives you.'}</h1></div>
              <span><LockKeyhole size={13} aria-hidden="true" /> Secure</span>
            </header>

            <dl className="sc-application-facts">
              <div><dt>Application</dt><dd>{confirmation.reference}</dd></div>
              <div><dt>Candidate</dt><dd>{confirmation.displayName}</dd></div>
              <div><dt>Staff team</dt><dd>{confirmation.staffDepartment}</dd></div>
              <div><dt>Deadline</dt><dd>{deadlineLabel(confirmation.expiresAt)}</dd></div>
            </dl>

            {revision && <div className="sc-revision-message" role="note"><span>Message from Infinity</span><p>{confirmation.revisionMessage}</p></div>}

            <form onSubmit={submit} noValidate aria-busy={submitting}>
              <section className="sc-section" aria-labelledby="sc-motivation-title">
                <header className="sc-section__head"><span aria-hidden="true">01</span><h2 id="sc-motivation-title">Your motivation</h2></header>
                <div className="sc-help">
                  <p>This is your chance to introduce yourself beyond your application. In a few short paragraphs (150–2,000 characters), tell us:</p>
                  <ul>
                    <li>why you want to join this team;</li>
                    <li>what you can contribute — your skills, experience, projects or ideas;</li>
                    <li>what you hope to learn during your time with us;</li>
                    <li>concrete examples, whenever you can.</li>
                  </ul>
                  <p>Write as if you were speaking directly to a team you respect. Concrete examples matter more than compliments or generic phrases.</p>
                </div>
                <div className="sc-ideas">
                  <Lightbulb size={16} aria-hidden="true" />
                  <div>
                    <b>Ideas for {confirmation.staffDepartment}</b>
                    <p>You could talk about {guidance.ideas}</p>
                    <p>None of this is required. If you are just starting out, tell us what you are curious about and what you would like to learn.</p>
                  </div>
                </div>
                <p className="sc-question" id="staff-motivation-question">{STAFF_MOTIVATION_QUESTION}</p>
                <div className="sc-label-row"><label htmlFor="staff-motivation">Motivation letter</label><span>Plain text only — your links go in the next section</span></div>
                <textarea
                  ref={textareaRef}
                  id="staff-motivation"
                  value={motivation}
                  onChange={(event) => { setMotivation(event.target.value); if (formError) setFormError('') }}
                  rows={10}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={`staff-motivation-question staff-motivation-count staff-motivation-voice${formError ? ' staff-motivation-error' : ''}`}
                  placeholder={guidance.example}
                  disabled={submitting}
                />
                <div className={`sc-field-meta is-${counter.tone}`}>
                  <span id="staff-motivation-count" className="sc-counter"><b>{numberLabel(count)} / {numberLabel(MAX_LENGTH)}</b><em>{counter.note}</em></span>
                  <span className="sr-only" aria-live="polite">{COUNTER_ANNOUNCEMENTS[counter.tone] || ''}</span>
                  {formError && <p id="staff-motivation-error" role="alert">{formError}</p>}
                </div>
                <p className="sc-voice" id="staff-motivation-voice">Write in your own voice. We are interested in your real motivation, experience and ideas rather than a perfect or overly formal answer.</p>
              </section>

              <section className="sc-section" aria-labelledby="sc-work-title">
                <header className="sc-section__head"><span aria-hidden="true">02</span><h2 id="sc-work-title">Your work</h2></header>
                <fieldset className="sc-links" aria-describedby="staff-links-help">
                  <legend>Portfolio or links to your work <span>Optional</span></legend>
                  <p id="staff-links-help">Add public links to projects or work you would like the Infinity team to see: GitHub, Behance, Instagram, YouTube, a Figma prototype, a portfolio website or a project demo. No attachments needed.</p>
                  {workLinks.length > 0 && <ol className="sc-link-list">
                    {workLinks.map((row, index) => {
                      const error = linkErrors[row.id]
                      const errorId = `staff-link-${row.id}-error`
                      return <li key={row.id}>
                        <div className="sc-link-row">
                          <input
                            ref={(node) => { if (node) linkInputs.current.set(row.id, node); else linkInputs.current.delete(row.id) }}
                            type="url"
                            inputMode="url"
                            autoComplete="url"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            aria-label={`Link ${index + 1}`}
                            value={row.value}
                            placeholder={index === 0 ? guidance.linkPlaceholder : 'https://'}
                            onChange={(event) => changeLink(row.id, event.target.value)}
                            onBlur={() => setLinkErrors(workLinkErrors(workLinks))}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? errorId : undefined}
                            disabled={submitting}
                          />
                          <button type="button" className="sc-link-remove" onClick={() => removeLink(row.id)} disabled={submitting} aria-label={`Remove link ${index + 1}`}>
                            <X size={14} aria-hidden="true" /><span>Remove</span>
                          </button>
                        </div>
                        {error && <p id={errorId} className="sc-link-error" role="alert">{LINK_ERRORS[error]}</p>}
                      </li>
                    })}
                  </ol>}
                  <div className="sc-links-foot">
                    <button ref={addLinkRef} type="button" className="sc-add-link" onClick={addLink} disabled={submitting || linksFull}>
                      <Plus size={14} aria-hidden="true" />{workLinks.length ? 'Add another link' : 'Add a link'}
                    </button>
                    <span aria-live="polite">{linksFull ? `Maximum ${STAFF_WORK_LINKS_MAX} links.` : `Up to ${STAFF_WORK_LINKS_MAX} links, https:// preferred`}</span>
                  </div>
                  {linksError && <p className="sc-link-error" role="alert">{linksError}</p>}
                </fieldset>
              </section>

              <p className="sc-sensitive-note"><Info size={15} aria-hidden="true" /><span>Please do not include sensitive personal information such as identity document numbers, home addresses, banking details or health information.</span></p>

              <div className="sc-submit-row">
                <p><ShieldCheck size={14} aria-hidden="true" /> Submitted as plain text to the Infinity administration.</p>
                <button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit confirmation'}<Send size={15} aria-hidden="true" /></button>
              </div>
            </form>
          </>}
        </div>
      </div>
    </section>
  </div>
}
