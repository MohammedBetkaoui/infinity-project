import {
  OTHER_INSTITUTION_ID, findInstitution, findWilaya, institutionDisplayName, wilayaDisplayName,
} from '../../../data/algeriaHigherEducation.js'
import {
  ACTIVITY_OFFICIAL_ROLES, AIVEX_FORM_VERSION, AIVEX_STUDENT_COUNT, IDENTITY_CARD_POLICY, IDENTITY_CARD_SUBJECTS, LIMITS,
  STUDENT_CARD_POLICY, bacYearChoices, buildRegistrationPayloadV4, canonicalCardMime, identityCardField, identityCardFileIssue,
  isValidBacYear, isValidEmail, isValidPhoneInput, isValidRfid, normalizeBacYear, normalizeEmail, normalizeRfid, normalizeText,
  studentCardField, studentCardFileIssue, within,
} from '../../../../shared/aivex/contract-v4.js'

// Form model of the AIVEX registration, contract v4. Versions, limits and
// field rules come from shared/aivex/contract-v4.js — the same rules the API
// re-runs. This file only adds the step layout and translated messages.

export { AIVEX_FORM_VERSION as FORM_VERSION, AIVEX_STUDENT_COUNT as STUDENT_COUNT, bacYearChoices }
export const CARD_TYPES = Object.keys(STUDENT_CARD_POLICY.types)
// Identity cards accept fewer types than student cards (no WEBP).
export const IDENTITY_CARD_TYPES = Object.keys(IDENTITY_CARD_POLICY.types)

export const STEP = { institution: 0, delegation: 1, students: 2, review: 3 }

// Field order drives "focus the first error". Each section belongs to a step.
// identityDocuments is the identity card image of each person of the
// delegation (its fields are the two persons); it comes last in its step,
// after the two records, as it does on screen.
export const SECTIONS = {
  team: { step: STEP.institution, fields: ['name', 'wilaya', 'institution', 'customInstitution'] },
  activityOfficial: { step: STEP.institution, fields: ['role', 'fullName', 'email', 'phone'] },
  delegationHead: { step: STEP.delegation, fields: ['fullName', 'phone', 'rfid'] },
  driver: { step: STEP.delegation, fields: ['fullName', 'phone', 'rfid'] },
  identityDocuments: { step: STEP.delegation, fields: [...IDENTITY_CARD_SUBJECTS] },
}
// Same order as the student record renders them.
export const STUDENT_FIELDS = ['fullName', 'phone', 'bacYear', 'rfid', 'studentCard']
// Typed student answers kept in the tab's draft. The card files never are.
export const STUDENT_TEXT_FIELDS = ['fullName', 'phone', 'bacYear', 'rfid']

export const DRAFT_KEY = 'aivex-registration-draft-v4'
// Drafts of the previous forms (v3 held national ID numbers): deleted on
// load, never read into this form.
export const LEGACY_DRAFT_KEYS = ['aivex-registration-draft-v1', 'aivex-registration-draft-v2', 'aivex-registration-draft-v3']

const text = (value) => String(value ?? '').trim()

// L is the translated strings object (registrationI18n). Falls back to English
// so callers without a language still work.
const msg = (L, key, fallback) => (L && typeof L[key] === 'string' ? L[key] : fallback)

const collect = (entries) => Object.fromEntries(entries.filter(([, message]) => message))

const phoneIssue = (value, L) => {
  if (!text(value)) return msg(L, 'errPhoneRequired', 'Phone number is required.')
  return isValidPhoneInput(value) ? '' : msg(L, 'errPhoneInvalid', 'Enter a valid phone number.')
}

const nameIssue = (value, L) => {
  const name = normalizeText(value)
  if (!name) return msg(L, 'errNameRequired', 'Full name is required.')
  return within(name, LIMITS.fullName) ? '' : msg(L, 'errNameLength', 'Enter the full name (3 to 120 characters).')
}

// RFID: text as typed (leading zeros kept), only trimmed.
const rfidIssue = (value, L) => {
  const rfid = normalizeRfid(value)
  if (!rfid) return msg(L, 'errRfidRequired', 'RFID number is required.')
  return isValidRfid(rfid) ? '' : msg(L, 'errRfidInvalid', 'Use at most 64 characters, as written.')
}

