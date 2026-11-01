import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAdminAuth } from './AdminAuth'

// Shared with the global search, which asks the same endpoints.
export function eventsQueryString({ page, limit, search, filters, sort }) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), q: search || '', sort })
  if (filters.type) params.set('type', filters.type)
  if (filters.status) params.set('status', filters.status)
  for (const [key, value] of [...params.entries()]) if (!value) params.delete(key)
  return params.toString()
}

function participantsQueryString({ page, limit, search, type, link }) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), q: search || '' })
  if (type) params.set('type', type)
  if (link) params.set('link', link)
  return params.toString()
}

function attendanceQueryString({ page, limit, status }) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (status) params.set('status', status)
  return params.toString()
}

export function useAdminEvents({ page, limit = 12, search, filters, sort }) {
  const { request } = useAdminAuth()
  const [state, setState] = useState({ events: [], summary: [], pagination: { page: 1, limit, total: 0, pages: 1 }, loading: true, error: '', resolvedKey: '' })
  const [refreshKey, setRefreshKey] = useState(0)
  const query = useMemo(() => eventsQueryString({ page, limit, search, filters, sort }), [filters, limit, page, search, sort])
  const requestKey = `events::${query}::${refreshKey}`
  useEffect(() => {
    const controller = new AbortController()
    request(`/api/admin/events?${query}`, { signal: controller.signal }).then(({ response, body }) => {
      if (!response.ok) throw new Error(body.message || 'Unable to load events.')
      setState({ events: body.data || [], summary: body.summary || [], pagination: body.pagination || { page: 1, limit, total: 0, pages: 1 }, loading: false, error: '', resolvedKey: requestKey })
    }).catch((error) => {
      if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error.message, resolvedKey: requestKey }))
    })
    return () => controller.abort()
  }, [limit, query, request, requestKey])
  return { ...state, loading: state.loading || state.resolvedKey !== requestKey, refresh: useCallback(() => setRefreshKey((value) => value + 1), []) }
}

export function useAdminEvent(eventId) {
  const { request } = useAdminAuth()
  const [state, setState] = useState({ event: null, loading: Boolean(eventId), error: '' })
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    if (!eventId) return undefined
    const controller = new AbortController()
    request(`/api/admin/events/${encodeURIComponent(eventId)}`, { signal: controller.signal }).then(({ response, body }) => {
      if (response.status === 404) throw new Error('This event no longer exists.')
      if (!response.ok) throw new Error(body.message || 'Unable to load this event.')
      setState({ event: body.event || null, loading: false, error: '' })
    }).catch((error) => {
      if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error.message }))
    })
    return () => controller.abort()
  }, [eventId, refreshKey, request])
  return { ...state, refresh: useCallback(() => setRefreshKey((value) => value + 1), []) }
}

// Workshop participants are member AND staff applications, not club members:
// the list combines the application identity with its private link (if any)
// and registration. type = member|staff, link = missing|ready|new.
export function useAdminEventParticipants({ eventId, page, limit = 50, search, type = '', link = '', active = true }) {
  const { request } = useAdminAuth()
  const [state, setState] = useState({ participants: [], pagination: { page: 1, limit, total: 0, pages: 1 }, loading: true, error: '', resolvedKey: '' })
  const [refreshKey, setRefreshKey] = useState(0)
  const query = useMemo(() => participantsQueryString({ page, limit, search, type, link }), [limit, link, page, search, type])
  const requestKey = `event-participants::${eventId}::${query}::${refreshKey}`
  useEffect(() => {
    if (!eventId || !active) return undefined
    const controller = new AbortController()
    request(`/api/admin/events/${encodeURIComponent(eventId)}/participants?${query}`, { signal: controller.signal }).then(({ response, body }) => {
      if (!response.ok) throw new Error(body.message || 'Unable to load the participant list.')
      setState({ participants: body.data || [], pagination: body.pagination || { page: 1, limit, total: 0, pages: 1 }, loading: false, error: '', resolvedKey: requestKey })
    }).catch((error) => {
      if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error.message, resolvedKey: requestKey }))
    })
    return () => controller.abort()
  }, [active, eventId, limit, query, request, requestKey])
  return { ...state, loading: state.loading || state.resolvedKey !== requestKey, refresh: useCallback(() => setRefreshKey((value) => value + 1), []) }
}

