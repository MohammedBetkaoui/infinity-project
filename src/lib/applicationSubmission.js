const ENDPOINTS = {
  membership: import.meta.env.VITE_INFINITY_JOIN_ENDPOINT?.trim(),
  aivex: import.meta.env.VITE_AIVEX_REGISTER_ENDPOINT?.trim(),
}

const makeReference = (kind) => {
  const stamp = Date.now().toString(36).toUpperCase()
  const random = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `${kind === 'aivex' ? 'AX' : 'INF'}-${stamp}-${random}`
}

export const isApplicationDeliveryConfigured = (kind) => Boolean(ENDPOINTS[kind])

export async function submitApplication(kind, answers) {
  const endpoint = ENDPOINTS[kind]
  const reference = makeReference(kind)

  // A filled honeypot is acknowledged without sending data to the endpoint.
  if (answers.website) return { delivered: true, reference }
  if (!endpoint) return { delivered: false, reference }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12000)

  try {
    const { website: _honeypot, ...safeAnswers } = answers
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        form: kind,
        version: 1,
        reference,
        submittedAt: new Date().toISOString(),
        source: window.location.href,
        answers: safeAnswers,
      }),
      signal: controller.signal,
    })

    if (!response.ok) throw new Error(`The form endpoint returned ${response.status}.`)
    const payload = await response.json().catch(() => ({}))
    return { delivered: true, reference: payload.reference || reference }
  } finally {
    window.clearTimeout(timeout)
  }
}
