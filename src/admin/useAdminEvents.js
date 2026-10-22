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

function membersQueryString({ page, limit, search, pole, sort }) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), q: search || '', sort })
  if (pole) params.set('pole', pole)
  return params.toString()
}

function attendanceQueryString({ page, limit, status }) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (status) params.set('status', status)
  return params.toString()
}

function staffQueryString({ page, limit, search, department, sort }) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), q: search || '', sort })
  if (department) params.set('department', department)
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

export function useAdminEventMembers({ eventId, page, limit = 25, search, pole, sort, active = true }) {
  const { request } = useAdminAuth()
  const [state, setState] = useState({ members: [], facets: { poles: [] }, pagination: { page: 1, limit, total: 0, pages: 1 }, loading: true, error: '', resolvedKey: '' })
  const [refreshKey, setRefreshKey] = useState(0)
  const query = useMemo(() => membersQueryString({ page, limit, search, pole, sort }), [limit, page, pole, search, sort])
  const requestKey = `event-members::${eventId}::${query}::${refreshKey}`
  useEffect(() => {
    if (!eventId || !active) return undefined
    const controller = new AbortController()
    request(`/api/admin/events/${encodeURIComponent(eventId)}/members?${query}`, { signal: controller.signal }).then(({ response, body }) => {
      if (!response.ok) throw new Error(body.message || 'Unable to load the member list.')
      setState({ members: body.data || [], facets: body.facets || { poles: [] }, pagination: body.pagination || { page: 1, limit, total: 0, pages: 1 }, loading: false, error: '', resolvedKey: requestKey })
    }).catch((error) => {
      if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error.message, resolvedKey: requestKey }))
    })
    return () => controller.abort()
  }, [active, eventId, limit, query, request, requestKey])
  return { ...state, loading: state.loading || state.resolvedKey !== requestKey, refresh: useCallback(() => setRefreshKey((value) => value + 1), []) }
}

export function useAdminEventInvitations({ eventId, page = 1, limit = 50, active = true }) {
  const { request } = useAdminAuth()
  const [state, setState] = useState({ records: [], pagination: { page, limit, total: 0 }, loading: active, error: '' })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (!active || !eventId) return
    const controller = new AbortController()
    request(`/api/admin/events/${encodeURIComponent(eventId)}/invitations?page=${page}&limit=${limit}`, { signal: controller.signal })
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.message || 'Unable to load invited participants.')
        setState({ records: body.data || [], pagination: body.pagination, loading: false, error: '' })
      })
      .catch((error) => { if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error.message })) })
    return () => controller.abort()
  }, [active, eventId, limit, nonce, page, request])
  return { ...state, refresh: () => setNonce((value) => value + 1) }
}

export function useAdminEventOrganizers(eventId, active = true) {
  const { request } = useAdminAuth()
  const [state, setState] = useState({ organizers: [], loading: true, error: '' })
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    if (!eventId || !active) return undefined
    const controller = new AbortController()
    request(`/api/admin/events/${encodeURIComponent(eventId)}/organizers`, { signal: controller.signal }).then(({ response, body }) => {
      if (!response.ok) throw new Error(body.message || 'Unable to load the organizers.')
      setState({ organizers: body.data || [], loading: false, error: '' })
    }).catch((error) => {
      if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error.message }))
    })
    return () => controller.abort()
  }, [active, eventId, refreshKey, request])
  return { ...state, refresh: useCallback(() => setRefreshKey((value) => value + 1), []) }
}

export function useAdminEventStaff({ eventId, page = 1, limit = 50, search, department, sort = 'name_asc', active = true }) {
  const { request } = useAdminAuth()
  const [state, setState] = useState({ records: [], pagination: { page: 1, limit, total: 0, pages: 1 }, loading: true, error: '', resolvedKey: '' })
  const [refreshKey, setRefreshKey] = useState(0)
  const query = useMemo(() => staffQueryString({ page, limit, search, department, sort }), [department, limit, page, search, sort])
  const requestKey = `event-staff::${eventId}::${query}::${refreshKey}`
  useEffect(() => {
    if (!eventId || !active) return undefined
    const controller = new AbortController()
    request(`/api/admin/events/${encodeURIComponent(eventId)}/staff?${query}`, { signal: controller.signal }).then(({ response, body }) => {
      if (!response.ok) throw new Error(body.message || 'Unable to load eligible staff.')
      setState({ records: body.data || [], pagination: body.pagination || { page: 1, limit, total: 0, pages: 1 }, loading: false, error: '', resolvedKey: requestKey })
    }).catch((error) => {
      if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error.message, resolvedKey: requestKey }))
    })
    return () => controller.abort()
  }, [active, eventId, limit, query, request, requestKey])
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
  const assignOrganizers = useCallback(async (eventId, staffProfileIds) => {
    if (!guard(`${eventId}:organizers`)) return { ok: false, message: 'Another event action is still being saved.' }
    return post(`/api/admin/events/${encodeURIComponent(eventId)}/organizers`, { staffProfileIds })
  }, [post])
  const removeOrganizer = useCallback(async (eventId, staffProfileId) => {
    if (!guard(`${eventId}:remove-organizer`)) return { ok: false, message: 'Another event action is still being saved.' }
    return post(`/api/admin/events/${encodeURIComponent(eventId)}/organizers/remove`, { staffProfileId })
  }, [post])
  const setScannerAccess = useCallback(async (eventId, staffProfileId, enabled) => {
    if (!guard(`${eventId}:scanner`)) return { ok: false, message: 'Another event action is still being saved.' }
    return post(`/api/admin/events/${encodeURIComponent(eventId)}/scanner-access`, { staffProfileId, enabled })
  }, [post])
  const invitationLink = useCallback(async (eventId, invitationId, action, confirm = false) => {
    if (!guard(`${eventId}:invitation-link`)) return { ok: false, message: 'Another event action is still being saved.' }
    return post(`/api/admin/events/${encodeURIComponent(eventId)}/invitations/${encodeURIComponent(invitationId)}/link`, { action, confirm })
  }, [post])
  const exportInvitations = useCallback(async (eventId) => {
    if (!guard(`${eventId}:export-invitations`)) return { ok: false, message: 'Another event action is still being saved.' }
    try {
      const response = await requestRaw(`/api/admin/events/${encodeURIComponent(eventId)}/invitations/export`, {
        method: 'POST', body: JSON.stringify({ confirm: true }),
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
  const scannerCredential = useCallback(async (eventId, eventOrganizerId, action) => {
    if (!guard(`${eventId}:scanner-credential`)) return { ok: false, message: 'Another event action is still being saved.' }
    return post(`/api/admin/events/${encodeURIComponent(eventId)}/scanner-credentials`, { eventOrganizerId, action })
  }, [post])
  const transition = useCallback(async (eventId, nextStatus, expectedUpdatedAt) => {
    if (!guard(`${eventId}:lifecycle`)) return { ok: false, message: 'Another event action is still being saved.' }
    return post(`/api/admin/events/${encodeURIComponent(eventId)}/lifecycle`, { nextStatus, expectedUpdatedAt })
  }, [post])
  const finalizeAttendance = useCallback(async (eventId) => {
    if (!guard(`${eventId}:attendance-finalize`)) return { ok: false, message: 'Another event action is still being saved.' }
    return post(`/api/admin/events/${encodeURIComponent(eventId)}/attendance/finalize`, { confirm: true })
  }, [post])
  return { create, update, invite, assignOrganizers, removeOrganizer, setScannerAccess, invitationLink, exportInvitations, scannerCredential, transition, finalizeAttendance }
}
