import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock3, LockKeyhole, Send, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import InfinityClubMark from '../../components/InfinityClubMark'
import './staff-confirmation.css'

const VERIFY_ENDPOINT = '/api/join/staff-confirmation/verify'
const SUBMIT_ENDPOINT = '/api/join/staff-confirmation/submit'
const MIN_LENGTH = 150
const MAX_LENGTH = 2000
const REQUEST_TIMEOUT_MS = 12000

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
      copy: 'No further action is needed with this link. If Infinity requests a revision, you will receive a new private link.',
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
  const [formError, setFormError] = useState('')
  const [submittedReference, setSubmittedReference] = useState('')
  const textareaRef = useRef(null)
  const count = useMemo(() => characterCount(motivation), [motivation])

  useEffect(() => () => { capturedToken = undefined }, [])

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
        setView({
          status: payload.status === 'expired' ? 'expired' : payload.status === 'invalid' ? 'invalid' : 'service_unavailable',
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

  const submit = async (event) => {
    event.preventDefault()
    if (view.status === 'submitting') return
    const clean = motivation.replace(/\r\n?/g, '\n').trim()
    const length = characterCount(clean)
    if (length < MIN_LENGTH || length > MAX_LENGTH) {
      setFormError(`Write between ${MIN_LENGTH} and ${MAX_LENGTH} characters before submitting.`)
      textareaRef.current?.focus()
      return
    }
    setFormError('')
    setView((current) => ({ ...current, status: 'submitting' }))
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const { response, payload } = await postJson(SUBMIT_ENDPOINT, { token, motivation: clean }, controller.signal)
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
        setView((current) => ({ ...current, status: 'ready' }))
        textareaRef.current?.focus()
        return
      }
      setView({ status: payload.status === 'expired' ? 'expired' : payload.status === 'invalid' ? 'invalid' : 'service_unavailable', confirmation: null })
    } catch {
      setFormError('We could not submit your motivation. Please check your connection and try again.')
      setView((current) => ({ ...current, status: 'ready' }))
    } finally {
      window.clearTimeout(timeout)
    }
  }

  const terminal = ['success', 'already_submitted', 'expired', 'invalid', 'service_unavailable'].includes(view.status)
  const confirmation = view.confirmation
  const revision = confirmation?.status === 'revision_requested'

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
          <p>One thoughtful letter is enough. Tell us why this team matters to you, what you can contribute, and what you hope to learn.</p>
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

            <form onSubmit={submit} noValidate aria-busy={view.status === 'submitting'}>
              <div className="sc-prompt">
                <span>Your motivation</span>
                <p>Why do you want to join the Infinity Staff, what can you contribute to your chosen department, and what do you hope to learn through this experience?</p>
              </div>
              <label htmlFor="staff-motivation">Motivation letter</label>
              <textarea
                ref={textareaRef}
                id="staff-motivation"
                value={motivation}
                onChange={(event) => { setMotivation(event.target.value); if (formError) setFormError('') }}
                minLength={MIN_LENGTH}
                maxLength={MAX_LENGTH}
                rows={11}
                aria-invalid={Boolean(formError)}
                aria-describedby={`staff-motivation-count${formError ? ' staff-motivation-error' : ''}`}
                placeholder="Write in your own words..."
                disabled={view.status === 'submitting'}
              />
              <div className="sc-field-meta">
                <span id="staff-motivation-count" aria-live="polite">{count} / {MAX_LENGTH} characters <em>Minimum {MIN_LENGTH}</em></span>
                {formError && <p id="staff-motivation-error" role="alert">{formError}</p>}
              </div>
              <div className="sc-submit-row">
                <p><ShieldCheck size={14} aria-hidden="true" /> Submitted as plain text to the Infinity administration.</p>
                <button type="submit" disabled={view.status === 'submitting'}>{view.status === 'submitting' ? 'Submitting...' : 'Submit motivation'}<Send size={15} aria-hidden="true" /></button>
              </div>
            </form>
          </>}
        </div>
      </div>
    </section>
  </div>
}
