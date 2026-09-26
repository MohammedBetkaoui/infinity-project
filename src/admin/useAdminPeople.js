import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAdminAuth } from './AdminAuth'

const STATUS_KEYS = Object.freeze({ Active: 'active', 'On pause': 'on_pause', Inactive: 'inactive', Alumni: 'alumni', Archived: 'archived' })
const AVAILABILITY_KEYS = Object.freeze({ 'A few hours each week': 'weekly', 'Mostly around events and projects': 'events', 'Variable during the semester': 'flexible' })
const DEPARTMENT_KEYS = Object.freeze({ 'Dev / Tech': 'dev-tech', 'Design / Content Creation': 'design-content', 'Management / Logistics': 'management-logistics' })
const normalizeLevel = (value) => value === 'Other' ? 'other' : value

function queryString({ page, limit, search, filters, sort }) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit), q: search || '', sort })
  const values = {
    status: STATUS_KEYS[filters.status] || filters.status, studyYear: normalizeLevel(filters.level),
    speciality: filters.speciality, structure: DEPARTMENT_KEYS[filters.structure] || filters.structure,
    availability: AVAILABILITY_KEYS[filters.availability] || filters.availability,
    dateFrom: filters.dateFrom, dateTo: filters.dateTo,
  }
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value)
  for (const [key, value] of [...params.entries()]) if (!value) params.delete(key)
  return params.toString()
}

export function useAdminPeople({ kind, page, limit = 12, search, filters, sort }) {
  const { request } = useAdminAuth()
  const [state, setState] = useState({ records: [], pagination: { page: 1, limit, total: 0, pages: 1 }, counts: {}, facets: { specialities: [], structures: [] }, loading: true, error: '', resolvedKey: '' })
  const [refreshKey, setRefreshKey] = useState(0)
  const query = useMemo(() => queryString({ page, limit, search, filters, sort }), [filters, limit, page, search, sort])
  const requestKey = `${kind}::${query}::${refreshKey}`
  useEffect(() => {
    const controller = new AbortController()
    request(`/api/admin/${kind}?${query}`, { signal: controller.signal }).then(({ response, body }) => {
      if (!response.ok) throw new Error(body.message || `Unable to load ${kind}.`)
      setState({ records: body.data || [], pagination: body.pagination || { page: 1, limit, total: 0, pages: 1 }, counts: body.counts || {}, facets: body.facets || { specialities: [], structures: [] }, loading: false, error: '', resolvedKey: requestKey })
    }).catch((error) => {
      if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error.message, resolvedKey: requestKey }))
    })
    return () => controller.abort()
  }, [kind, limit, query, request, requestKey])
  return { ...state, loading: state.loading || state.resolvedKey !== requestKey, refresh: useCallback(() => setRefreshKey((value) => value + 1), []) }
}

export function useAdminPeopleActions(kind) {
  const { request } = useAdminAuth()
  const mutation = useRef(null)
  const loadDetail = useCallback(async (id) => {
    const { response, body } = await request(`/api/admin/${kind}/${encodeURIComponent(id)}`)
    if (!response.ok) throw new Error(body.message || 'Unable to open this profile.')
    return body.profile
  }, [kind, request])
  const act = useCallback(async (id, input) => {
    if (mutation.current) return { ok: false, message: 'Another profile action is still being saved.' }
    mutation.current = id
    try {
      const { response, body } = await request(`/api/admin/${kind}/${encodeURIComponent(id)}/actions`, { method: 'POST', body: JSON.stringify(input) })
      return response.ok ? { ok: true, profile: body.profile } : { ok: false, status: response.status, message: body.message || 'The action could not be completed.' }
    } catch { return { ok: false, message: 'Unable to reach the administration service.' } } finally { mutation.current = null }
  }, [kind, request])
  const create = useCallback(async (input) => {
    if (mutation.current) return { ok: false, message: 'Another profile action is still being saved.' }
    mutation.current = 'create'
    try {
      const { response, body } = await request(`/api/admin/${kind}`, { method: 'POST', body: JSON.stringify(input) })
      return response.ok ? { ok: true, profile: body.profile } : { ok: false, status: response.status, message: body.message || 'The profile could not be created.' }
    } catch { return { ok: false, message: 'Unable to reach the administration service.' } } finally { mutation.current = null }
  }, [kind, request])
  const bulk = useCallback(async (input) => {
    if (mutation.current) return { ok: false, message: 'Another profile action is still being saved.' }
    mutation.current = 'bulk'
    try {
      const { response, body } = await request(`/api/admin/${kind}/bulk-actions`, { method: 'POST', body: JSON.stringify(input) })
      return response.ok ? { ok: true, succeeded: body.succeeded || [], failed: body.failed || [] } : { ok: false, status: response.status, message: body.message || 'The bulk action could not be completed.' }
    } catch { return { ok: false, message: 'Unable to reach the administration service.' } } finally { mutation.current = null }
  }, [kind, request])
  return { loadDetail, act, create, bulk }
}
