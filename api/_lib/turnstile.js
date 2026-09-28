// Cloudflare Turnstile server-side verification (server only).
//
// The browser widget only produces a short-lived, single-use token. The only
// proof that a visitor passed the check is Cloudflare's Siteverify answer to
// this server, sent with the secret key that never leaves process.env. A
// client flag such as `verified: true` means nothing here.
//
// Never logged or returned: the secret, the token, Cloudflare's error codes.

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const VERIFY_TIMEOUT_MS = 5000
// Cloudflare documents tokens of at most 2048 characters.
const MAX_TOKEN_LENGTH = 2048

export const isTurnstileTokenShape = (value) => typeof value === 'string' && value.length > 0 && value.length <= MAX_TOKEN_LENGTH

// Resolves { ok: true } or { ok: false, reason: 'invalid' | 'unavailable' }.
// 'invalid': missing, malformed, expired, reused or refused token, or a token
// minted for another widget action. 'unavailable': Cloudflare could not be
// asked (timeout, network, unexpected answer) — the caller fails closed.
//
// Cloudflare's documented testing keys accept any token and echo no action
// (metadata.result_with_testing_key). They are accepted only when
// `allowTestingKeys` is set (local development, previews); anywhere else such
// an answer means the testing secret was deployed by mistake, so it is
// treated as 'unavailable' rather than as a pass.
export async function verifyTurnstileToken({ secret, token, remoteIp, action, allowTestingKeys = false, fetchImpl = globalThis.fetch, timeoutMs = VERIFY_TIMEOUT_MS }) {
  if (!isTurnstileTokenShape(token)) return { ok: false, reason: 'invalid' }

  const form = new URLSearchParams({ secret, response: token })
  if (remoteIp && remoteIp !== 'unknown') form.set('remoteip', remoteIp)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, reason: 'unavailable', code: `http_${response.status}` }
    const result = await response.json().catch(() => null)
    if (!result || typeof result.success !== 'boolean') return { ok: false, reason: 'unavailable', code: 'invalid_response' }
    if (result.success !== true) return { ok: false, reason: 'invalid' }
    if (result.metadata?.result_with_testing_key === true) {
      return allowTestingKeys ? { ok: true } : { ok: false, reason: 'unavailable', code: 'testing_key' }
    }
    if (action && result.action !== action) return { ok: false, reason: 'invalid' }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: 'unavailable', code: error?.name === 'AbortError' ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}
