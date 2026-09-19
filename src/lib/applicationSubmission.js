// Static reads only: Vite then inlines these variables and nothing else.
// A dynamic import.meta.env[name] would ship every VITE_/INFINITY_/AIVEX_
// variable of the build to the browser.
const pickEndpoint = (...values) => values.map((value) => value?.trim()).find(Boolean) || ''

const ENDPOINTS = {
  // Same-origin fallback: the backend lives on the same Vercel domain.
  // A relative path contains no secret and keeps production working even
  // if the env variable was forgotten at build time.
  membership: pickEndpoint(import.meta.env.VITE_INFINITY_JOIN_ENDPOINT, import.meta.env.INFINITY_JOIN_ENDPOINT) || '/api/join',
  aivex: pickEndpoint(import.meta.env.VITE_AIVEX_REGISTER_ENDPOINT, import.meta.env.AIVEX_REGISTER_ENDPOINT) || '/api/aivex/register',
}

const REQUEST_TIMEOUT_MS = 12000

// Fallback UX messages when the backend gives no usable message.
// Server-provided `message` always has priority when it is safe to display.
const STATUS_FALLBACKS = {
  400: 'Some answers look incomplete. Please review the highlighted fields and try again.',
  403: 'This submission was refused. Please try again from the official site page.',
  409: 'This application already seems to have been received. Please check your reference or contact the club.',
  413: 'The attached files are too large to send. Please use smaller photos.',
  415: 'One of the attached files is not a supported image (JPG, PNG or WEBP).',
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

// POST with a timeout. Resolves the parsed JSON body of a successful
// response; throws an Error carrying a display-safe message otherwise.
async function postToEndpoint(endpoint, { body, headers, timeoutMs }) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
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

    return payload
  } finally {
    window.clearTimeout(timeout)
  }
}

// `files` ([{ field, file }]) switches the request to multipart/form-data:
// the JSON envelope travels in a `payload` part, each file in its own part.
// Used by the membership form.
export async function submitApplication(kind, answers, { files = [], version = 1 } = {}) {
  const endpoint = ENDPOINTS[kind]
  const reference = makeReference(kind)

  // A filled honeypot is acknowledged without sending data to the endpoint.
  if (answers.website) return { delivered: true, reference }
  if (!endpoint) return { delivered: false, reference }

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

  const payload = await postToEndpoint(endpoint, {
    body,
    headers,
    timeoutMs: files.length ? REQUEST_TIMEOUT_MS * 4 : REQUEST_TIMEOUT_MS,
  })
  return { delivered: true, reference: payload.reference || reference }
}

// AIVEX registration (form v4). multipart/form-data: `payload` is the
// canonical v4 JSON (shared contract), the three cards travel as
// studentCard_1..3 with derived file names — never as base64 in the JSON.
// The reference only ever comes from the server: no client fallback. A
// replay of the same submissionId answers 200 { alreadyProcessed: true }.
export async function submitAivexRegistrationV4({ payload, files, website }) {
  if (website) return { delivered: true, reference: null }
  const endpoint = ENDPOINTS.aivex
  if (!endpoint) return { delivered: false, reference: null }

  const body = new FormData()
  body.append('payload', JSON.stringify(payload))
  files.forEach(({ field, file, filename }) => body.append(field, file, filename))

  const result = await postToEndpoint(endpoint, {
    body,
    headers: { Accept: 'application/json' },
    timeoutMs: REQUEST_TIMEOUT_MS * 4,
  })
  return {
    delivered: true,
    reference: typeof result.reference === 'string' ? result.reference : null,
    alreadyProcessed: result.alreadyProcessed === true,
    // Absent whenever issuance failed server-side (best-effort, never
    // blocks a successful registration) — the success screen simply omits
    // the "access my file" action in that case.
    magicLink: typeof result.magicLink === 'string' ? result.magicLink : null,
  }
}

// Official AIVEX Word document (DOCX) of a delivered registration. POST, so
// the submissionId — the proof that this browser sent the registration —
// never lands in a URL, a history entry or a server access log. The file
// comes back as the response body (the storage bucket stays private) and is
// saved through a short-lived object URL revoked right after the click.
const AIVEX_DOCUMENT_ENDPOINT = '/api/aivex/document'

export async function downloadAivexOfficialDocument({ reference, submissionId }) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS * 5)
  try {
    let response
    try {
      response = await fetch(AIVEX_DOCUMENT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/json' },
        body: JSON.stringify({ reference, submissionId }),
        signal: controller.signal,
      })
    } catch (networkError) {
      if (networkError?.name === 'AbortError') throw networkError
      throw new Error('We could not reach the server. Please check your connection and try again.', { cause: networkError })
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(pickServerMessage(payload) || STATUS_FALLBACKS[response.status] || `The download endpoint returned ${response.status}.`)
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `fiche-officielle-${reference}.docx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } finally {
    window.clearTimeout(timeout)
  }
}
