import { useCallback, useEffect, useRef, useState } from 'react'
import { useAdminAuth } from './AdminAuth'

const ENDPOINT = '/api/admin/aivex/settings'

export function useAdminAivexCampaignSettings() {
  const { request } = useAdminAuth()
  const mutation = useRef(false)
  const [state, setState] = useState({ settings: null, loading: true, saving: false, error: '' })

  const load = useCallback(async (signal) => {
    try {
      const { response, body } = await request(ENDPOINT, { signal })
      if (!response.ok || !body.settings) throw new Error(body.message || 'Unable to load AIVEX campaign settings.')
      setState((current) => ({ ...current, settings: body.settings, loading: false, error: '' }))
      return body.settings
    } catch (error) {
      if (error.name !== 'AbortError') {
        setState((current) => ({ ...current, loading: false, error: error.message || 'Unable to load AIVEX campaign settings.' }))
      }
      return null
    }
  }, [request])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const refresh = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: '' }))
    return load()
  }, [load])

  const update = useCallback(async (input) => {
    if (mutation.current) return { ok: false, message: 'Another campaign update is still being saved.' }
    mutation.current = true
    setState((current) => ({ ...current, saving: true, error: '' }))
    try {
      const { response, body } = await request(ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(input),
      })
      if (!response.ok || !body.settings) {
        return { ok: false, field: body.field, message: body.message || 'Unable to update the AIVEX campaign.' }
      }
      setState((current) => ({ ...current, settings: body.settings, saving: false, error: '' }))
      const authoritative = await load()
      return { ok: true, settings: authoritative || body.settings }
    } catch {
      return { ok: false, message: 'Unable to reach the administration service.' }
    } finally {
      mutation.current = false
      setState((current) => ({ ...current, saving: false }))
    }
  }, [load, request])

  return { ...state, refresh, update }
}