export function teamIssues(team, L) {
  const name = normalizeText(team.name)
  const wilaya = findWilaya(team.wilaya)
  const institution = findInstitution(team.wilaya, team.institution)
  const custom = normalizeText(team.customInstitution)
  const [minName, maxName] = LIMITS.teamName
  return collect([
    ['name', name.length < minName ? msg(L, 'errTeamRequired', 'Team name is required.')
      : name.length > maxName ? msg(L, 'errTeamLength', 'Use at most 120 characters.') : ''],
    ['wilaya', wilaya ? '' : msg(L, 'errWilayaRequired', 'Wilaya is required.')],
    ['institution', !wilaya || institution ? '' : msg(L, 'errInstitutionRequired', 'University or institution is required.')],
    ['customInstitution', team.institution !== OTHER_INSTITUTION_ID ? ''
      : !custom ? msg(L, 'errCustomRequired', 'Institution name is required.')
        : within(custom, LIMITS.customInstitution) ? '' : msg(L, 'errCustomLength', 'Enter the institution name (3 to 180 characters).')],
  ])
}

export function officialIssues(official, L) {
  const email = normalizeEmail(official.email)
  return collect([
    ['role', ACTIVITY_OFFICIAL_ROLES.includes(official.role) ? '' : msg(L, 'errRoleRequired', 'Role is required.')],
    ['fullName', nameIssue(official.fullName, L)],
    ['email', !email ? msg(L, 'errEmailRequired', 'Email is required.')
      : isValidEmail(email) ? '' : msg(L, 'errEmailInvalid', 'Enter a valid email address.')],
    ['phone', phoneIssue(official.phone, L)],
  ])
}

// Head of delegation and driver.
export function personIssues(person, L) {
  return collect([
    ['fullName', nameIssue(person.fullName, L)],
    ['phone', phoneIssue(person.phone, L)],
    ['rfid', rfidIssue(person.rfid, L)],
  ])
}

// The identity card image of the head of delegation / the driver. Same check
// for a picked file and for the kept one, and the same rule the API applies.
export function checkIdentityFile(file, L) {
  switch (identityCardFileIssue(file)) {
    case 'missing': return msg(L, 'errFileNone', 'No file was selected.')
    case 'type': return msg(L, 'errIdFileType', 'Use a JPG or PNG image of the identity card.')
    case 'empty': return msg(L, 'errFileEmpty', 'This file is empty.')
    case 'size': return msg(L, 'errFileSize', 'This image is larger than 5 MB.')
    default: return ''
  }
}

// `cards` = { delegationHead: File | null, driver: File | null }.
export function identityIssues(cards, L) {
  return collect(IDENTITY_CARD_SUBJECTS.map((subject) => [
    subject,
    cards[subject] ? checkIdentityFile(cards[subject], L) : msg(L, 'errIdRequired', 'The identity card image is required.'),
  ]))
}

export const SECTION_ISSUES = {
  team: teamIssues,
  activityOfficial: officialIssues,
  delegationHead: personIssues,
  driver: personIssues,
  identityDocuments: identityIssues,
}

// Same messages for a picked file (StudentCardUpload) and the kept one.
export function checkCardFile(file, L) {
  switch (studentCardFileIssue(file)) {
    case 'missing': return msg(L, 'errFileNone', 'No file was selected.')
    case 'type': return msg(L, 'errFileType', 'Use a JPG, PNG or WEBP image of the card.')
    case 'empty': return msg(L, 'errFileEmpty', 'This file is empty.')
    case 'size': return msg(L, 'errFileSize', 'This image is larger than 5 MB.')
    default: return ''
  }
}

