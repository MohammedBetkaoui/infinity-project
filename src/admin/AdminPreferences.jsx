import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAdminAuth } from './AdminAuth'
import {
  ADMIN_PREFERENCE_DEFAULTS, normalizeAdminPreferences, reviewQueueItems,
} from './adminPreferencesModel'

const AdminPreferencesContext = createContext(null)
const PREFERENCES_ENDPOINT = '/api/admin/settings/preferences'
const REVIEW_QUEUE_ENDPOINT = '/api/admin/aivex?edition=2&page=1&limit=12&sort=attention_asc'
function useOperatingSystemReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true)
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!query) return undefined
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])
  return reduced
}

export function AdminPreferencesProvider({ children }) {
  const { request } = useAdminAuth()
  const [state, setState] = useState({
    status: 'loading', preferences: { ...ADMIN_PREFERENCE_DEFAULTS }, saving: false, refreshing: false, error: '',
  })
  const mutation = useRef(false)
  const osReducedMotion = useOperatingSystemReducedMotion()

  const load = useCallback(async ({ signal } = {}) => {
    try {
      const { response, body } = await request(PREFERENCES_ENDPOINT, { signal })
      if (!response.ok || !body.preferences) {
        throw new Error(body.message || 'Unable to load administrator preferences.')
      }
      const preferences = normalizeAdminPreferences(body.preferences)
      setState((current) => ({ ...current, status: 'ready', preferences, refreshing: false, error: '' }))
      return { ok: true, preferences }
    } catch (error) {
      if (error.name === 'AbortError') return { ok: false, aborted: true }
      const message = error.message || 'Unable to load administrator preferences.'
      setState((current) => ({ ...current, status: 'error', refreshing: false, error: message }))
      return { ok: false, message }
    }
  }, [request])

  useEffect(() => {
    const controller = new AbortController()
    Promise.resolve().then(() => load({ signal: controller.signal }))
    return () => controller.abort()
  }, [load])

  const refreshPreferences = useCallback(() => {
    setState((current) => ({ ...current, refreshing: true }))
    return load()
  }, [load])

  const updatePreferences = useCallback(async (changes) => {
    if (mutation.current) return { ok: false, message: 'Another preference update is still being saved.' }
    mutation.current = true
    setState((current) => ({ ...current, saving: true, error: '' }))
    try {
      const current = state.preferences
      const input = normalizeAdminPreferences({ ...current, ...changes })
      const { response, body } = await request(PREFERENCES_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(input),
      })
      if (!response.ok || !body.preferences) {
        return { ok: false, field: body.field, message: body.message || 'Unable to save administrator preferences.' }
      }
      setState((previous) => ({ ...previous, preferences: normalizeAdminPreferences(body.preferences), status: 'ready' }))
      const refreshed = await load()
      if (!refreshed.ok) {
        return { ok: false, message: 'Preferences were saved, but their authoritative state could not be refreshed.' }
      }
      return refreshed
    } catch {
      return { ok: false, message: 'Unable to reach the administration service.' }
    } finally {
      mutation.current = false
      setState((current) => ({ ...current, saving: false }))
    }
  }, [load, request, state.preferences])

  const value = useMemo(() => ({
    ...state,
    effectiveReducedMotion: osReducedMotion || state.preferences.reducedMotion,
    osReducedMotion,
    updatePreferences,
    refreshPreferences,
  }), [osReducedMotion, refreshPreferences, state, updatePreferences])

  return <AdminPreferencesContext.Provider value={value}>{children}</AdminPreferencesContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminReviewQueue(enabled = true) {
  const { request } = useAdminAuth()
  const [refreshKey, setRefreshKey] = useState(0)
  const [state, setState] = useState({ status: enabled ? 'loading' : 'ready', items: [], error: '' })

  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    let active = true
    Promise.resolve().then(() => {
      if (active) setState((current) => ({ ...current, status: 'loading', error: '' }))
    })
    request(REVIEW_QUEUE_ENDPOINT, { signal: controller.signal })
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.message || 'Unable to load the review queue.')
        setState({ status: 'ready', items: reviewQueueItems(body.data), error: '' })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setState((current) => ({ ...current, status: 'error', error: error.message || 'Unable to load the review queue.' }))
        }
      })
    return () => { active = false; controller.abort() }
  }, [enabled, refreshKey, request])

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), [])
  return enabled ? { ...state, refresh } : { status: 'ready', items: [], error: '', refresh }
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminPreferences() {
  const value = useContext(AdminPreferencesContext)
  if (!value) throw new Error('useAdminPreferences must be used inside AdminPreferencesProvider')
  return value
}
