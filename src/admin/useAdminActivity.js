import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAdminAuth } from './AdminAuth'

function queryString({ page, limit, search, filters, sort }) {
  const params = new URLSearchParams({
    page: String(page), limit: String(limit), q: search || '', sort,
  })
  for (const key of ['actor', 'objectType', 'action', 'sensitivity', 'dateFrom', 'dateTo']) {
    if (filters[key]) params.set(key, filters[key])
  }
  for (const [key, value] of [...params.entries()]) if (!value) params.delete(key)
  return params.toString()
}

export function useAdminActivity({ page, limit = 12, search, filters, sort }) {
  const { request } = useAdminAuth()
  const [refreshKey, setRefreshKey] = useState(0)
  const [state, setState] = useState({
    records: [],
    pagination: { page: 1, limit, total: 0, pages: 1 },
    summary: { recordedActions: 0, confidentialEvents: 0, administrators: 0 },
    facets: { actors: [], actions: [], objectTypes: [] },
    generatedAt: null,
    loading: true,
    error: '',
    resolvedKey: '',
  })
  const query = useMemo(
    () => queryString({ page, limit, search, filters, sort }),
    [filters, limit, page, search, sort],
  )
  const requestKey = `${query}::${refreshKey}`

  useEffect(() => {
    const controller = new AbortController()
    request(`/api/admin/activity?${query}`, { signal: controller.signal })
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.message || 'Unable to load the activity log.')
        setState({
          records: body.data || [],
          pagination: body.pagination || { page: 1, limit, total: 0, pages: 1 },
          summary: body.summary || { recordedActions: 0, confidentialEvents: 0, administrators: 0 },
          facets: body.facets || { actors: [], actions: [], objectTypes: [] },
          generatedAt: body.generatedAt || null,
          loading: false,
          error: '',
          resolvedKey: requestKey,
        })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setState((current) => ({ ...current, loading: false, error: error.message, resolvedKey: requestKey }))
        }
      })
    return () => controller.abort()
  }, [limit, query, request, requestKey])

  return {
    ...state,
    loading: state.loading || state.resolvedKey !== requestKey,
    refresh: useCallback(() => setRefreshKey((value) => value + 1), []),
  }
}
