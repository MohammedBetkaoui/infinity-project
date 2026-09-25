import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAdminAuth } from './AdminAuth'

const REGISTRATION_KEYS = Object.freeze({
  Submitted: 'submitted', 'Under review': 'under_review', Approved: 'approved',
  Rejected: 'rejected', Cancelled: 'cancelled',
})
const DOCUMENT_KEYS = Object.freeze({
  'Not generated': 'not_generated', Generating: 'generating', 'Awaiting signature': 'awaiting_signature',
  'Signed document received': 'signed_document_uploaded', 'Under review': 'under_review',
  'Corrections needed': 'changes_required', Validated: 'validated',
  'Generation issue': 'generation_failed', Expired: 'expired',
})
const COMPLETENESS_KEYS = Object.freeze({ Complete: 'complete', Incomplete: 'incomplete' })
const PRESENCE_KEYS = Object.freeze({ Present: 'present', Absent: 'absent' })

const wilayaCode = (value) => /^\d{2}\s*·/.test(value || '') ? value.slice(0, 2) : value

function queryString({ page, limit, search, filters, sort }) {
  const params = new URLSearchParams({
    page: String(page), limit: String(limit), edition: String(filters.edition || 2),
    q: search || '', sort,
  })
  const values = {
    registration: REGISTRATION_KEYS[filters.registration] || filters.registration,
    document: DOCUMENT_KEYS[filters.document] || filters.document,
    wilaya: wilayaCode(filters.wilaya),
    institution: filters.institution,
    complete: COMPLETENESS_KEYS[filters.complete] || filters.complete,
    signed: PRESENCE_KEYS[filters.signedLabel] || filters.signedLabel,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  }
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value)
  for (const [key, value] of [...params.entries()]) if (!value) params.delete(key)
  return params.toString()
}

export function useAdminAivex({ page, limit = 12, search, filters, sort }) {
  const { request } = useAdminAuth()
  const [state, setState] = useState({
    records: [], pagination: { page: 1, limit, total: 0, pages: 1 },
    summary: { documentCounts: {} }, facets: { wilayas: [], institutions: [] },
    loading: true, error: '', resolvedKey: '',
  })
  const [refreshKey, setRefreshKey] = useState(0)
  const query = useMemo(() => queryString({ page, limit, search, filters, sort }), [filters, limit, page, search, sort])
  const requestKey = `${query}::${refreshKey}`

  useEffect(() => {
    const controller = new AbortController()
    request(`/api/admin/aivex?${query}`, { signal: controller.signal })
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.message || 'Unable to load AIVEX files.')
        setState({
          records: body.data || [],
          pagination: body.pagination || { page: 1, limit, total: 0, pages: 1 },
          summary: body.summary || { documentCounts: {} },
          facets: body.facets || { wilayas: [], institutions: [] },
          loading: false, error: '', resolvedKey: requestKey,
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

export function useAdminAivexActions() {
  const { request, requestRaw } = useAdminAuth()
  const mutation = useRef(null)

  const loadDetail = useCallback(async (reference) => {
    const { response, body } = await request(`/api/admin/aivex/${encodeURIComponent(reference)}`)
    if (!response.ok) throw new Error(body.message || 'Unable to open this AIVEX file.')
    return body.team
  }, [request])

  const act = useCallback(async (reference, input) => {
    if (mutation.current) return { ok: false, message: 'Another AIVEX action is still being saved.' }
    mutation.current = reference
    try {
      const { response, body } = await request(`/api/admin/aivex/${encodeURIComponent(reference)}/actions`, {
        method: 'POST', body: JSON.stringify(input),
      })
      if (!response.ok) return { ok: false, status: response.status, message: body.message || 'The action could not be completed.' }
      return { ok: true, team: body.team }
    } catch {
      return { ok: false, message: 'Unable to reach the AIVEX administration service.' }
    } finally {
      mutation.current = null
    }
  }, [request])

  const loadDocument = useCallback(async (reference, documentKey) => {
    const response = await requestRaw(`/api/admin/aivex/${encodeURIComponent(reference)}/documents/${encodeURIComponent(documentKey)}/content`)
    if (!response.ok) {
      let message = 'Unable to open this secure document.'
      try { message = (await response.json()).message || message } catch { /* Generic message stays safe. */ }
      throw new Error(message)
    }
    return {
      blob: await response.blob(),
      mimeType: response.headers.get('content-type') || 'application/octet-stream',
    }
  }, [requestRaw])

  return { loadDetail, act, loadDocument }
}
