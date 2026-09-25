import { createHmac } from 'node:crypto'
import { sendJson } from './http.js'

export const ADMIN_PRODUCTION_COOKIE = '__Host-infinity_admin_session'
export const ADMIN_DEVELOPMENT_COOKIE = 'infinity_admin_session_dev'
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60

export const isProductionAdminRuntime = (env = process.env) => env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production'

export const adminCookieName = (env = process.env) => isProductionAdminRuntime(env)
  ? ADMIN_PRODUCTION_COOKIE
  : ADMIN_DEVELOPMENT_COOKIE

export function parseCookieHeader(header) {
  const cookies = new Map()
  if (typeof header !== 'string') return cookies
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (name && !cookies.has(name)) cookies.set(name, value)
  }
  return cookies
}

export function adminSessionTokenFromRequest(req, env = process.env) {
  const value = parseCookieHeader(req?.headers?.cookie).get(adminCookieName(env))
  return typeof value === 'string' && /^[A-Za-z0-9_-]{40,160}$/.test(value) ? value : null
}

const cookieParts = (name, value, { secure, maxAge }) => [
  `${name}=${value}`,
  'Path=/',
  'HttpOnly',
  'SameSite=Strict',
  secure ? 'Secure' : null,
  `Max-Age=${maxAge}`,
].filter(Boolean).join('; ')

export function createAdminSessionCookie(token, env = process.env) {
  const production = isProductionAdminRuntime(env)
  return cookieParts(adminCookieName(env), token, {
    secure: production,
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  })
}

export function clearAdminSessionCookie(env = process.env) {
  const production = isProductionAdminRuntime(env)
  return `${cookieParts(adminCookieName(env), '', { secure: production, maxAge: 0 })}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

function firstHeaderValue(value) {
  return typeof value === 'string' ? value.split(',')[0].trim() : ''
}

function configuredOrigins(env) {
  return String(env.ADMIN_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

// Admin mutations fail closed: Origin is mandatory and must match the
// effective host or an exact, explicitly configured origin. There is no
// Referer fallback. Loopback exceptions exist only outside production for the
// Vite (5173) -> local API (3001) proxy.
export function isStrictAdminOrigin(req, env = process.env) {
  const headers = req?.headers || {}
  const rawOrigin = firstHeaderValue(headers.origin)
  if (!rawOrigin || rawOrigin === 'null') return false

  let origin
  try {
    origin = new URL(rawOrigin)
  } catch {
    return false
  }

  const forwardedHost = firstHeaderValue(headers['x-forwarded-host'])
  const host = forwardedHost || firstHeaderValue(headers.host)
  if (!host) return false
  if (origin.host === host) return true
  if (configuredOrigins(env).includes(origin.origin)) return true

  if (!isProductionAdminRuntime(env)) {
    const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])
    let requestHostname
    try { requestHostname = new URL(`http://${host}`).hostname } catch { return false }
    return origin.protocol === 'http:' && loopback.has(origin.hostname) && loopback.has(requestHostname)
  }
  return false
}

export function adminRateLimitKey(value, secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw Object.assign(new Error('admin_rate_limit_secret_missing'), { code: 'configuration_error', stage: 'rate_limit' })
  }
  return createHmac('sha256', secret).update(String(value)).digest('hex')
}

export const adminAuthEnabled = (env = process.env) => env.ADMIN_AUTH_ENABLED === 'true'

export function sendAdminJson(res, status, payload) {
  res.setHeader('Vary', 'Cookie, Origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  sendJson(res, status, payload)
}

export function publicAdminIdentity(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
  }
}

export function normalizeAdminUsername(value) {
  if (typeof value !== 'string') return ''
  const normalized = value.normalize('NFKC').trim().toLowerCase()
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized) ? normalized : ''
}

export function safeAdminAuthLog(stage, error) {
  const code = typeof error?.code === 'string' ? error.code : 'unexpected_error'
  console.error('[admin-auth] Request failed', { stage, code })
}
