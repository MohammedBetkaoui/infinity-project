import { isPlausibleWorkshopToken, tokenFromWorkshopQrPayload } from './workshop-tokens.js'

// Registration identity is resolved server-side from the invitation token:
// the only field a participant supplies is their university speciality.
const SPECIALITY_RE = /^[\p{L}\p{N} .,'’\-()+&/]{1,160}$/u

export function normalizeUniversitySpeciality(value) {
  if (typeof value !== 'string') return ''
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim()
}

export function isUniversitySpeciality(value) {
  return typeof value === 'string' && value.length >= 2 && value.length <= 160 && SPECIALITY_RE.test(value)
}

export function validateInvitationTokenBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !isPlausibleWorkshopToken(body.token)) return { ok: false }
  return { ok: true, value: { token: body.token } }
}

export function validateWorkshopRegistrationBody(body) {
  const token = body?.token
  const universitySpeciality = normalizeUniversitySpeciality(body?.universitySpeciality)
  if (!isPlausibleWorkshopToken(token) || !isUniversitySpeciality(universitySpeciality)) return { ok: false }
  return { ok: true, value: { token, universitySpeciality } }
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