// How many applications are eligible, already have a private link, still wait
// for one, or have a link that was never exported.
const EMPTY_SECTION = Object.freeze({ members: 0, staff: 0, total: 0 })
const EMPTY_OVERVIEW = Object.freeze({ eligible: EMPTY_SECTION, linked: EMPTY_SECTION, missing: EMPTY_SECTION, unexported: EMPTY_SECTION })
export function useAdminEventInvitationOverview(eventId, active = true) {
  const { request } = useAdminAuth()
  const [state, setState] = useState({ overview: EMPTY_OVERVIEW, loading: true, error: '', resolvedKey: '' })
  const [refreshKey, setRefreshKey] = useState(0)
  const requestKey = `event-invitation-overview::${eventId}::${refreshKey}`
  useEffect(() => {
    if (!eventId || !active) return undefined
    const controller = new AbortController()
    request(`/api/admin/events/${encodeURIComponent(eventId)}/invitations`, { signal: controller.signal }).then(({ response, body }) => {
      if (!response.ok) throw new Error(body.message || 'Unable to load the private-link overview.')
      setState({ overview: { ...EMPTY_OVERVIEW, ...(body.overview || {}) }, loading: false, error: '', resolvedKey: requestKey })
    }).catch((error) => {
      if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error.message, resolvedKey: requestKey }))
    })
    return () => controller.abort()
  }, [active, eventId, request, requestKey])
  return { ...state, loading: state.loading || state.resolvedKey !== requestKey, refresh: useCallback(() => setRefreshKey((value) => value + 1), []) }
}

// State of the ONE shared workshop scanner link; the raw link itself is only
// revealed by explicit generate/copy actions.
export function useAdminEventScanner(eventId, active = true) {
  const { request } = useAdminAuth()
  const [state, setState] = useState({ scanner: null, copyable: false, loading: true, error: '', resolvedKey: '' })
  const [refreshKey, setRefreshKey] = useState(0)
  const requestKey = `event-scanner::${eventId}::${refreshKey}`
  useEffect(() => {
    if (!eventId || !active) return undefined
    const controller = new AbortController()
    request(`/api/admin/events/${encodeURIComponent(eventId)}/scanner`, { signal: controller.signal }).then(({ response, body }) => {
      if (!response.ok) throw new Error(body.message || 'Unable to load the scanner link.')
      setState({ scanner: body.access || null, copyable: Boolean(body.copyable), loading: false, error: '', resolvedKey: requestKey })
    }).catch((error) => {
      if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error.message, resolvedKey: requestKey }))
    })
    return () => controller.abort()
  }, [active, eventId, request, requestKey])
  return { ...state, loading: state.loading || state.resolvedKey !== requestKey, refresh: useCallback(() => setRefreshKey((value) => value + 1), []) }
}

export function useAdminEventAttendance({ eventId, page, limit = 50, status, active = true }) {
  const { request } = useAdminAuth()
  const [state, setState] = useState({ records: [], summary: null, pagination: { page: 1, limit, total: 0, pages: 1 }, loading: true, error: '', resolvedKey: '' })
  const [refreshKey, setRefreshKey] = useState(0)
  const query = useMemo(() => attendanceQueryString({ page, limit, status }), [limit, page, status])
  const requestKey = `event-attendance::${eventId}::${query}::${refreshKey}`
  useEffect(() => {
    if (!eventId || !active) return undefined
    const controller = new AbortController()
    request(`/api/admin/events/${encodeURIComponent(eventId)}/attendance?${query}`, { signal: controller.signal }).then(({ response, body }) => {
      if (!response.ok) throw new Error(body.message || 'Unable to load attendance.')
      setState({ records: body.data || [], summary: body.summary || null, pagination: body.pagination || { page: 1, limit, total: 0, pages: 1 }, loading: false, error: '', resolvedKey: requestKey })
    }).catch((error) => {
      if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error.message, resolvedKey: requestKey }))
    })
    return () => controller.abort()
  }, [active, eventId, limit, query, request, requestKey])
  return { ...state, loading: state.loading || state.resolvedKey !== requestKey, refresh: useCallback(() => setRefreshKey((value) => value + 1), []) }
}

