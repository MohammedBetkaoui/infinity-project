import { useEffect, useState } from 'react'
import { CheckCircle2, CalendarDays, MapPin, UserRound } from 'lucide-react'
import InfinityClubMark from '../../components/InfinityClubMark.jsx'
import WorkshopPass from './WorkshopPass.jsx'
import './workshop.css'
import './workshopBadge.css'

const TOKEN_KEY = 'infinity-workshop-invitation-token'
const api = async (path, body) => {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}
const schedule = (value) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Algiers' }).format(new Date(value))

export default function WorkshopRegistrationPage() {
  const [state, setState] = useState({ loading: true, error: '', invitation: null, event: null, pass: null })
  const [form, setForm] = useState({ firstName: '', lastName: '' })
  const [submitting, setSubmitting] = useState(false)
  const token = sessionStorage.getItem(TOKEN_KEY) || ''

  const register = async (registrationToken, names) => {
    setSubmitting(true)
    const { response, payload } = await api('/api/workshops/register', { token: registrationToken, ...names })
    setSubmitting(false)
    if (!response.ok) { setState((current) => ({ ...current, loading: false, error: payload.message || 'Registration is unavailable.' })); return }
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
      Promise.resolve().then(() => active && setState({ loading: false, error: 'This private workshop link is invalid or no longer active.', invitation: null, event: null, pass: null }))
      return undefined
    }
    api('/api/workshops/invitation', { token: privateToken }).then(({ response, payload }) => {
      if (!active) return
      if (!response.ok) { sessionStorage.removeItem(TOKEN_KEY); setState({ loading: false, error: payload.message || 'This private workshop link is invalid or no longer active.', invitation: null, event: null, pass: null }); return }
      const names = { firstName: payload.invitation.firstName || '', lastName: payload.invitation.lastName || '' }
      setForm(names)
      setState({ loading: false, error: '', invitation: payload.invitation, event: payload.event, pass: null })
      if (payload.invitation.alreadyRegistered && names.firstName && names.lastName) register(privateToken, names)
    }).catch(() => active && setState({ loading: false, error: 'Workshop registration is temporarily unavailable.', invitation: null, event: null, pass: null }))
    return () => { active = false }
  }, [])

  const submit = (event) => {
    event.preventDefault()
    const firstName = form.firstName.trim().replace(/\s+/g, ' ')
    const lastName = form.lastName.trim().replace(/\s+/g, ' ')
    if (!firstName || !lastName) return
    register(token, { firstName, lastName })
  }

  return <main className="workshop-private-page">
    <div className="workshop-private-shell">
      {state.loading ? <div className="workshop-private-state" role="status"><span className="workshop-loader"/>Validating your private invitation…</div>
        : state.error ? <div className="workshop-private-state is-error"><span>∞</span><h1>Invitation unavailable</h1><p>{state.error}</p><small>Please contact Infinity Club if you believe this is a mistake.</small></div>
        : state.pass ? <><div className="workshop-success"><CheckCircle2/><p>Your registration is confirmed. Keep this personal pass ready on your phone.</p></div><WorkshopPass pass={state.pass}/></>
        : <section className="workshop-registration-card">
          <header><InfinityClubMark className="workshop-mark"/><p className="workshop-kicker">Infinity Club · Private invitation</p><h1>{state.event.title}</h1></header>
          <div className="workshop-event-facts"><p><CalendarDays/>{schedule(state.event.startsAt)}</p><p><MapPin/>{state.event.location}</p><p><UserRound/>{state.event.speaker}</p></div>
          <form onSubmit={submit}><div className="workshop-name-grid"><label><span>First name *</span><input autoComplete="given-name" maxLength={80} required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })}/></label><label><span>Last name *</span><input autoComplete="family-name" maxLength={80} required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })}/></label></div><button disabled={submitting}>{submitting ? 'Creating your pass…' : 'Confirm registration'}</button></form>
          <p className="workshop-privacy">Your workshop and membership are fixed by this private invitation. No member or event identifier is exposed.</p>
        </section>}
    </div>
  </main>
}
