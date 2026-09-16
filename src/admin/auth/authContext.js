import { createContext, useContext } from 'react'

// Deliberately mirrors the shape returned by supabase.auth so that
// swapping the mock provider for the real client is a one-file change:
//   session -> supabase.auth.getSession()
//   signIn  -> supabase.auth.signInWithPassword()
//   signOut -> supabase.auth.signOut()
export const AuthContext = createContext({
  session: null,
  loading: true,
  signIn: async () => ({ error: null }),
  signOut: async () => {},
})

export const useAuth = () => useContext(AuthContext)

export const SESSION_KEY = 'infinity-admin-session'
