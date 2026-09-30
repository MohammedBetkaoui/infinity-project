import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createSubmissionId } from '../../shared/aivex/contract-v4.js'
import { uploadToSignedStorage } from '../lib/directStorageUpload'
import { useAdminAuth } from './AdminAuth'
import { createListCache } from './adminListCache.js'

// Every list request re-evaluates the whole edition's case overview in the
// database, and aborting a request in the browser does not stop that work on
// the server. So a search is sent only once typing pauses, and a list page
// shown less than a minute ago (typically when coming back from a team file)
// is reused instead of asked again. Any AIVEX change made from this tab and
// the Refresh button empty the cache.
const SEARCH_DEBOUNCE_MS = 350
const LIST_CACHE_TTL_MS = 60 * 1000
const listCache = createListCache({ ttlMs: LIST_CACHE_TTL_MS })
const acceptedStudentListCache = createListCache({ ttlMs: LIST_CACHE_TTL_MS })
const clearListCache = () => {
  listCache.clear()
  acceptedStudentListCache.clear()
}

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
const GENDER_KEYS = Object.freeze({ Male: 'male', Female: 'female' })

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
    gender: GENDER_KEYS[filters.gender] || filters.gender,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
  }
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value)
  for (const [key, value] of [...params.entries()]) if (!value) params.delete(key)
  return params.toString()
}

function acceptedStudentQueryString({ page, limit, search, filters, sort }) {
  const params = new URLSearchParams({
    page: String(page), limit: String(limit), edition: String(filters.edition || 2),
    q: search || '', sort,
  })
  const values = {
    gender: GENDER_KEYS[filters.gender] || filters.gender,
    wilaya: wilayaCode(filters.wilaya),
    institution: filters.institution,
    bacYear: filters.bacYear,
  }
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value)
  for (const [key, value] of [...params.entries()]) if (!value) params.delete(key)
  return params.toString()
}

export function useAdminAivexExport() {
  const { requestRaw } = useAdminAuth()
  const [exporting, setExporting] = useState(false)

  const exportCsv = useCallback(async ({ search, filters, sort }) => {
    if (exporting) return { ok: false, message: 'An export is already being prepared.' }
    setExporting(true)
    try {
      const query = queryString({ page: 1, limit: 50, search, filters, sort })
      const response = await requestRaw(`/api/admin/aivex/export?${query}`)
      if (!response.ok) {
        let message = 'Unable to export the filtered AIVEX registrations.'
        try { message = (await response.json()).message || message } catch { /* Keep the safe fallback. */ }
        return { ok: false, message }
      }
      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') || ''
      const fileName = /filename="([^"\r\n]+)"/i.exec(disposition)?.[1] || 'aivex-edition-02-filtered.csv'
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      return {
        ok: true,
        rows: Number(response.headers.get('x-aivex-export-rows') || 0),
        truncated: response.headers.get('x-aivex-export-truncated') === 'true',
      }
    } catch {
      return { ok: false, message: 'Unable to reach the AIVEX export service.' }
    } finally {
      setExporting(false)
    }
  }, [exporting, requestRaw])

  return { exporting, exportCsv }
}

export function useAdminAivexAcceptedStudentsExport() {
  const { requestRaw } = useAdminAuth()
  const [exporting, setExporting] = useState(false)

  const exportCsv = useCallback(async ({ search, filters, sort }) => {
    if (exporting) return { ok: false, message: 'An export is already being prepared.' }
    setExporting(true)
    try {
      const query = acceptedStudentQueryString({ page: 1, limit: 50, search, filters, sort })
      const response = await requestRaw(`/api/admin/aivex/students/export?${query}`)
      if (!response.ok) {
        let message = 'Unable to export the filtered accepted students.'
        try { message = (await response.json()).message || message } catch { /* Keep the safe fallback. */ }
        return { ok: false, message }
      }
      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition') || ''
      const fileName = /filename="([^"\r\n]+)"/i.exec(disposition)?.[1] || 'aivex-edition-02-accepted-students.csv'
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      return {
        ok: true,
        rows: Number(response.headers.get('x-aivex-export-rows') || 0),
        truncated: response.headers.get('x-aivex-export-truncated') === 'true',
      }
    } catch {
      return { ok: false, message: 'Unable to reach the accepted-student export service.' }
    } finally {
      setExporting(false)
    }
  }, [exporting, requestRaw])

  return { exporting, exportCsv }
}

const listValue = (body, limit) => ({
  records: body.data || [],
  pagination: body.pagination || { page: 1, limit, total: 0, pages: 1 },
  summary: body.summary || { documentCounts: {} },
  facets: body.facets || { wilayas: [], institutions: [] },
})

