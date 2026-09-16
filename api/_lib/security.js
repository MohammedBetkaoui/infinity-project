// Shared, dependency-free security helpers for api/ handlers.
//
// A file/folder prefixed with `_` under api/ is never deployed as a route
// by Vercel — this module is safe to import from handlers without becoming
// a public endpoint itself.

// --- Rate limiting -----------------------------------------------------
//
// Best-effort in-memory limiter. On Vercel, each warm serverless instance
// keeps its own memory, so this throttles bursts hitting the SAME instance
// rather than enforcing one global limit across a whole deployment. That is
// still a real first line of defense against a script hammering the
// endpoint, and it works fully in local dev (single process) and on
// low-traffic sites where the same instance serves consecutive requests.
// If abuse ever outgrows this, swap it for a shared store (Upstash Redis,
// Vercel KV...) behind the same consumeRateLimit(key, options) signature.
const buckets = new Map()
let callsSinceSweep = 0

const sweepExpired = (now) => {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

// Fixed-window counter. Returns { allowed: true } or
// { allowed: false, retryAfterSeconds } once `max` is exceeded inside `windowMs`.
export const consumeRateLimit = (key, { max, windowMs }) => {
  const now = Date.now()
  callsSinceSweep += 1
  if (callsSinceSweep >= 25) {
    callsSinceSweep = 0
    sweepExpired(now)
  }

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }

  bucket.count += 1
  if (bucket.count > max) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  return { allowed: true }
}

// First entry of X-Forwarded-For is the original client as set by Vercel's
// edge network. Falls back to X-Real-Ip, then the raw socket address.
// Defensive against a missing/malformed `headers` object so a request
// shape this helper does not expect can never crash the handler.
export const getClientIp = (req) => {
  const headers = req?.headers || {}
  const forwarded = headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim()
  const real = headers['x-real-ip']
  if (typeof real === 'string' && real.trim()) return real.trim()
  return req?.socket?.remoteAddress || 'unknown'
}

// --- Same-site check -----------------------------------------------------
//
// This endpoint has no session cookie to protect, so this is not CSRF
// protection in the classical sense: it simply stops third-party pages and
// off-site scripts from posting to this endpoint through a visitor's
// browser. Origin is checked first (harder to spoof from a browser than
// Referer); Referer is only a fallback when Origin is absent. When neither
// header is present, the check fails open — server-side validation, the
// honeypot and rate limiting remain as the other layers of defense.
export const isTrustedOrigin = (req) => {
  const headers = req?.headers || {}
  const host = headers.host
  const sameHost = (value) => {
    if (!value) return null
    try {
      return new URL(value).host === host
    } catch {
      return false
    }
  }
  const origin = sameHost(headers.origin)
  if (origin !== null) return origin
  const referer = sameHost(headers.referer)
  if (referer !== null) return referer
  return true
}
