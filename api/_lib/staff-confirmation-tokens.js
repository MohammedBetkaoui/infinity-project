import { createHash, randomBytes } from 'node:crypto'

export const STAFF_CONFIRMATION_TTL_DAYS = 7
const TOKEN_BYTES = 32
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function generateStaffConfirmationToken(randomBytesFn = randomBytes) {
  return randomBytesFn(TOKEN_BYTES).toString('base64url')
}

export function hashStaffConfirmationToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex')
}

export function isPlausibleStaffConfirmationToken(value) {
  return typeof value === 'string' && TOKEN_RE.test(value)
}

export function staffConfirmationExpiryFrom(now) {
  return new Date(now.getTime() + STAFF_CONFIRMATION_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export function staffConfirmationSiteOrigin(req, env = process.env) {
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim()
  if (!host || !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host)) return null
  const protocol = env.VERCEL ? 'https' : 'http'
  return `${protocol}://${host}`
}

export function buildStaffConfirmationUrl(origin, rawToken) {
  if (!origin || !isPlausibleStaffConfirmationToken(rawToken)) return null
  return `${origin}/join/staff-confirmation#token=${encodeURIComponent(rawToken)}`
}
