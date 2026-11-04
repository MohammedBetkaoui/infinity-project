const DEFAULT_TIMEOUT_MS = 8_000
const WEBHOOK_ERROR = 'webhook_configuration_error'

const safeWebhookUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim())
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

const safeHttpCode = (status) => {
  const code = Number(status)
  return Number.isInteger(code) && code >= 100 && code <= 599 ? `http_${code}` : 'http_error'
}

export function createN8nRegistrationDispatcher({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const webhookUrl = safeWebhookUrl(env.N8N_REGISTRATION_WEBHOOK_URL)
  if (!webhookUrl || typeof fetchImpl !== 'function') {
    throw Object.assign(new Error(WEBHOOK_ERROR), { code: 'configuration_error', stage: 'n8n_webhook' })
  }
  const sharedSecret = typeof env.N8N_WEBHOOK_SECRET === 'string' ? env.N8N_WEBHOOK_SECRET.trim() : ''
  const requestTimeout = Number.isFinite(timeoutMs) && timeoutMs >= 10 && timeoutMs <= 30_000
    ? Math.trunc(timeoutMs)
    : DEFAULT_TIMEOUT_MS

  return {
    async dispatch({ jobId, fullName, email, privateRegistrationLink }) {
      const form = new FormData()
      // These are the only multipart fields in the n8n contract.
      form.append('full_name', String(fullName || ''))
      form.append('email', String(email || ''))
      form.append('private_registration_link', String(privateRegistrationLink || ''))

      const headers = { 'Idempotency-Key': String(jobId || '') }
      if (sharedSecret) headers.Authorization = `Bearer ${sharedSecret}`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), requestTimeout)
      try {
        const response = await fetchImpl(webhookUrl, {
          method: 'POST', headers, body: form, signal: controller.signal,
        })
        if (!response.ok) return { ok: false, errorCode: safeHttpCode(response.status), retryable: true }
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          errorCode: error?.name === 'AbortError' ? 'timeout' : 'network_error',
          // A timeout is ambiguous: n8n may have accepted the request. Retrying
          // is required for durability and is why n8n must deduplicate jobId.
          retryable: true,
        }
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

export const N8N_WEBHOOK_TIMEOUT_MS = DEFAULT_TIMEOUT_MS
