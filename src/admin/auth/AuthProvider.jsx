import { useCallback, useMemo, useState } from 'react'
import { AuthContext, SESSION_KEY } from './authContext'

const readSession = () => {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

// MOCK ONLY — no credential is verified here and nothing is protected by
// this on its own. Real access control has to live server-side (Supabase
// Auth + row level security on the admin tables); a client-side guard can
// only decide what UI to render.
export default function AuthProvider({ children }) {
  // sessionStorage is synchronous, so the session is known on first render.
  // `loading` stays in the contract because supabase.auth.getSession() is
  // async — the guard already handles it and will not need changes.
  const [session, setSession] = useState(readSession)
  const loading = false

  const signIn = useCallback(async (email, password) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim())) {
      return { error: { message: 'Adresse email invalide.' } }
    }
    if (String(password || '').length < 4) {
      return { error: { message: 'Mot de passe trop court.' } }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 620))

    const name = String(email).split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    const next = {
      user: {
        id: 'mock-admin',
        email: String(email).trim().toLowerCase(),
        user_metadata: { full_name: name, role: 'Bureau' },
      },
      expires_at: Date.now() + 1000 * 60 * 60 * 8,
    }
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next))
    } catch {
      // A private window can refuse storage; the session still works in memory.
    }
    setSession(next)
    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    try {
      window.sessionStorage.removeItem(SESSION_KEY)
    } catch {
      // Nothing to clear.
    }
    setSession(null)
  }, [])

  const value = useMemo(() => ({ session, loading, signIn, signOut }), [session, loading, signIn, signOut])

  return <AuthContext value={value}>{children}</AuthContext>
}
