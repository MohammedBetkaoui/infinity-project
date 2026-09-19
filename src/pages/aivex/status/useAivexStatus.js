import { useEffect, useState } from 'react'

// AIVEX candidate status page (Magic Link, Phase 5A) — data layer.
//
// The token is read once from the URL, on mount, into React state used only
// to drive the fetch calls below — never rendered, never written to
// localStorage or sessionStorage. Closing the tab loses it from memory
// exactly as intended: the candidate still has it in the Magic Link URL
// itself (their inbox, a bookmark...), which is the only place it is meant
// to persist.
const VERIFY_ENDPOINT = '/api/aivex/magic-link/verify'
const DOCUMENT_ENDPOINT = '/api/aivex/magic-link/document'
const REQUEST_TIMEOUT_MS = 12000

const KNOWN_FAILURES = new Set(['invalid', 'expired', 'revoked', 'registration_not_found'])

function readTokenFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('token') || ''
  } catch {
    return ''
  }
}

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

  useEffect(() => {
    if (!token) return undefined
    let cancelled = false
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

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
          return
        }
        setState({ status: KNOWN_FAILURES.has(payload?.status) ? payload.status : 'server_error', data: null })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'server_error', data: null })
      })
      .finally(() => window.clearTimeout(timeout))

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [token])

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

  return { status: state.status, data: state.data, download, downloading: downloadState.busy, downloadError: downloadState.error }
}
