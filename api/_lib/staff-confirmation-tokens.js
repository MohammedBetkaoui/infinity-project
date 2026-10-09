import { createHash, createHmac, randomBytes } from 'node:crypto'

export const STAFF_CONFIRMATION_TTL_DAYS = 7
const TOKEN_BYTES = 32
const NONCE_BYTES = 16
export const STAFF_CONFIRMATION_DERIVATION_VERSION = 1
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const NONCE_RE = /^[A-Za-z0-9_-]{22}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function generateStaffConfirmationToken(randomBytesFn = randomBytes) {
  return randomBytesFn(TOKEN_BYTES).toString('base64url')
}

export function generateStaffConfirmationLinkNonce(randomBytesFn = randomBytes) {
  return randomBytesFn(NONCE_BYTES).toString('base64url')
}

export function hashStaffConfirmationToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex')
}

export function isPlausibleStaffConfirmationToken(value) {
  return typeof value === 'string' && TOKEN_RE.test(value)
}

export function staffConfirmationLinkSecret(env = process.env) {
  const value = typeof env.STAFF_CONFIRMATION_LINK_SECRET === 'string'
    ? env.STAFF_CONFIRMATION_LINK_SECRET.trim()
    : ''
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw Object.assign(new Error('stable_staff_link_service_not_configured'), {
      code: 'configuration_error', stage: 'staff_link_secret',
    })
  }
  return value
}

export function stableStaffConfirmationCredentialMaterial({
  confirmationId, credentialVersion, derivationVersion = STAFF_CONFIRMATION_DERIVATION_VERSION, linkNonce,
}) {
  if (!UUID_RE.test(String(confirmationId || ''))
    || !Number.isSafeInteger(credentialVersion) || credentialVersion < 1
    || derivationVersion !== STAFF_CONFIRMATION_DERIVATION_VERSION
    || !NONCE_RE.test(String(linkNonce || ''))) {
    throw Object.assign(new Error('invalid_stable_staff_link_credential'), {
      code: 'credential_error', stage: 'staff_link_derivation',
    })
  }
  return `staff-confirmation:v${derivationVersion}:${String(confirmationId).toLowerCase()}:${credentialVersion}:${linkNonce}`
}

export function deriveStableStaffConfirmationToken(credential, secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
    throw Object.assign(new Error('stable_staff_link_service_not_configured'), {
      code: 'configuration_error', stage: 'staff_link_secret',
    })
  }
  return createHmac('sha256', secret)
    .update(stableStaffConfirmationCredentialMaterial(credential), 'utf8')
    .digest('base64url')
}

export function prepareStableStaffConfirmationCredential({
  confirmationId,
  credentialVersion = 1,
  derivationVersion = STAFF_CONFIRMATION_DERIVATION_VERSION,
  linkNonce = generateStaffConfirmationLinkNonce(),
  env = process.env,
  secret = staffConfirmationLinkSecret(env),
} = {}) {
  const credential = { confirmationId, credentialVersion, derivationVersion, linkNonce }
  const rawToken = deriveStableStaffConfirmationToken(credential, secret)
  return {
    ...credential,
    rawToken,
    tokenHash: hashStaffConfirmationToken(rawToken),
  }
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
