// Server-side validation for AIVEX registrations. Nothing here trusts the
// browser: sizes, roles, positions, the team size and the real image type
// are all re-derived from what was actually received.

import { fileTypeFromBuffer } from 'file-type'
import { normalizeString } from './http.js'

export const SUPPORTED_FORM_VERSIONS = new Set([2])
export const MIN_MEMBERS = 3
// Technical protection only, not an official AIVEX rule: raise it once the
// official maximum team size is known.
export const MAX_MULTIPART_FILES = 20
export const MAX_CARD_BYTES = 5 * 1024 * 1024
export const CARD_FIELD_PATTERN = /^studentCard_[1-9]\d{0,2}$/

const STUDY_LEVELS = new Set([
  'Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2', 'Engineering cycle', 'Doctorate', 'Other',
])
const CARD_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MIME_ALIASES = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg' }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?[\d\s().-]+$/

const LIMITS = {
  teamName: [2, 120],
  university: [1, 180],
  fullName: [3, 120],
  email: 254,
  phone: 40,
  source: 500,
}

const invalid = (message, status = 400) => ({ ok: false, status, message })
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const within = (value, [min, max]) => value.length >= min && value.length <= max

// Name comparison ignores case, spacing and Unicode composition only.
const comparableName = (value) => value.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()

export const cardField = (position) => `studentCard_${position}`

// Validates the JSON envelope. Returns { ok: true, value } with a clean,
// explicitly built structure, or { ok: false, status, message }.
export function validateRegistration(body) {
  if (!isObject(body) || body.form !== 'aivex') return invalid('Invalid registration data.')
  if (!SUPPORTED_FORM_VERSIONS.has(body.version)) return invalid('This form version is no longer supported. Please reload the page.')

  const { answers } = body
  if (!isObject(answers) || !isObject(answers.team) || !Array.isArray(answers.members)) {
    return invalid('Invalid registration data.')
  }
  if (answers.consent !== true) return invalid('Please confirm the registration statement before submitting.')

  const team = {
    name: normalizeString(answers.team.name).replace(/\s+/g, ' '),
    university: normalizeString(answers.team.university).replace(/\s+/g, ' '),
    leaderName: normalizeString(answers.team.leaderName).replace(/\s+/g, ' '),
    email: normalizeString(answers.team.email).toLowerCase(),
  }
  if (!within(team.name, LIMITS.teamName)) return invalid('Please enter a team name (2 to 120 characters).')
  if (!within(team.university, LIMITS.university)) return invalid('Please enter the university or institution.')
  if (!within(team.leaderName, LIMITS.fullName)) return invalid('Please enter the team leader’s full name.')
  if (!EMAIL_RE.test(team.email) || team.email.length > LIMITS.email) return invalid('Enter a valid team email address.')

  const rawMembers = answers.members
  if (rawMembers.length < MIN_MEMBERS) return invalid(`A team needs at least ${MIN_MEMBERS} members, team leader included.`)
  if (rawMembers.length > MAX_MULTIPART_FILES) return invalid('Too many members in one registration.', 413)

  const members = []
  const seenNumbers = new Set()
  for (const [index, raw] of rawMembers.entries()) {
    const position = index + 1
    const label = `Member ${position}`
    if (!isObject(raw)) return invalid(`${label}: invalid data.`)
    if (raw.position !== position) return invalid(`${label}: unexpected position.`)

    const role = position === 1 ? 'leader' : 'member'
    if (raw.role !== role) return invalid(position === 1 ? 'The first member must be the team leader.' : `${label} cannot be a team leader.`)

    const fullName = normalizeString(raw.fullName).replace(/\s+/g, ' ')
    if (!within(fullName, LIMITS.fullName)) return invalid(`${label}: enter the full name (3 to 120 characters).`)
    if (role === 'leader' && comparableName(fullName) !== comparableName(team.leaderName)) {
      return invalid('The first member must be the team leader named in the team details.')
    }

    const registrationNumber = normalizeString(raw.registrationNumber).replace(/\s+/g, '')
    if (!/^\d{6,20}$/.test(registrationNumber)) return invalid(`${label}: the registration number must contain 6 to 20 digits.`)
    if (seenNumbers.has(registrationNumber)) return invalid('Two members share the same registration number.')
    seenNumbers.add(registrationNumber)

    const studyLevel = normalizeString(raw.studyLevel)
    if (!STUDY_LEVELS.has(studyLevel)) return invalid(`${label}: choose a study level.`)

    const phoneInput = normalizeString(raw.phone)
    const phoneDigits = phoneInput.replace(/\D/g, '')
    if (!phoneInput || phoneInput.length > LIMITS.phone || !PHONE_RE.test(phoneInput) || phoneInput.lastIndexOf('+') > 0
      || phoneDigits.length < 9 || phoneDigits.length > 15) {
      return invalid(`${label}: enter a valid phone number.`)
    }

    if (raw.studentCard !== cardField(position)) return invalid(`${label}: the student card reference is invalid.`)

    members.push({
      position,
      role,
      fullName,
      registrationNumber,
      studyLevel,
      phone: phoneInput.replace(/[\s().-]/g, ''),
      cardField: cardField(position),
    })
  }

  return {
    ok: true,
    value: {
      team,
      members,
      formVersion: body.version,
      source: normalizeString(body.source).slice(0, LIMITS.source) || null,
    },
  }
}

// Checks that the received files are exactly one card per member, then
// validates each card from its bytes. Returns { ok: true, cards } where
// cards[i] = { buffer, mime, extension, size } for members[i].
//
// Policy: the detected signature must be JPEG, PNG or WEBP, AND it must
// match the type the browser declared. A mismatch (e.g. a PNG sent as
// image/jpeg) is refused rather than silently relabelled: the form always
// sends correctly labelled files, so a mismatch means a crafted request.
export async function validateCards(members, files) {
  const expected = new Set(members.map((member) => member.cardField))
  for (const name of files.keys()) {
    if (!expected.has(name)) return invalid('Unexpected file in this registration.')
  }

  const cards = []
  for (const member of members) {
    const label = `Member ${member.position}`
    const file = files.get(member.cardField)
    if (!file) return invalid(`${label}: the student card is missing.`)
    if (!file.buffer.length) return invalid(`${label}: the student card file is empty.`)
    if (file.buffer.length > MAX_CARD_BYTES) return invalid(`${label}: the student card must be 5 MB or smaller.`, 413)

    const detected = await fileTypeFromBuffer(file.buffer)
    const extension = detected && CARD_TYPES[detected.mime]
    if (!extension) return invalid(`${label}: the student card must be a JPG, PNG or WEBP image.`, 415)

    const declared = String(file.mimeType || '').toLowerCase()
    if ((MIME_ALIASES[declared] || declared) !== detected.mime) {
      return invalid(`${label}: the student card file type does not match its content.`, 415)
    }

    cards.push({ buffer: file.buffer, mime: detected.mime, extension, size: file.buffer.length })
  }
  return { ok: true, cards }
}
