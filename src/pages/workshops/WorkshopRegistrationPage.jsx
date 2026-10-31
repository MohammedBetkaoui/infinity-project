import { useEffect, useState } from 'react'
import {
  ArrowRight, CalendarDays, CheckCircle2, Cpu, LockKeyhole, MapPin, ShieldCheck, Sparkles, UserRound,
} from 'lucide-react'
import InfinityClubMark from '../../components/InfinityClubMark.jsx'
import WorkshopPass from './WorkshopPass.jsx'
import './workshop.css'
import './workshopBadge.css'

const TOKEN_KEY = 'infinity-workshop-invitation-token'
const SPECIALITY_KEY = 'infinity-workshop-speciality'
const api = async (path, body) => {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}
const schedule = (value) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Algiers' }).format(new Date(value))
const initials = (value) => String(value || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

export default function WorkshopRegistrationPage() {
  const [state, setState] = useState({ loading: true, error: '', invitation: null, registration: null, event: null, pass: null })
  const [form, setForm] = useState({ universitySpeciality: '' })
  const [submitting, setSubmitting] = useState(false)
  const token = sessionStorage.getItem(TOKEN_KEY) || ''

  const register = async (registrationToken, speciality) => {
    setSubmitting(true)
    const { response, payload } = await api('/api/workshops/register', { token: registrationToken, universitySpeciality: speciality })
    setSubmitting(false)
    if (!response.ok) { setState((current) => ({ ...current, loading: false, error: payload.message || 'Registration is unavailable.' })); return }
    sessionStorage.setItem(SPECIALITY_KEY, payload.pass.universitySpeciality || '')
    setState((current) => ({ ...current, loading: false, error: '', pass: payload.pass }))
  }

  useEffect(() => {
    let active = true
    const params = new URLSearchParams(window.location.search)
    const queryToken = params.get('t') || ''
    if (queryToken) sessionStorage.setItem(TOKEN_KEY, queryToken)
    const privateToken = queryToken || sessionStorage.getItem(TOKEN_KEY) || ''
    if (queryToken) window.history.replaceState({}, '', '/workshops/register')
    if (!privateToken) {
      Promise.resolve().then(() => active && setState({ loading: false, error: 'This private workshop link is invalid or no longer active.', invitation: null, registration: null, event: null, pass: null }))
      return undefined
    }
    // The participant name is resolved by the server from the private
    // invitation; the form only asks for the university speciality.
    api('/api/workshops/invitation', { token: privateToken }).then(({ response, payload }) => {
      if (!active) return
      if (!response.ok) { sessionStorage.removeItem(TOKEN_KEY); setState({ loading: false, error: payload.message || 'This private workshop link is invalid or no longer active.', invitation: null, registration: null, event: null, pass: null }); return }
      const fullName = payload.invitation.fullName || ''
      const prefilled = payload.registration?.universitySpeciality
        || sessionStorage.getItem(SPECIALITY_KEY)
        || ''
      setForm((current) => ({ ...current, universitySpeciality: prefilled }))
      setState({ loading: false, error: '', invitation: { ...payload.invitation, fullName }, registration: payload.registration, event: payload.event, pass: null })
      if (payload.invitation.alreadyRegistered && prefilled) register(privateToken, prefilled)
    }).catch(() => active && setState({ loading: false, error: 'Workshop registration is temporarily unavailable.', invitation: null, registration: null, event: null, pass: null }))
    return () => { active = false }
  }, [])

  const submit = (event) => {
    event.preventDefault()
    const universitySpeciality = form.universitySpeciality.trim().replace(/\s+/g, ' ')
    if (!universitySpeciality) return
    register(token, universitySpeciality)
  }

  return <main className="workshop-private-page">
    <div className="workshop-private-ambient" aria-hidden="true"><i/><i/><i/></div>
    <div className="workshop-private-shell">
      {state.loading ? <div className="workshop-private-state" role="status"><span className="workshop-loader"/>Validating your private invitation…</div>
        : state.error ? <div className="workshop-private-state is-error"><span>∞</span><h1>Invitation unavailable</h1><p>{state.error}</p><small>Please contact Infinity Club if you believe this is a mistake.</small></div>
        : state.pass ? <section className="workshop-pass-stage"><div className="workshop-success"><CheckCircle2/><p>Your registration is confirmed. Keep this personal pass ready on your phone.</p></div><WorkshopPass pass={state.pass}/></section>
        : <section className="workshop-registration-experience">
          <div className="workshop-registration-brand">
            <div className="workshop-brand-signature"><InfinityClubMark className="workshop-mark"/><span><strong>Infinity Club</strong><small>Automation lab / Private access</small></span></div>
            <span className="workshop-secure-chip"><LockKeyhole/>Secure invitation</span>
          </div>

          <div className="workshop-registration-layout">
            <aside className="workshop-concept-panel" aria-label="AI Automation workshop artwork">
              <div className="workshop-concept-copy">
                <p className="workshop-kicker"><Sparkles/>AI Automation workshop</p>
                <h1>{state.event.title}</h1>
                <p className="workshop-concept-intro">Turn repetitive work into intelligent systems. Your private invitation is the first step into the lab.</p>
              </div>

              <div className="workshop-deck" aria-hidden="true">
                <div className="workshop-deck-card is-shadow"/>
                <div className="workshop-deck-card is-offset"/>
                <div className="workshop-deck-card is-main">
                  <span className="workshop-card-corner is-top">AI<small>∞</small></span>
                  <span className="workshop-card-corner is-bottom">AI<small>∞</small></span>
                  <div className="workshop-card-rays"/>
                  <div className="workshop-card-orbit is-wide"/>
                  <div className="workshop-card-orbit is-tight"/>
                  <div className="workshop-card-core"><InfinityClubMark title="Infinity Club emblem"/></div>
                  <div className="workshop-card-caption"><strong>AI Automation</strong><small>Infinity workshop / 2026</small></div>
                </div>
              </div>

              <div className="workshop-concept-foot"><span>01 / Design the flow</span><span>02 / Automate the work</span><span>03 / Scale the idea</span></div>
            </aside>

            <div className="workshop-registration-panel">
              <header className="workshop-registration-heading">
                <p><span/>Invitation verified</p>
                <h2>Reserve your place.</h2>
                <small>Review the session details and complete the final field to generate your personal workshop pass.</small>
              </header>

              <div className="workshop-event-facts" aria-label="Workshop details">
                <div><span><CalendarDays/></span><p><small>Date &amp; time</small><strong>{schedule(state.event.startsAt)}</strong></p></div>
                <div><span><MapPin/></span><p><small>Location</small><strong>{state.event.location}</strong></p></div>
                <div><span><UserRound/></span><p><small>Workshop host</small><strong>{state.event.speaker}</strong></p></div>
              </div>

              <div className="workshop-invitee">
                <span aria-hidden="true">{initials(state.invitation.fullName)}</span>
                <p><small>Participant identity</small>Registered to <strong>{state.invitation.fullName}</strong></p>
                <ShieldCheck aria-label="Verified identity"/>
              </div>

              <form className="workshop-registration-form" onSubmit={submit}>
                <div className="workshop-field-heading"><label htmlFor="workshop-speciality">University speciality</label><span>Required</span></div>
                <div className="workshop-input-wrap">
                  <Cpu aria-hidden="true"/>
                  <input
                    id="workshop-speciality"
                    aria-describedby="workshop-speciality-help"
                    autoComplete="off"
                    autoCapitalize="words"
                    maxLength={160}
                    minLength={2}
                    pattern="[\p{L}\p{N} .,'’\-()+&/]{2,160}"
                    placeholder="e.g. Artificial Intelligence"
                    required
                    value={form.universitySpeciality}
                    onChange={(e) => setForm({ ...form, universitySpeciality: e.target.value })}
                  />
                </div>
                <p id="workshop-speciality-help" className="workshop-field-help">This will appear on your personal workshop pass.</p>
                <button className="workshop-register-button" disabled={submitting}>
                  <span>{submitting ? 'Creating your pass…' : 'Confirm registration'}</span><ArrowRight aria-hidden="true"/>
                </button>
              </form>

              <p className="workshop-privacy"><LockKeyhole/>Your name is securely resolved from this private invitation. Only your university speciality is added for the workshop.</p>
            </div>
          </div>
        </section>}
    </div>
  </main>
}
