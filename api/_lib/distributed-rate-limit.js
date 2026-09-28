// Deployment-wide rate limiting for public api/ handlers (server only).
//
// Primary: one fixed-window counter per client in Upstash Redis, reached
// through its REST API with fetch (no SDK dependency). The counter and its
// expiry are set by one Lua script, so the window can never lose its TTL.
//
// Fallback: when Redis is not configured, times out or answers anything
// unexpected, the per-instance in-memory limiter from security.js takes over
// for that request. Availability is kept and some protection remains; a
// minimal error code is logged (never the Redis URL, token or a client IP).
//
// Keys never contain a raw IP address: `<scope>:<HMAC-SHA-256(secret, ip)>`.
// Without RATE_LIMIT_HASH_SECRET the digest is an unkeyed SHA-256, which still
// keeps addresses out of plain sight but could be reversed by brute force over
// the IPv4 space: set the secret in production.

import { createHash, createHmac } from 'node:crypto'
import { consumeRateLimit } from './security.js'

const UPSTASH_TIMEOUT_MS = 1500
const REDIS_RETRY_AFTER_FAILURE_MS = 30 * 1000
let redisPausedUntil = 0

// KEYS[1] = counter, ARGV[1] = window in ms. Returns { count, ttlMs }.
const FIXED_WINDOW_SCRIPT = [
  "local count = redis.call('INCR', KEYS[1])",
  "local ttl = redis.call('PTTL', KEYS[1])",
  'if ttl < 0 then',
  "  redis.call('PEXPIRE', KEYS[1], ARGV[1])",
  '  ttl = tonumber(ARGV[1])',
  'end',
  'return { count, ttl }',
].join('\n')

const warned = new Set()
const warnOnce = (scope, code) => {
  const key = `${scope}:${code}`
  if (warned.has(key)) return
  warned.add(key)
  console.warn(`[${scope}] distributed rate limiter not configured`, { code })
}

export function rateLimitKey(scope, clientIp, secret) {
  const identity = String(clientIp || 'unknown')
  const digest = secret
    ? createHmac('sha256', secret).update(identity).digest('hex')
    : createHash('sha256').update(`infinity-rate-limit:${identity}`).digest('hex')
  return `${scope}:${digest}`
}

const upstashEndpoint = (value) => {
  try {
    const url = new URL(String(value || '').trim())
    return url.protocol === 'https:' ? url.href.replace(/\/$/, '') : ''
  } catch {
    return ''
  }
}

async function countInRedis({ endpoint, token, key, windowMs, fetchImpl }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTASH_TIMEOUT_MS)
  try {
    let response
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['EVAL', FIXED_WINDOW_SCRIPT, '1', key, String(windowMs)]),
        signal: controller.signal,
      })
    } catch (error) {
      throw Object.assign(new Error('upstash_unreachable'), { code: error?.name === 'AbortError' ? 'timeout' : 'network' })
    }
    if (!response.ok) throw Object.assign(new Error('upstash_http'), { code: `http_${response.status}` })
    const payload = await response.json().catch(() => null)
    const [count, ttlMs] = Array.isArray(payload?.result) ? payload.result.map(Number) : []
    if (!Number.isInteger(count) || count < 1 || !Number.isFinite(ttlMs)) {
      throw Object.assign(new Error('upstash_response'), { code: 'invalid_response' })
    }
    return { count, ttlMs }
  } finally {
    clearTimeout(timer)
  }
}

// Resolves { allowed, retryAfterSeconds?, source: 'redis' | 'memory' }.
// `scope` names the endpoint ('join') and prefixes both the key and the logs.
export async function consumeDistributedRateLimit(scope, clientIp, { max, windowMs }, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const key = rateLimitKey(scope, clientIp, env.RATE_LIMIT_HASH_SECRET?.trim())
  const local = () => ({ ...consumeRateLimit(key, { max, windowMs }), source: 'memory' })

  const endpoint = upstashEndpoint(env.UPSTASH_REDIS_REST_URL)
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (!endpoint || !token) {
    warnOnce(scope, env.UPSTASH_REDIS_REST_URL && !endpoint ? 'invalid_url' : 'missing_configuration')
    return local()
  }
  if (Date.now() < redisPausedUntil) return local()

  try {
    const { count, ttlMs } = await countInRedis({ endpoint, token, key, windowMs, fetchImpl })
    if (count <= max) return { allowed: true, source: 'redis' }
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)), source: 'redis' }
  } catch (error) {
    // Short circuit breaker: during an outage, later requests on this
    // instance go straight to the local limiter instead of each waiting for
    // the Redis timeout.
    redisPausedUntil = Date.now() + REDIS_RETRY_AFTER_FAILURE_MS
    console.error(`[${scope}] distributed rate limiter unavailable`, { code: error?.code || 'unknown' })
    return local()
  }
}

// Test hook: forget a previous Redis failure.
export const resetDistributedRateLimitState = () => { redisPausedUntil = 0 }
