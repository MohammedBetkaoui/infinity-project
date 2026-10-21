import { createHash, randomBytes } from 'node:crypto'

const TOKEN_BYTES = 32
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function generateWorkshopToken(randomBytesFn = randomBytes) {
  return randomBytesFn(TOKEN_BYTES).toString('base64url')
}

export function hashWorkshopToken(rawToken) {
  return createHash('sha256').update(String(rawToken || ''), 'utf8').digest('hex')
}

export function isPlausibleWorkshopToken(value) {
  return typeof value === 'string' && TOKEN_RE.test(value)
}

export function workshopSiteOrigin(req, env = process.env) {
  const configured = String(env.PUBLIC_SITE_ORIGIN || '').trim()
  if (configured) {
    try {
      const url = new URL(configured)
      if (url.protocol === 'https:' || (!env.VERCEL && url.protocol === 'http:')) return url.origin
    } catch { /* fall through to the request host */ }
  }
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim()
  if (!host || !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host)) return null
  return `${env.VERCEL ? 'https' : 'http'}://${host}`
}

export const buildWorkshopRegistrationUrl = (origin, token) => (
  origin && isPlausibleWorkshopToken(token)
    ? `${origin}/workshops/register?t=${encodeURIComponent(token)}`
    : null
)

export const buildWorkshopScannerUrl = (origin, token) => (
  origin && isPlausibleWorkshopToken(token)
    ? `${origin}/workshops/scan?t=${encodeURIComponent(token)}`
    : null
)

export const buildWorkshopQrPayload = (origin, token) => (
  origin && isPlausibleWorkshopToken(token)
    ? `${origin}/workshops/check-in/${encodeURIComponent(token)}`
    : null
)

export function tokenFromWorkshopQrPayload(value) {
  const raw = String(value || '').trim()
  if (isPlausibleWorkshopToken(raw)) return raw
  try {
    const url = new URL(raw)
    const match = url.pathname.match(/^\/workshops\/check-in\/([A-Za-z0-9_-]{43})$/)
    return match ? match[1] : ''
  } catch {
    return ''
  }
}

