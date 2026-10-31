import { useEffect, useState } from 'react'
import { CheckCircle2, CalendarDays, MapPin, UserRound } from 'lucide-react'
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
    <div className="workshop-private-shell">
      {state.loading ? <div className="workshop-private-state" role="status"><span className="workshop-loader"/>Validating your private invitation…</div>
        : state.error ? <div className="workshop-private-state is-error"><span>∞</span><h1>Invitation unavailable</h1><p>{state.error}</p><small>Please contact Infinity Club if you believe this is a mistake.</small></div>
        : state.pass ? <><div className="workshop-success"><CheckCircle2/><p>Your registration is confirmed. Keep this personal pass ready on your phone.</p></div><WorkshopPass pass={state.pass}/></>
        : <section className="workshop-registration-card">
          <header><InfinityClubMark className="workshop-mark"/><p className="workshop-kicker">Infinity Club · Private invitation</p><h1>{state.event.title}</h1></header>
          <div className="workshop-event-facts"><p><CalendarDays/>{schedule(state.event.startsAt)}</p><p><MapPin/>{state.event.location}</p><p><UserRound/>{state.event.speaker}</p></div>
          <p className="workshop-invitee">Registered to <strong>{state.invitation.fullName}</strong> — the identity tied to this private invitation.</p>
          <form onSubmit={submit}>
            <label><span>University speciality *</span>
              <input
                autoComplete="off"
                maxLength={160}
                minLength={2}
                pattern="[\p{L}\p{N} .,'’\-()+&/]{2,160}"
                required
                value={form.universitySpeciality}
                onChange={(e) => setForm({ ...form, universitySpeciality: e.target.value })}
              />
            </label>
            <button disabled={submitting}>{submitting ? 'Creating your pass…' : 'Confirm registration'}</button>
          </form>
          <p className="workshop-privacy">Your name comes from the private invitation. Only your university speciality is stored for this workshop.</p>
        </section>}
    </div>
  </main>
}