export function studentIssues(student, students = [], L, now = new Date()) {
  const name = normalizeText(student.fullName)
  const rfid = normalizeRfid(student.rfid)
  const shared = rfid && students.some((other) => other.id !== student.id && normalizeRfid(other.rfid) === rfid)
  return collect([
    ['fullName', !name ? msg(L, 'errStudentNameRequired', 'Full name is required.')
      : name.length < LIMITS.fullName[0] ? msg(L, 'errStudentNameShort', 'Enter the full name as written on the student card.')
        : within(name, LIMITS.fullName) ? '' : msg(L, 'errNameLength', 'Enter the full name (3 to 120 characters).')],
    ['phone', phoneIssue(student.phone, L)],
    ['bacYear', !text(student.bacYear) ? msg(L, 'errBacYearRequired', 'BAC year is required.')
      : isValidBacYear(normalizeBacYear(student.bacYear), now) ? '' : msg(L, 'errBacYearInvalid', 'Choose the BAC year from the list.')],
    ['rfid', rfidIssue(student.rfid, L) || (shared ? msg(L, 'errRfidShared', 'Each student needs their own RFID.') : '')],
    ['studentCard', student.studentCard ? checkCardFile(student.studentCard, L) : msg(L, 'errCardRequired', 'Student card is required.')],
  ])
}

export const formatBytes = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

// "PNG · 1.2 MB" for an accepted type, the raw MIME type otherwise.
export const describeCardFile = (file, policy = STUDENT_CARD_POLICY) => (
  `${policy.types[canonicalCardMime(file.type)]?.label || file.type || '?'} · ${formatBytes(file.size)}`
)

const ROLE_LABELS = { sub_director_activities: 'Sub-director of Activities', activities_officer: 'Activities Officer' }
export const roleLabel = (value) => ROLE_LABELS[value] || ''

export const institutionLabel = (team, lang) => (team.institution === OTHER_INSTITUTION_ID
  ? text(team.customInstitution)
  : institutionDisplayName(findInstitution(team.wilaya, team.institution), lang) || '')

export const wilayaLabel = (code, lang) => {
  const wilaya = findWilaya(code)
  return wilaya ? `${wilaya.code} — ${wilayaDisplayName(wilaya, lang)}` : ''
}

// The request: `payload` is the canonical v4 JSON (shared contract), each
// student card travels as its own multipart part studentCard_1..3, then the
// identity card of the head of delegation and of the driver as
// delegationHeadIdCard / driverIdCard. The identity cards are the only files
// that are not the applicant's own school documents, and they only ever go to
// this site's own registration endpoint.
export function buildSubmission(state) {
  return {
    payload: buildRegistrationPayloadV4(state),
    files: [
      ...state.students
        .filter((student) => student.studentCard)
        .map((student) => ({ field: studentCardField(student.position), position: student.position, file: student.studentCard })),
      ...IDENTITY_CARD_SUBJECTS
        .filter((subject) => state[subject].idCard)
        .map((subject) => ({ field: identityCardField(subject), subject, file: state[subject].idCard })),
    ],
  }
}

// Fallback text the applicant can send to the organisers. RFID numbers are
// deliberately left out: this text may travel through third-party messaging.
export function buildSummary({ team, activityOfficial, delegationHead, driver, students }) {
  return [
    'AIVEX - SECOND EDITION TEAM REGISTRATION',
    `Team: ${text(team.name)}`,
    `Wilaya: ${wilayaLabel(team.wilaya) || '-'}`,
    `Institution: ${institutionLabel(team) || '-'}`,
    '',
    `Activity administration contact: ${text(activityOfficial.fullName) || '-'} (${roleLabel(activityOfficial.role) || '-'})`,
    `   ${text(activityOfficial.email) || '-'} · ${text(activityOfficial.phone) || '-'}`,
    `Head of delegation: ${text(delegationHead.fullName) || '-'} · ${text(delegationHead.phone) || '-'}`,
    `   Identity card: ${delegationHead.idCard ? 'attached' : 'missing'}`,
    `Driver: ${text(driver.fullName) || '-'} · ${text(driver.phone) || '-'}`,
    `   Identity card: ${driver.idCard ? 'attached' : 'missing'}`,
    '(RFID numbers are provided in the form only.)',
    '',
    ...students.map((student) => [
      `Student ${String(student.position).padStart(2, '0')}: ${text(student.fullName) || 'Unnamed'}`,
      `   BAC: ${text(student.bacYear) || '-'} · ${text(student.phone) || '-'}`,
      `   Student card: ${student.studentCard ? 'attached' : 'missing'}`,
    ].join('\n')),
  ].join('\n')
}
