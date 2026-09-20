import { useEffect, useState } from 'react'
import { createSubmissionId } from '../../../../shared/aivex/contract-v4.js'
import { signedDocumentFileIssue } from '../../../../shared/aivex/signed-document-policy.js'

// AIVEX candidate status page (Magic Link, Phase 5A/5B) — data layer.
//
// The token is read once from the URL, on mount, into React state used only
// to drive the fetch calls below — never rendered, never written to
// localStorage or sessionStorage. Closing the tab loses it from memory
// exactly as intended: the candidate still has it in the Magic Link URL
// itself (their inbox, a bookmark...), which is the only place it is meant
// to persist.
const VERIFY_ENDPOINT = '/api/aivex/magic-link/verify'
const DOCUMENT_ENDPOINT = '/api/aivex/magic-link/document'
const UPLOAD_ENDPOINT = '/api/aivex/magic-link/upload'
const REQUEST_TIMEOUT_MS = 12000
// A 10 MB file over a slow mobile connection needs far more headroom than
// the short JSON calls above.
const UPLOAD_TIMEOUT_MS = REQUEST_TIMEOUT_MS * 10

const KNOWN_FAILURES = new Set(['invalid', 'expired', 'revoked', 'registration_not_found'])

function readTokenFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('token') || ''
  } catch {
    return ''
  }
}

const BLANK_UPLOAD = { file: null, uploadId: null, issue: '', status: 'idle', message: '', progress: 0 }

// A direct load of /aivex/status?token=... (bookmark, reopened link, page
// refresh) is the only entry point this page supports on purpose: it never
// reads React state from the registration page, so it works identically
// whether the tab has been open for a week or was just opened from a link.
export default function useAivexStatus() {
  // Lazy initializer: readTokenFromUrl() runs exactly once, on the first
  // render, never again — the token cannot change without a full reload of
  // this page, so there is nothing to keep it in sync with afterwards.
  const [token] = useState(readTokenFromUrl)
  const [state, setState] = useState(() => (token ? { status: 'loading', data: null } : { status: 'invalid', data: null }))
  const [downloadState, setDownloadState] = useState({ busy: false, error: false })
  // A file picked but not yet (or not successfully) sent; `uploadId` is
  // generated once per picked file and reused across retries of sending
  // THAT SAME file, so a network-level retry of one send attempt can never
  // create two versions (api/_lib/aivex-signed-document-upload.js is the
  // idempotency check this key exists for). Picking a different file starts
  // a new attempt with a fresh id.
  const [upload, setUpload] = useState(BLANK_UPLOAD)
  // Bumped to re-run the verify effect below: after a successful upload (so
  // the page reflects the new state from the same server response shape as
  // a fresh load), or when the candidate asks to refresh / retry.
  const [refreshCount, setRefreshCount] = useState(0)
  const [refreshState, setRefreshState] = useState({ busy: false, failed: false })

  useEffect(() => {
    if (!token) return undefined
    let cancelled = false
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    // A refresh that merely fails to reach the server must not throw away a
    // dossier the candidate is already looking at; an answer that says the
    // link is invalid, expired or revoked always replaces it.
    const fail = (status) => setState((previous) => (previous.status === 'valid' && status === 'server_error' ? previous : { status, data: null }))

    fetch(VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token }),
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}))
        if (cancelled) return
        if (response.ok && payload?.success === true) {
          setState({ status: 'valid', data: payload })
          setRefreshState({ busy: false, failed: false })
          return
        }
        const status = KNOWN_FAILURES.has(payload?.status) ? payload.status : 'server_error'
        fail(status)
        setRefreshState({ busy: false, failed: status === 'server_error' })
      })
      .catch(() => {
        if (cancelled) return
        fail('server_error')
        setRefreshState({ busy: false, failed: true })
      })
      .finally(() => window.clearTimeout(timeout))

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [token, refreshCount])

  const refresh = () => {
    setRefreshState({ busy: true, failed: false })
    setRefreshCount((count) => count + 1)
  }
  // From the error card: back to the loading skeleton, then ask again.
  const retry = () => {
    setState({ status: 'loading', data: null })
    setRefreshCount((count) => count + 1)
  }

  const download = async () => {
    if (!token || downloadState.busy) return
    setDownloadState({ busy: true, error: false })
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS * 5)
    try {
      const response = await fetch(DOCUMENT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/json',
        },
        body: JSON.stringify({ token }),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('download_failed')
      const blob = await response.blob()
      const reference = state.data?.reference || 'aivex'
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `fiche-officielle-${reference}.docx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setDownloadState({ busy: false, error: false })
    } catch {
      setDownloadState({ busy: false, error: true })
    } finally {
      window.clearTimeout(timeout)
    }
  }

  // UX-only hint (extension/size) — the server re-checks everything,
  // including the magic bytes a browser cannot read (section 18 of the
  // Phase 5B brief). A fresh uploadId marks this as a new attempt.
  const selectSignedDocument = (file) => {
    setUpload({ ...BLANK_UPLOAD, file, uploadId: createSubmissionId(), issue: signedDocumentFileIssue(file) })
  }
  const clearSignedDocument = () => setUpload((previous) => (previous.status === 'uploading' ? previous : BLANK_UPLOAD))

  // XMLHttpRequest rather than fetch, for one reason: it is the only browser
  // API that reports how much of the request body has actually left the
  // device, which is what makes a 10 MB upload on a phone feel trustworthy.
  // The request itself is the same multipart body as before (token, the
  // per-file uploadId, the file) to the same endpoint.
  const submitSignedDocument = () => {
    if (!token || !upload.file || upload.issue || upload.status === 'uploading') return
    setUpload((previous) => ({ ...previous, status: 'uploading', message: '', progress: 0 }))

    const body = new FormData()
    body.append('token', token)
    body.append('uploadId', upload.uploadId)
    body.append('file', upload.file, upload.file.name)

    const request = new XMLHttpRequest()
    request.open('POST', UPLOAD_ENDPOINT)
    request.responseType = 'json'
    request.timeout = UPLOAD_TIMEOUT_MS
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      const progress = Math.min(100, Math.round((event.loaded / event.total) * 100))
      setUpload((previous) => (previous.status === 'uploading' ? { ...previous, progress } : previous))
    }
    request.onload = () => {
      const payload = request.response && typeof request.response === 'object' ? request.response : {}
      if (request.status >= 200 && request.status < 300 && payload.success === true) {
        setUpload({ ...BLANK_UPLOAD, status: 'success' })
        setRefreshCount((count) => count + 1)
        return
      }
      setUpload((previous) => ({ ...previous, status: 'error', message: payload.status || 'error', progress: 0 }))
    }
    const networkFailure = () => setUpload((previous) => ({ ...previous, status: 'error', message: 'network', progress: 0 }))
    request.onerror = networkFailure
    request.ontimeout = networkFailure
    request.send(body)
  }

  return {
    status: state.status,
    data: state.data,
    download,
    downloading: downloadState.busy,
    downloadError: downloadState.error,
    refresh,
    retry,
    refreshing: refreshState.busy,
    refreshFailed: refreshState.failed,
    upload,
    selectSignedDocument,
    clearSignedDocument,
    submitSignedDocument,
  }
}
