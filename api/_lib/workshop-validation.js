import { isPlausibleWorkshopToken, tokenFromWorkshopQrPayload } from './workshop-tokens.js'

const NAME_RE = /^[\p{L}][\p{L}\p{M} '\u2019-]{0,79}$/u

export function normalizeParticipantName(value) {
  if (typeof value !== 'string') return ''
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ')
}

export function validateInvitationTokenBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !isPlausibleWorkshopToken(body.token)) return { ok: false }
  return { ok: true, value: { token: body.token } }
}

export function validateWorkshopRegistrationBody(body) {
  const token = body?.token
  const firstName = normalizeParticipantName(body?.firstName)
  const lastName = normalizeParticipantName(body?.lastName)
  if (!isPlausibleWorkshopToken(token) || !NAME_RE.test(firstName) || !NAME_RE.test(lastName)) return { ok: false }
  return { ok: true, value: { token, firstName, lastName } }
}

export function validateScannerSessionBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !isPlausibleWorkshopToken(body.token)) return { ok: false }
  return { ok: true, value: { token: body.token } }
}

export function validateScannerContextBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !isPlausibleWorkshopToken(body.sessionToken)) return { ok: false }
  return { ok: true, value: { sessionToken: body.sessionToken } }
}

export function validateWorkshopCheckInBody(body) {
  const qrToken = tokenFromWorkshopQrPayload(body?.qrPayload)
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !isPlausibleWorkshopToken(body.sessionToken) || !qrToken) return { ok: false }
  return { ok: true, value: { sessionToken: body.sessionToken, qrToken } }
}

