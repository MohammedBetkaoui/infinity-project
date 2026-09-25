import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAdminAuth } from './AdminAuth'

const STATUS_KEYS = Object.freeze({
  New: 'new',
  'In review': 'in_review',
  Interview: 'interview',
  Accepted: 'accepted',
  Declined: 'declined',
  Archived: 'archived',
})
const TYPE_KEYS = Object.freeze({ Member: 'member', Staff: 'staff' })
const EXPERIENCE_KEYS = Object.freeze({
  'Starting out': 'starting',
  'Already learning': 'learning',
  'Building projects': 'building',
})
const AVAILABILITY_KEYS = Object.freeze({
  'A few hours each week': 'weekly',
  'Mostly around events and projects': 'events',
  'Variable during the semester': 'flexible',
})

const normalizeLevel = (value) => value === 'Other' ? 'other' : value

function queryString({ page, limit, status, search, filters, sort }) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    status: STATUS_KEYS[status] || status || '',
    q: search || '',
    sort,
  })
  const values = {
    type: TYPE_KEYS[filters.type] || filters.type,
    studyYear: normalizeLevel(filters.level),
    speciality: filters.speciality,
    track: filters.track,
    experience: EXPERIENCE_KEYS[filters.experience] || filters.experience,
    availability: AVAILABILITY_KEYS[filters.availability] || filters.availability,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  }
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value)
  for (const [key, value] of [...params.entries()]) if (!value) params.delete(key)
  return params.toString()
}

export function useAdminApplications({ page, limit = 12, status, search, filters, sort }) {
  const { request } = useAdminAuth()
  const [state, setState] = useState({
    records: [],
    pagination: { page: 1, limit, total: 0, pages: 1 },
    counts: {},
    facets: { specialities: [] },
    loading: true,
    error: '',
    resolvedKey: '',
  })
  const [refreshKey, setRefreshKey] = useState(0)
  const query = useMemo(() => queryString({ page, limit, status, search, filters, sort }), [filters, limit, page, search, sort, status])
  const requestKey = `${query}::${refreshKey}`

  useEffect(() => {
    const controller = new AbortController()
    request(`/api/admin/applications?${query}`, { signal: controller.signal })
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.message || 'Unable to load Join applications.')
        setState({
          records: body.data || [],
          pagination: body.pagination || { page: 1, limit, total: 0, pages: 1 },
          counts: body.counts || {},
          facets: body.facets || { specialities: [] },
          loading: false,
          error: '',
          resolvedKey: requestKey,
        })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error.message, resolvedKey: requestKey }))
      })
    return () => controller.abort()
  }, [limit, query, request, requestKey])

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), [])
  return { ...state, loading: state.loading || state.resolvedKey !== requestKey, refresh }
}

export function useAdminApplicationActions() {
  const { request } = useAdminAuth()
  const mutation = useRef(null)

  const loadDetail = useCallback(async (applicationId) => {
    const { response, body } = await request(`/api/admin/applications/${encodeURIComponent(applicationId)}`)
    if (!response.ok) throw new Error(body.message || 'Unable to open this application.')
    return body.application
  }, [request])

  const act = useCallback(async (applicationId, input) => {
    if (mutation.current) return { ok: false, message: 'Another application action is still being saved.' }
    mutation.current = applicationId
    try {
      const { response, body } = await request(`/api/admin/applications/${encodeURIComponent(applicationId)}/actions`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
      if (!response.ok) return { ok: false, status: response.status, message: body.message || 'The action could not be completed.' }
      return { ok: true, application: body.application }
    } catch {
      return { ok: false, message: 'Unable to reach the administration service.' }
    } finally {
      mutation.current = null
    }
  }, [request])

  const bulk = useCallback(async (input) => {
    if (mutation.current) return { ok: false, message: 'Another application action is still being saved.' }
    mutation.current = 'bulk'
    try {
      const { response, body } = await request('/api/admin/applications/bulk-actions', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      if (!response.ok) return { ok: false, status: response.status, message: body.message || 'The bulk action could not be completed.' }
      return { ok: true, succeeded: body.succeeded || [], failed: body.failed || [] }
    } catch {
      return { ok: false, message: 'Unable to reach the administration service.' }
    } finally {
      mutation.current = null
    }
  }, [request])

  return { loadDetail, act, bulk }
}
