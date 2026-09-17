const pickEndpoint = (...names) => {
  for (const name of names) {
    const value = import.meta.env[name]?.trim()
    if (value) return value
  }
  return ''
}

const ENDPOINTS = {
  // Same-origin fallback: the backend lives on the same Vercel domain.
  // A relative path contains no secret and keeps production working even
  // if the env variable was forgotten at build time.
  membership: pickEndpoint('VITE_INFINITY_JOIN_ENDPOINT', 'INFINITY_JOIN_ENDPOINT') || '/api/join',
  aivex: pickEndpoint('VITE_AIVEX_REGISTER_ENDPOINT', 'AIVEX_REGISTER_ENDPOINT'),
}

const REQUEST_TIMEOUT_MS = 12000

// Fallback UX messages when the backend gives no usable message.
// Server-provided `message` always has priority when it is safe to display.
const STATUS_FALLBACKS = {
  400: 'Some answers look incomplete. Please review the highlighted fields and try again.',
  403: 'This submission was refused. Please try again from the official site page.',
  409: 'This application already seems to have been received. Please check your reference or contact the club.',
  429: 'Too many attempts. Please wait a moment, then try again.',
}

const makeReference = (kind) => {
  const stamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${kind === 'aivex' ? 'AX' : 'INF'}-${stamp}-${random}`
}

export const isApplicationDeliveryConfigured = (kind) => Boolean(ENDPOINTS[kind])

// Keep only display-safe server messages: never surface stack traces,
// SQL, Supabase internals, or anything that looks like a secret.
const pickServerMessage = (payload) => {
  const message = payload?.message
  if (typeof message !== 'string') return ''
  const trimmed = message.trim()
  if (!trimmed) return ''
  if (/(stack trace|supabase|sb_secret|service_role|postgres|password|secret|api[_-]?key|select\s+.*\s+from\s+)/i.test(trimmed)) return ''
  return trimmed.slice(0, 300)
}

// `files` ([{ field, file }]) switches the request to multipart/form-data:
// the JSON envelope travels in a `payload` part, each file in its own part.
export async function submitApplication(kind, answers, { files = [], version = 1 } = {}) {
  const endpoint = ENDPOINTS[kind]
  const reference = makeReference(kind)

  // A filled honeypot is acknowledged without sending data to the endpoint.
  if (answers.website) return { delivered: true, reference }
  if (!endpoint) return { delivered: false, reference }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), files.length ? REQUEST_TIMEOUT_MS * 4 : REQUEST_TIMEOUT_MS)

  try {
    const { website: _honeypot, ...safeAnswers } = answers
    const envelope = JSON.stringify({
      form: kind,
      version,
      reference,
      submittedAt: new Date().toISOString(),
      source: window.location.href,
      answers: safeAnswers,
    })
    let body = envelope
    const headers = { Accept: 'application/json' }
    if (files.length) {
      body = new FormData()
      body.append('payload', envelope)
      files.forEach(({ field, file }) => body.append(field, file, file.name))
    } else {
      headers['Content-Type'] = 'application/json'
    }
    let response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      })
    } catch (networkError) {
      if (networkError?.name === 'AbortError') throw networkError
      throw new Error('We could not reach the server. Please check your connection and try again.', { cause: networkError })
    }

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(
        pickServerMessage(payload)
        || STATUS_FALLBACKS[response.status]
        || `The form endpoint returned ${response.status}.`,
      )
    }

    if (payload && payload.success === false) {
      throw new Error(pickServerMessage(payload) || 'The server refused this application. Please try again.')
    }

    return { delivered: true, reference: payload.reference || reference }
  } finally {
    window.clearTimeout(timeout)
  }
}
