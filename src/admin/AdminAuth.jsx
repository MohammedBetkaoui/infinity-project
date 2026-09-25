import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

const AdminAuthContext = createContext(null)
const SESSION_TOUCH_MS = 5 * 60 * 1000
const SESSION_IDLE_MS = 30 * 60 * 1000

async function readResponse(response) {
  try { return await response.json() } catch { return {} }
}

async function adminRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json', ...(options.headers || {}) } : options.headers,
  })
  return { response, body: await readResponse(response) }
}

export function AdminAuthProvider({ children }) {
  const [status, setStatus] = useState('loading')
  const [user, setUser] = useState(null)
  const refreshPromise = useRef(null)
  const authEpoch = useRef(0)
  const lastSessionCheck = useRef(0)
  const lastActivity = useRef(0)

  const refreshSession = useCallback(async () => {
    if (refreshPromise.current) return refreshPromise.current
    const epoch = authEpoch.current
    refreshPromise.current = (async () => {
      try {
        const { response, body } = await adminRequest('/api/admin/auth/session')
        if (epoch !== authEpoch.current) return { authenticated: false }
        if (response.ok && body.authenticated && body.user) {
          lastSessionCheck.current = Date.now()
          if (!lastActivity.current) lastActivity.current = Date.now()
          setUser(body.user)
          setStatus('authenticated')
          return { authenticated: true, user: body.user }
        }
      } catch {
        // Network and server failures fail closed. The login screen can retry.
      }
      if (epoch !== authEpoch.current) return { authenticated: false }
      setUser(null)
      setStatus('unauthenticated')
      return { authenticated: false }
    })().finally(() => { refreshPromise.current = null })
    return refreshPromise.current
  }, [])

  useEffect(() => { refreshSession() }, [refreshSession])

  useEffect(() => {
    if (status !== 'authenticated') return undefined
    const registerActivity = () => {
      const timestamp = Date.now()
      lastActivity.current = timestamp
      if (timestamp - lastSessionCheck.current >= SESSION_TOUCH_MS) refreshSession()
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return
      lastActivity.current = Date.now()
      refreshSession()
    }
    const interval = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= SESSION_IDLE_MS) refreshSession()
    }, 60 * 1000)
    for (const eventName of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(eventName, registerActivity, { passive: true })
    window.addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.clearInterval(interval)
      for (const eventName of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(eventName, registerActivity)
      window.removeEventListener('focus', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refreshSession, status])

  const login = useCallback(async (username, password) => {
    try {
      const { response, body } = await adminRequest('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok || !body.user) return { ok: false, message: body.message || 'Invalid username or password.' }
      authEpoch.current += 1
      lastSessionCheck.current = Date.now()
      lastActivity.current = Date.now()
      setUser(body.user)
      setStatus('authenticated')
      return { ok: true, user: body.user }
    } catch {
      return { ok: false, message: 'Unable to reach the secure administration service.' }
    }
  }, [])

  const logout = useCallback(async () => {
    authEpoch.current += 1
    setUser(null)
    setStatus('unauthenticated')
    try { await adminRequest('/api/admin/auth/logout', { method: 'POST', body: '{}' }) } catch { /* Local state still closes. */ }
  }, [])

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    try {
      const { response, body } = await adminRequest('/api/admin/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      if (response.status === 401) {
        setUser(null)
        setStatus('unauthenticated')
      }
      if (!response.ok) return { ok: false, message: body.message || 'Unable to change password.' }
      lastSessionCheck.current = Date.now()
      lastActivity.current = Date.now()
      if (body.user) setUser(body.user)
      return { ok: true }
    } catch {
      return { ok: false, message: 'Unable to reach the secure administration service.' }
    }
  }, [])

  const value = useMemo(() => ({ status, user, login, logout, refreshSession, changePassword }), [changePassword, login, logout, refreshSession, status, user])
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminAuth() {
  const value = useContext(AdminAuthContext)
  if (!value) throw new Error('useAdminAuth must be used inside AdminAuthProvider')
  return value
}
