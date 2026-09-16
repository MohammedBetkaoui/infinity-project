import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Lock, ShieldAlert } from 'lucide-react'
import InfinityMark from '../../components/InfinityMark'
import { useAuth } from './authContext'

export default function AdminLogin() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (session) return <Navigate to={location.state?.from || '/admin/demandes'} replace />

  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const { error: failure } = await signIn(email, password)
    setBusy(false)
    if (failure) {
      setError(failure.message)
      return
    }
    navigate(location.state?.from || '/admin/demandes', { replace: true })
  }

  return (
    <div className="ad-login">
      <div className="ad-login-card">
        <div className="ad-login-watermark" aria-hidden="true"><InfinityMark /></div>
        <div className="ad-login-mark" aria-hidden="true"><InfinityMark /></div>
        <h1>Infinity Control</h1>
        <p>Espace réservé au bureau du club.</p>

        <form className="ad-login-form" onSubmit={submit} noValidate>
          <div className="ad-form-field">
            <label htmlFor="admin-email">Email</label>
            <input id="admin-email" className="ad-input" type="email" autoComplete="username"
              value={email} onChange={(event) => setEmail(event.target.value)} placeholder="prenom.nom@univ-bba.dz" />
          </div>
          <div className="ad-form-field">
            <label htmlFor="admin-password">Mot de passe</label>
            <input id="admin-password" className="ad-input" type="password" autoComplete="current-password"
              value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
          </div>

          {error && <p className="ad-form-error" role="alert"><ShieldAlert size={13} /> {error}</p>}

          <button type="submit" className="ad-btn" data-variant="primary" disabled={busy} style={{ height: 40 }}>
            {busy ? 'Connexion...' : <>Entrer <ArrowRight size={15} /></>}
          </button>
        </form>

        <p className="ad-login-note">
          <Lock size={13} />
          <span>
            Session de démonstration : aucun identifiant n'est vérifié pour l'instant.
            Le contrôle d'accès réel se fera côté serveur (Supabase Auth + RLS) avant toute mise en ligne.
          </span>
        </p>
      </div>
    </div>
  )
}
