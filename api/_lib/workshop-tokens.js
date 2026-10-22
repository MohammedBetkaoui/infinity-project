import { createHash, createHmac, randomBytes } from 'node:crypto'

const TOKEN_BYTES = 32
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const WORKSHOP_CREDENTIAL_DERIVATION_VERSION = 1

export function generateWorkshopToken(randomBytesFn = randomBytes) {
  return randomBytesFn(TOKEN_BYTES).toString('base64url')
}

export function hashWorkshopToken(rawToken) {
  return createHash('sha256').update(String(rawToken || ''), 'utf8').digest('hex')
}

export function workshopInvitationLinkSecret(env = process.env) {
  const value = typeof env.WORKSHOP_INVITATION_LINK_SECRET === 'string'
    ? env.WORKSHOP_INVITATION_LINK_SECRET.trim()
    : ''
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw Object.assign(new Error('workshop_invitation_link_service_not_configured'), {
      code: 'configuration_error', stage: 'workshop_invitation_link_secret',
    })
  }
  return value
}

function stableWorkshopCredentialMaterial({ purpose, invitationId, credentialVersion, derivationVersion }) {
  if (!['invitation', 'participant-pass'].includes(purpose)
    || !UUID_RE.test(String(invitationId || ''))
    || !Number.isSafeInteger(credentialVersion) || credentialVersion < 1
    || derivationVersion !== WORKSHOP_CREDENTIAL_DERIVATION_VERSION) {
    throw Object.assign(new Error('invalid_stable_workshop_credential'), {
      code: 'credential_error', stage: 'workshop_credential_derivation',
    })
  }
  return `workshop-${purpose}:v${derivationVersion}:${String(invitationId).toLowerCase()}:${credentialVersion}`
}

export function deriveStableWorkshopToken(credential, secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw Object.assign(new Error('workshop_invitation_link_service_not_configured'), {
      code: 'configuration_error', stage: 'workshop_invitation_link_secret',
    })
  }
  return createHmac('sha256', secret)
    .update(stableWorkshopCredentialMaterial(credential), 'utf8')
    .digest('base64url')
}

export function prepareStableWorkshopCredential({
  purpose,
  invitationId,
  credentialVersion = 1,
  derivationVersion = WORKSHOP_CREDENTIAL_DERIVATION_VERSION,
  env = process.env,
  secret = workshopInvitationLinkSecret(env),
} = {}) {
  const rawToken = deriveStableWorkshopToken({ purpose, invitationId, credentialVersion, derivationVersion }, secret)
  return {
    credentialVersion,
    derivationVersion,
    rawToken,
    tokenHash: hashWorkshopToken(rawToken),
  }
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

