// Server-side validation for AIVEX registrations (form v3). Nothing here
// trusts the browser: the wilaya and institution labels are re-derived from
// the shared dataset, the team is exactly three students, and each card's
// real image type is read from its bytes.
//
// National ID numbers are personal data: they are validated and returned,
// never logged and never echoed back in an error message.

import { fileTypeFromBuffer } from 'file-type'
import { OTHER_INSTITUTION_ID, findInstitution, findWilaya } from '../../src/data/algeriaHigherEducation.js'
import { normalizeString } from './http.js'

export const SUPPORTED_FORM_VERSIONS = new Set([3])
// Official rule: every team is exactly three students, one card each.
export const STUDENT_COUNT = 3
export const MAX_CARD_BYTES = 5 * 1024 * 1024
export const CARD_FIELD_PATTERN = new RegExp(`^studentCard_[1-${STUDENT_COUNT}]$`)

const ACTIVITY_ROLES = new Set(['sub_director_activities', 'activities_officer'])
const STUDY_LEVELS = new Set([
  'Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2', 'Engineering cycle', 'Doctorate', 'Other',
])
const CARD_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const MIME_ALIASES = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg' }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?[\d\s().-]+$/
const NATIONAL_ID_RE = /^[A-Za-z0-9]{6,20}$/

const LIMITS = {
  teamName: [2, 120],
  customInstitution: [3, 180],
  fullName: [3, 120],
  email: 254,
  phone: 40,
  source: 500,
}

const invalid = (message, status = 400) => ({ ok: false, status, message })
const valid = (value) => ({ ok: true, value })
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const within = (value, [min, max]) => value.length >= min && value.length <= max
const cleanText = (value) => normalizeString(value).replace(/\s+/g, ' ')

export const cardField = (position) => `studentCard_${position}`

// Normalised phone ('+' and digits only), or '' when it is not plausible.
function readPhone(value) {
  const input = normalizeString(value)
  const digits = input.replace(/\D/g, '')
  if (!input || input.length > LIMITS.phone || !PHONE_RE.test(input) || input.lastIndexOf('+') > 0
    || digits.length < 9 || digits.length > 15) return ''
  return input.replace(/[\s().-]/g, '')
}

function readTeam(raw) {
  if (!isObject(raw) || !isObject(raw.wilaya) || !isObject(raw.institution)) return invalid('Invalid registration data.')

  const name = cleanText(raw.name)
  if (!within(name, LIMITS.teamName)) return invalid('Please enter a team name (2 to 120 characters).')

  const wilaya = findWilaya(normalizeString(raw.wilaya.code))
  if (!wilaya) return invalid('Please choose a valid wilaya.')

  const listed = findInstitution(wilaya.code, normalizeString(raw.institution.id))
  if (!listed) return invalid('Please choose a university or institution from the selected wilaya.')

  let institution
  if (listed.id === OTHER_INSTITUTION_ID) {
    const customName = cleanText(raw.institution.name)
    if (raw.institution.custom !== true || !within(customName, LIMITS.customInstitution)) {
      return invalid('Please enter the institution name (3 to 180 characters).')
    }
    institution = { id: OTHER_INSTITUTION_ID, name: customName, custom: true }
  } else {
    // Official label from the dataset, whatever the request claimed.
    institution = { id: listed.id, name: listed.name, custom: false }
  }

  return valid({ name, wilaya: { code: wilaya.code, name: wilaya.name }, institution })
}

function readActivityOfficial(raw) {
  const label = 'Activity administration contact'
  if (!isObject(raw)) return invalid(`${label}: invalid data.`)

  const role = normalizeString(raw.role)
  if (!ACTIVITY_ROLES.has(role)) return invalid(`${label}: choose a role.`)

  const fullName = cleanText(raw.fullName)
  if (!within(fullName, LIMITS.fullName)) return invalid(`${label}: enter the full name (3 to 120 characters).`)

  const email = normalizeString(raw.email).toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > LIMITS.email) return invalid(`${label}: enter a valid email address.`)

  const phone = readPhone(raw.phone)
  if (!phone) return invalid(`${label}: enter a valid phone number.`)

  return valid({ role, fullName, email, phone })
}

