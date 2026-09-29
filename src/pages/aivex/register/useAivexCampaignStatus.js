import { useCallback, useEffect, useState } from 'react'

export const AIVEX_CAMPAIGN_STATUS_ENDPOINT = '/api/aivex/register'

const PUBLIC_STATUSES = new Set(['not_open', 'open', 'closed', 'disabled'])
const MAX_TIMEOUT_MS = 2_147_000_000

const initialState = Object.freeze({
  status: 'loading',
  edition: null,
  registrationEnabled: false,
  registrationOpenAt: null,
  registrationCloseAt: null,
  error: '',
})

export default function useAivexCampaignStatus() {
  const [state, setState] = useState(initialState)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    fetch(AIVEX_CAMPAIGN_STATUS_ENDPOINT, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        let body = {}
        try { body = await response.json() } catch { /* Invalid JSON fails closed below. */ }
        if (!response.ok || body.success !== true || !PUBLIC_STATUSES.has(body.status)) {
          throw new Error(body.message || 'campaign_status_unavailable')
        }
        setState({
          status: body.status,
          edition: Number(body.edition),
          registrationEnabled: body.registrationEnabled === true,
          registrationOpenAt: body.registrationOpenAt || null,
          registrationCloseAt: body.registrationCloseAt || null,
          error: '',
        })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState({ ...initialState, status: 'error', error: 'campaign_status_unavailable' })
      })
    return () => controller.abort()
  }, [refreshKey])

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refresh])

  useEffect(() => {
    const boundary = state.status === 'not_open'
      ? Date.parse(state.registrationOpenAt)
      : state.status === 'open' ? Date.parse(state.registrationCloseAt) + 1000 : NaN
    if (!Number.isFinite(boundary)) return undefined
    const remaining = Math.max(0, boundary - Date.now())
    if (remaining === 0) return undefined
    const timer = window.setTimeout(refresh, Math.min(remaining, MAX_TIMEOUT_MS))
    return () => window.clearTimeout(timer)
  }, [refresh, refreshKey, state.registrationCloseAt, state.registrationOpenAt, state.status])

  return { ...state, retry: refresh }
}