export function useAdminAivex({ page, limit = 12, search, filters, sort, enabled = true }) {
  const { request } = useAdminAuth()
  const [refreshKey, setRefreshKey] = useState(0)
  const query = useMemo(() => queryString({ page, limit, search, filters, sort }), [filters, limit, page, search, sort])
  const requestKey = `${query}::${refreshKey}`
  const [state, setState] = useState(() => {
    const cached = listCache.get(query)
    return cached
      ? { ...cached, loading: false, error: '', resolvedKey: requestKey }
      : {
          records: [], pagination: { page: 1, limit, total: 0, pages: 1 },
          summary: { documentCounts: {} }, facets: { wilayas: [], institutions: [] },
          loading: true, error: '', resolvedKey: '',
        }
  })
  const lastSearch = useRef(search)

  useEffect(() => {
    if (!enabled) return undefined
    const searchChanged = search !== lastSearch.current
    lastSearch.current = search

    const cached = listCache.get(query)
    if (cached) {
      let active = true
      Promise.resolve().then(() => {
        if (active) setState((current) => (current.resolvedKey === requestKey ? current : { ...cached, loading: false, error: '', resolvedKey: requestKey }))
      })
      return () => { active = false }
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      request(`/api/admin/aivex?${query}`, { signal: controller.signal })
        .then(({ response, body }) => {
          if (!response.ok) throw new Error(body.message || 'Unable to load AIVEX files.')
          const value = listValue(body, limit)
          listCache.set(query, value)
          setState({ ...value, loading: false, error: '', resolvedKey: requestKey })
        })
        .catch((error) => {
          if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error.message, resolvedKey: requestKey }))
        })
    }, searchChanged && search ? SEARCH_DEBOUNCE_MS : 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, limit, query, request, requestKey, search])

  const refresh = useCallback(() => {
    clearListCache()
    setRefreshKey((value) => value + 1)
  }, [])
  return { ...state, loading: enabled && (state.loading || state.resolvedKey !== requestKey), refresh }
}

const acceptedStudentListValue = (body, limit) => ({
  records: body.data || [],
  pagination: body.pagination || { page: 1, limit, total: 0, pages: 1 },
  summary: body.summary || { total: 0, female: 0, male: 0, unknown: 0, teams: 0 },
  facets: body.facets || { wilayas: [], institutions: [], bacYears: [] },
  canExport: body.canExport === true,
})

export function useAdminAivexAcceptedStudents({ page, limit = 20, search, filters, sort, enabled = false }) {
  const { request } = useAdminAuth()
  const [refreshKey, setRefreshKey] = useState(0)
  const query = useMemo(
    () => acceptedStudentQueryString({ page, limit, search, filters, sort }),
    [filters, limit, page, search, sort],
  )
  const requestKey = `${query}::${refreshKey}`
  const [state, setState] = useState(() => ({
    records: [], pagination: { page: 1, limit, total: 0, pages: 1 },
    summary: { total: 0, female: 0, male: 0, unknown: 0, teams: 0 },
    facets: { wilayas: [], institutions: [], bacYears: [] }, canExport: false,
    loading: true, error: '', resolvedKey: '',
  }))
  const lastSearch = useRef(search)

  useEffect(() => {
    if (!enabled) return undefined
    const searchChanged = search !== lastSearch.current
    lastSearch.current = search
    const cached = acceptedStudentListCache.get(query)
    if (cached) {
      let active = true
      Promise.resolve().then(() => {
        if (active) setState((current) => (current.resolvedKey === requestKey
          ? current
          : { ...cached, loading: false, error: '', resolvedKey: requestKey }))
      })
      return () => { active = false }
    }

    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      request(`/api/admin/aivex/students?${query}`, { signal: controller.signal })
        .then(({ response, body }) => {
          if (!response.ok) throw new Error(body.message || 'Unable to load accepted students.')
          const value = acceptedStudentListValue(body, limit)
          acceptedStudentListCache.set(query, value)
          setState({ ...value, loading: false, error: '', resolvedKey: requestKey })
        })
        .catch((error) => {
          if (error.name !== 'AbortError') {
            setState((current) => ({ ...current, loading: false, error: error.message, resolvedKey: requestKey }))
          }
        })
    }, searchChanged && search ? SEARCH_DEBOUNCE_MS : 0)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, limit, query, request, requestKey, search])

  const refresh = useCallback(() => {
    acceptedStudentListCache.clear()
    setState((current) => ({ ...current, loading: true, error: '' }))
    setRefreshKey((value) => value + 1)
  }, [])

  return { ...state, loading: enabled && (state.loading || state.resolvedKey !== requestKey), refresh }
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
      clearListCache()
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

  const uploadIdentityReplacement = useCallback(async (reference, documentKey, expectedUpdatedAt, file, onProgress) => {
    const uploadId = createSubmissionId()
    onProgress?.('preparing', 0)
    const initialized = await request(`/api/admin/aivex/${encodeURIComponent(reference)}/identity-upload/init`, {
      method: 'POST',
      body: JSON.stringify({
        uploadId, documentKey, expectedUpdatedAt,
        file: { name: file.name, mime: file.type, size: file.size },
      }),
    })
    if (!initialized.response.ok) throw Object.assign(new Error(initialized.body.message || 'The secure upload could not be prepared.'), { code: initialized.body.status })

    onProgress?.('uploading', 0)
    if (!initialized.body.upload?.alreadyUploaded) {
      await uploadToSignedStorage({
        signedUrl: initialized.body.upload?.signedUrl,
        file,
        onProgress: (loaded, total) => onProgress?.('uploading', total ? Math.min(99, Math.round(loaded / total * 100)) : 0),
      })
    }
    onProgress?.('validating', 100)
    const finalized = await request(`/api/admin/aivex/${encodeURIComponent(reference)}/identity-upload/finalize`, {
      method: 'POST', body: JSON.stringify({ uploadSessionId: initialized.body.uploadSessionId }),
    })
    if (!finalized.response.ok) throw Object.assign(new Error(finalized.body.message || 'The replacement failed secure server validation.'), { code: finalized.body.status })
    clearListCache()
    return finalized.body.team
  }, [request])

  const purgeAll = useCallback(async (password) => {
    if (mutation.current) return { ok: false, message: 'Another AIVEX action is still being saved.' }
    mutation.current = 'purge-all'
    try {
      const { response, body } = await request('/api/admin/aivex/purge', {
        method: 'POST',
        body: JSON.stringify({ password, confirmation: 'delete_all_aivex_files' }),
      })
      // Even a partial failure (Storage cleanup) may already have removed rows.
      clearListCache()
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          message: body.message || 'The AIVEX files could not be deleted.',
          reference: typeof body.reference === 'string' ? body.reference : '',
        }
      }
      return { ok: true, deletedRegistrations: Number(body.deletedRegistrations || 0) }
    } catch {
      return { ok: false, message: 'Unable to reach the AIVEX administration service.' }
    } finally {
      mutation.current = null
    }
  }, [request])

  return { loadDetail, act, loadDocument, uploadIdentityReplacement, purgeAll }
}