// Head of delegation and driver share the same identity record.
function readPerson(raw, label) {
  if (!isObject(raw)) return invalid(`${label}: invalid data.`)

  const fullName = cleanText(raw.fullName)
  if (!within(fullName, LIMITS.fullName)) return invalid(`${label}: enter the full name (3 to 120 characters).`)

  const phone = readPhone(raw.phone)
  if (!phone) return invalid(`${label}: enter a valid phone number.`)

  // Strings only: a JSON number would already have lost its leading zeros.
  const nationalId = typeof raw.nationalId === 'string' ? raw.nationalId.replace(/[\s-]/g, '') : ''
  if (!NATIONAL_ID_RE.test(nationalId)) return invalid(`${label}: the national ID number must be 6 to 20 letters or digits.`)

  return valid({ fullName, phone, nationalId })
}

function readStudents(rawStudents) {
  if (!Array.isArray(rawStudents)) return invalid('Invalid registration data.')
  if (rawStudents.length !== STUDENT_COUNT) return invalid(`A team is exactly ${STUDENT_COUNT} students.`)

  const students = []
  const seenNumbers = new Set()
  for (const [index, raw] of rawStudents.entries()) {
    const position = index + 1
    const label = `Student ${position}`
    if (!isObject(raw)) return invalid(`${label}: invalid data.`)
    if (raw.position !== position) return invalid(`${label}: unexpected position.`)

    const fullName = cleanText(raw.fullName)
    if (!within(fullName, LIMITS.fullName)) return invalid(`${label}: enter the full name (3 to 120 characters).`)

    const registrationNumber = normalizeString(raw.registrationNumber).replace(/\s+/g, '')
    if (!/^\d{6,20}$/.test(registrationNumber)) return invalid(`${label}: the registration number must contain 6 to 20 digits.`)
    if (seenNumbers.has(registrationNumber)) return invalid('Two students share the same registration number.')
    seenNumbers.add(registrationNumber)

    const studyLevel = normalizeString(raw.studyLevel)
    if (!STUDY_LEVELS.has(studyLevel)) return invalid(`${label}: choose a study level.`)

    const phone = readPhone(raw.phone)
    if (!phone) return invalid(`${label}: enter a valid phone number.`)

    if (raw.studentCard !== cardField(position)) return invalid(`${label}: the student card reference is invalid.`)

    students.push({ position, fullName, registrationNumber, studyLevel, phone, cardField: cardField(position) })
  }
  return valid(students)
}

// Validates the JSON envelope, section by section in form order. Returns
// { ok: true, value } with a clean, explicitly built structure, or
// { ok: false, status, message }.
export function validateRegistration(body) {
  if (!isObject(body) || body.form !== 'aivex') return invalid('Invalid registration data.')
  if (!SUPPORTED_FORM_VERSIONS.has(body.version)) return invalid('This form version is no longer supported. Please reload the page.')

  const { answers } = body
  if (!isObject(answers)) return invalid('Invalid registration data.')

  const team = readTeam(answers.team)
  if (!team.ok) return team
  const activityOfficial = readActivityOfficial(answers.activityOfficial)
  if (!activityOfficial.ok) return activityOfficial
  const delegationHead = readPerson(answers.delegationHead, 'Head of delegation')
  if (!delegationHead.ok) return delegationHead
  const driver = readPerson(answers.driver, 'Driver')
  if (!driver.ok) return driver
  const students = readStudents(answers.students)
  if (!students.ok) return students
  if (answers.consent !== true) return invalid('Please confirm the registration statement before submitting.')

  return valid({
    team: team.value,
    activityOfficial: activityOfficial.value,
    delegationHead: delegationHead.value,
    driver: driver.value,
    students: students.value,
    formVersion: body.version,
    source: normalizeString(body.source).slice(0, LIMITS.source) || null,
  })
}

// Checks that the received files are exactly one card per student, then
// validates each card from its bytes. Returns { ok: true, cards } where
// cards[i] = { buffer, mime, extension, size } for students[i].
//
// Policy: the detected signature must be JPEG, PNG or WEBP, AND it must
// match the type the browser declared. A mismatch (e.g. a PNG sent as
// image/jpeg) is refused rather than silently relabelled: the form always
// sends correctly labelled files, so a mismatch means a crafted request.
export async function validateCards(students, files) {
  const expected = new Set(students.map((student) => student.cardField))
  for (const name of files.keys()) {
    if (!expected.has(name)) return invalid('Unexpected file in this registration.')
  }

  const cards = []
  for (const student of students) {
    const label = `Student ${student.position}`
    const file = files.get(student.cardField)
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
