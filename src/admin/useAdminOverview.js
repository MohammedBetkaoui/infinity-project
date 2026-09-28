import { useCallback, useEffect, useState } from 'react'
import { useAdminAuth } from './AdminAuth'

export function useAdminOverview() {
  const { request } = useAdminAuth()
  const [refreshKey, setRefreshKey] = useState(0)
  const [state, setState] = useState({ dashboard: null, loading: true, error: '' })

  useEffect(() => {
    const controller = new AbortController()
    request('/api/admin/overview', { signal: controller.signal })
      .then(({ response, body }) => {
        if (!response.ok || !body.dashboard) {
          throw new Error(body.message || 'Unable to load the administrative overview.')
        }
        setState({ dashboard: body.dashboard, loading: false, error: '' })
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setState((current) => ({ ...current, loading: false, error: error.message }))
        }
      })
    return () => controller.abort()
  }, [refreshKey, request])

  const refresh = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: '' }))
    setRefreshKey((value) => value + 1)
  }, [])
  return { ...state, refresh }
}