const emptyAttendanceSummary = () => ({ accepted: 0, present: 0, absent: 0, expected: 0 })
const summarizeAttendance = (teams) => teams.reduce((summary, team) => {
  summary.accepted += 1
  if (Object.hasOwn(summary, team.status)) summary[team.status] += 1
  return summary
}, emptyAttendanceSummary())

export function useAdminAivexAttendance({ edition = 2, enabled = false } = {}) {
  const { request } = useAdminAuth()
  const [refreshKey, setRefreshKey] = useState(0)
  const loadedRequestKey = useRef('')
  const [state, setState] = useState({
    teams: [], summary: emptyAttendanceSummary(), canManage: false,
    loading: true, error: '', updating: '',
  })

  useEffect(() => {
    if (!enabled) return undefined
    const requestKey = `${edition}:${refreshKey}`
    if (loadedRequestKey.current === requestKey) return undefined
    const controller = new AbortController()
    request(`/api/admin/aivex/attendance?edition=${edition}`, { signal: controller.signal })
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body.message || 'Unable to load team attendance.')
        setState({
          teams: Array.isArray(body.teams) ? body.teams : [],
          summary: body.summary || emptyAttendanceSummary(),
          canManage: body.canManage === true,
          loading: false, error: '', updating: '',
        })
        loadedRequestKey.current = requestKey
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setState((current) => ({ ...current, loading: false, error: error.message }))
      })
    return () => controller.abort()
  }, [edition, enabled, refreshKey, request])

  const updateAttendance = useCallback(async (team, status) => {
    if (!state.canManage || state.updating) return { ok: false }
    setState((current) => ({ ...current, updating: team.reference, error: '' }))
    try {
      const { response, body } = await request('/api/admin/aivex/attendance', {
        method: 'POST',
        body: JSON.stringify({
          reference: team.reference,
          status,
          expectedUpdatedAt: team.updatedAt,
        }),
      })
      if (!response.ok) return { ok: false, status: response.status, message: body.message || 'Attendance could not be updated.' }
      setState((current) => {
        const teams = current.teams.map((entry) => entry.reference === body.team.reference ? body.team : entry)
        return { ...current, teams, summary: summarizeAttendance(teams), updating: '' }
      })
      return { ok: true, team: body.team }
    } catch {
      return { ok: false, message: 'Unable to reach the AIVEX administration service.' }
    } finally {
      setState((current) => ({ ...current, updating: '' }))
    }
  }, [request, state.canManage, state.updating])

  const refresh = useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: '' }))
    setRefreshKey((value) => value + 1)
  }, [])

  return {
    ...state,
    refresh,
    updateAttendance,
  }
}
