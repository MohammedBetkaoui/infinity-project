import { useEffect, useState } from 'react'
import { CheckCircle2, LockKeyhole } from 'lucide-react'
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
const ALGIERS = 'Africa/Algiers'
const longDate = (value) => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: ALGIERS }).format(new Date(value))
const clock = (value) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: ALGIERS }).format(new Date(value))
const dayKey = (value) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: ALGIERS }).format(new Date(value))
// One line for the workshop window: a single day keeps its hours together
// (word joiners stop "09:00–12:30" from breaking at the dash), a longer
// workshop names both ends.
const schedule = (startsAt, endsAt) => {
  if (!endsAt) return `${longDate(startsAt)}, ${clock(startsAt)}`
  if (dayKey(startsAt) === dayKey(endsAt)) return `${longDate(startsAt)}, ${clock(startsAt)}⁠–⁠${clock(endsAt)}`
  return `${longDate(startsAt)}, ${clock(startsAt)} to ${longDate(endsAt)}, ${clock(endsAt)}`
}
const initials = (value) => String(value || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()

// The club's card back, taken from the event reel. The emblem is drawn in
// vector over the artwork so it stays sharp and can light up when dealt.
function DeckCard({ className = '' }) {
  return <div className={`workshop-deck-card ${className}`} aria-hidden="true">
    <img src="/assets/workshops/infinity-deck-card.webp" alt="" width="560" height="868" decoding="async" fetchPriority="high"/>
    <span className="workshop-deck-card__glow"/>
    <InfinityClubMark className="workshop-deck-card__mark" title=""/>
  </div>
}

// Playing-card corner index: the participant's initials over the Infinity suit.
function CardIndex({ value, end = false }) {
  return <span className={`workshop-face__index${end ? ' is-end' : ''}`} aria-hidden="true">{value}<InfinityClubMark title=""/></span>
}

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

  const title = state.event?.title || ''
  const cardIndex = initials(state.invitation?.fullName)

  return <main className="workshop-private-page">
    <div className="workshop-invite-vortex" aria-hidden="true"><i/><i/><i/><i/><i/><i/></div>
    <header className="workshop-invite-bar">
      <a className="workshop-invite-brand" href="/"><InfinityClubMark className="workshop-mark" title=""/>Infinity Club</a>
      <span className="workshop-invite-privacy"><LockKeyhole aria-hidden="true"/>Private invitation</span>
    </header>

    <div className="workshop-invite-main">
      {state.loading ? <div className="workshop-invite-state" role="status"><DeckCard className="is-waiting"/><p>Checking your invitation…</p></div>
        : state.error ? <div className="workshop-invite-state is-error"><DeckCard className="is-closed"/><h1>Invitation unavailable</h1><p>{state.error}</p><small>If you think this is a mistake, contact Infinity Club.</small></div>
        : state.pass ? <section className="workshop-pass-stage" aria-labelledby="workshop-pass-title">
          <header className="workshop-success"><CheckCircle2 aria-hidden="true"/><h1 id="workshop-pass-title">Registration confirmed</h1><p>Show this pass at the entrance. It holds your personal check-in code.</p></header>
          <WorkshopPass pass={state.pass}/>
        </section>
        : <section className="workshop-invite" aria-labelledby="workshop-event-title">
          <h1 id="workshop-event-title" className={`workshop-invite-title${title.length > 34 ? ' is-long' : ''}`}>{title}</h1>

          <div className="workshop-hand">
            <DeckCard className="is-dealt"/>
            <div className="workshop-face">
              <CardIndex value={cardIndex}/>
              <CardIndex value={cardIndex} end/>
              <header className="workshop-face__head">
                <h2>Reserve your place</h2>
                <p>Registered to <strong>{state.invitation.fullName}</strong></p>
              </header>

              <dl className="workshop-face__facts">
                <div><dt>When</dt><dd>{schedule(state.event.startsAt, state.event.endsAt)}</dd></div>
                <div><dt>Where</dt><dd>{state.event.location}</dd></div>
                {state.event.speaker && <div><dt>Hosted by</dt><dd>{state.event.speaker}</dd></div>}
              </dl>

              <form className="workshop-face__form" onSubmit={submit}>
                <label htmlFor="workshop-speciality">Your university speciality</label>
                <input
                  id="workshop-speciality"
                  aria-describedby="workshop-speciality-help"
                  autoComplete="off"
                  autoCapitalize="words"
                  maxLength={160}
                  minLength={2}
                  pattern="[\p{L}\p{N} .,'’\-\(\)+&\/]{2,160}"
                  placeholder="ST / MI / Computer Science / SNV / …"
                  required
                  value={form.universitySpeciality}
                  onChange={(e) => setForm({ ...form, universitySpeciality: e.target.value })}
                />
                <p id="workshop-speciality-help">It appears on your workshop pass.</p>
                <button className="workshop-register-button" disabled={submitting}>{submitting ? 'Creating your pass…' : 'Confirm registration'}</button>
              </form>

              <p className="workshop-face__privacy"><LockKeyhole aria-hidden="true"/>Your name comes from this private invitation. The only thing you add is your speciality.</p>
            </div>
          </div>
        </section>}
    </div>

    {/* The pass already carries the slogan; the page signs everything else. */}
    {!state.pass && <p className="workshop-invite-sign">No limits for Infiniters</p>}
  </main>
}