export function useAdminEventActions() {
  const { request, requestRaw } = useAdminAuth()
  const mutation = useRef(null)
  const guard = (token) => {
    if (mutation.current) return false
    mutation.current = token
    return true
  }
  const release = () => { mutation.current = null }
  const post = useCallback(async (path, input, { method = 'POST' } = {}) => {
    try {
      const { response, body } = await request(path, { method, body: JSON.stringify(input) })
      return response.ok ? { ok: true, ...body } : { ok: false, status: response.status, message: body.message || 'The action could not be completed.' }
    } catch { return { ok: false, message: 'Unable to reach the administration service.' } } finally { release() }
  }, [request])
  const create = useCallback(async (payload) => {
    if (!guard('create')) return { ok: false, message: 'Another event action is still being saved.' }
    return post('/api/admin/events', payload)
  }, [post])
  const update = useCallback(async (eventId, payload) => {
    if (!guard(eventId)) return { ok: false, message: 'Another event action is still being saved.' }
    return post(`/api/admin/events/${encodeURIComponent(eventId)}`, payload, { method: 'PATCH' })
  }, [post])
  const invite = useCallback(async (eventId, input) => {
    if (!guard(`${eventId}:invite`)) return { ok: false, message: 'Another event action is still being saved.' }
    return post(`/api/admin/events/${encodeURIComponent(eventId)}/invitations`, input)
  }, [post])
  const invitationLink = useCallback(async (eventId, invitationId, action, confirm = false) => {
    if (!guard(`${eventId}:invitation-link`)) return { ok: false, message: 'Another event action is still being saved.' }
    return post(`/api/admin/events/${encodeURIComponent(eventId)}/invitations/${encodeURIComponent(invitationId)}/link`, { action, confirm })
  }, [post])
  const exportInvitations = useCallback(async (eventId, scope = 'all') => {
    if (!guard(`${eventId}:export-invitations`)) return { ok: false, message: 'Another event action is still being saved.' }
    try {
      const response = await requestRaw(`/api/admin/events/${encodeURIComponent(eventId)}/invitations/export`, {
        method: 'POST', body: JSON.stringify({ confirm: true, scope }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        return { ok: false, status: response.status, message: body.message || 'The invitation export could not be created.' }
      }
      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') || ''
      const fileName = disposition.match(/filename="([^"]+)"/i)?.[1] || 'infinity-workshop-invitations.csv'
      const href = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(href), 1000)
      return { ok: true, rowCount: Number(response.headers.get('x-export-rows') || 0) }
    } catch {
      return { ok: false, message: 'Unable to reach the administration service.' }
    } finally { release() }
  }, [requestRaw])
  const scannerAccess = useCallback(async (eventId, action, confirm = false) => {
    if (!guard(`${eventId}:scanner-action`)) return { ok: false, message: 'Another scanner action is still running.' }
    return post(`/api/admin/events/${encodeURIComponent(eventId)}/scanner`, { action, confirm })
  }, [post])
  const transition = useCallback(async (eventId, nextStatus, expectedUpdatedAt) => {
    if (!guard(`${eventId}:lifecycle`)) return { ok: false, message: 'Another event action is still being saved.' }
    return post(`/api/admin/events/${encodeURIComponent(eventId)}/lifecycle`, { nextStatus, expectedUpdatedAt })
  }, [post])
  const finalizeAttendance = useCallback(async (eventId) => {
    if (!guard(`${eventId}:attendance-finalize`)) return { ok: false, message: 'Another event action is still being saved.' }
    return post(`/api/admin/events/${encodeURIComponent(eventId)}/attendance/finalize`, { confirm: true })
  }, [post])
  return { create, update, invite, invitationLink, exportInvitations, scannerAccess, transition, finalizeAttendance }
}
