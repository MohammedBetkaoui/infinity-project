import {
  OTHER_INSTITUTION_ID, findInstitution, findWilaya, institutionDisplayName, wilayaDisplayName,
} from '../../../data/algeriaHigherEducation.js'

// Form v3 model (LEGACY, still the one in production). The canonical v4
// state, payload builder and validator live in shared/aivex/contract-v4.js;
// the UI moves to them once the v4 write path is deployed (Phase 2).

// Official rule: every team is exactly three students.
export const STUDENT_COUNT = 3
export const FORM_VERSION = 3
export const CARD_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const CARD_MAX_BYTES = 5 * 1024 * 1024
export const CARD_SPEC = 'JPG / PNG / WEBP · Max 5 MB'

export const STEPS = ['Institution', 'Delegation', 'Students', 'Review']
export const STEP = { institution: 0, delegation: 1, students: 2, review: 3 }

// Field order drives "focus the first error". Each section belongs to a step.
export const SECTIONS = {
  team: { step: STEP.institution, fields: ['name', 'wilaya', 'institution', 'customInstitution'] },
  activityOfficial: { step: STEP.institution, fields: ['role', 'fullName', 'email', 'phone'] },
  delegationHead: { step: STEP.delegation, fields: ['fullName', 'phone', 'nationalId'] },
  driver: { step: STEP.delegation, fields: ['fullName', 'phone', 'nationalId'] },
}
export const STUDENT_FIELDS = ['fullName', 'registrationNumber', 'studyLevel', 'phone', 'studentCard']

export const activityRoles = [
  { value: '', label: 'Select role' },
  { value: 'sub_director_activities', label: 'Sub-director of Activities' },
  { value: 'activities_officer', label: 'Activities Officer' },
]

export const studyLevels = [
  { value: '', label: 'Select level' },
  { value: 'Licence 1', label: 'Licence 1' },
  { value: 'Licence 2', label: 'Licence 2' },
  { value: 'Licence 3', label: 'Licence 3' },
  { value: 'Master 1', label: 'Master 1' },
  { value: 'Master 2', label: 'Master 2' },
  { value: 'Engineering cycle', label: 'Engineering cycle' },
  { value: 'Doctorate', label: 'Doctorate' },
  { value: 'Other', label: 'Other' },
]

export const emptyTeam = () => ({ name: '', wilaya: '', institution: '', customInstitution: '' })
export const emptyOfficial = () => ({ role: '', fullName: '', email: '', phone: '' })
export const emptyPerson = () => ({ fullName: '', phone: '', nationalId: '' })

// Stable ids: the three records never change identity.
export const createStudent = (position) => ({
  id: `student-${position}`,
  position,
  fullName: '',
  registrationNumber: '',
  studyLevel: '',
  phone: '',
  studentCard: null,
})

export const createStudents = () => Array.from({ length: STUDENT_COUNT }, (_, index) => createStudent(index + 1))

const text = (value) => String(value ?? '').trim()
const digits = (value) => String(value ?? '').replace(/\D/g, '')
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// L is the translated strings object (registrationI18n). Falls back to English
// so existing callers without a language still work.
const msg = (L, key, fallback) => (L && typeof L[key] === 'string' ? L[key] : fallback)

export const normalizePhone = (value) => text(value).replace(/[\s().-]/g, '')
// Kept as a string: leading zeros are part of the number.
export const normalizeNationalId = (value) => text(value).replace(/[\s-]/g, '')

const phoneIssue = (value, L) => {
  const phone = text(value)
  if (!phone) return msg(L, 'errPhoneRequired', 'Phone number is required.')
  if (!/^\+?[\d\s().-]+$/.test(phone) || digits(phone).length < 9 || digits(phone).length > 15) return msg(L, 'errPhoneInvalid', 'Enter a valid phone number.')
  return ''
}

const nameIssue = (value, L) => {
  const name = text(value)
  if (!name) return msg(L, 'errNameRequired', 'Full name is required.')
  if (name.length < 3 || name.length > 120) return msg(L, 'errNameLength', 'Enter the full name (3 to 120 characters).')
  return ''
}

const collect = (entries) => Object.fromEntries(entries.filter(([, message]) => message))

export function teamIssues(team, L) {
  const wilaya = findWilaya(team.wilaya)
  const institution = findInstitution(team.wilaya, team.institution)
  const custom = text(team.customInstitution)
  return collect([
    ['name', text(team.name).length < 2 ? msg(L, 'errTeamRequired', 'Team name is required.') : text(team.name).length > 120 ? msg(L, 'errTeamLength', 'Use at most 120 characters.') : ''],
    ['wilaya', wilaya ? '' : msg(L, 'errWilayaRequired', 'Wilaya is required.')],
    ['institution', !wilaya || institution ? '' : msg(L, 'errInstitutionRequired', 'University or institution is required.')],
    ['customInstitution', team.institution !== OTHER_INSTITUTION_ID ? ''
      : !custom ? msg(L, 'errCustomRequired', 'Institution name is required.')
        : custom.length < 3 || custom.length > 180 ? msg(L, 'errCustomLength', 'Enter the institution name (3 to 180 characters).') : ''],
  ])
}

export function officialIssues(official, L) {
  const email = text(official.email)
  return collect([
    ['role', activityRoles.some((role) => role.value && role.value === official.role) ? '' : msg(L, 'errRoleRequired', 'Role is required.')],
    ['fullName', nameIssue(official.fullName, L)],
    ['email', !email ? msg(L, 'errEmailRequired', 'Email is required.') : !EMAIL_RE.test(email) || email.length > 254 ? msg(L, 'errEmailInvalid', 'Enter a valid email address.') : ''],
    ['phone', phoneIssue(official.phone, L)],
  ])
}

export function personIssues(person, L) {
  const nationalId = normalizeNationalId(person.nationalId)
  return collect([
    ['fullName', nameIssue(person.fullName, L)],
    ['phone', phoneIssue(person.phone, L)],
    ['nationalId', !nationalId ? msg(L, 'errNationalRequired', 'National ID number is required.')
      : /^[A-Za-z0-9]{6,20}$/.test(nationalId) ? '' : msg(L, 'errNationalInvalid', 'Use 6 to 20 letters or digits, as printed on the ID card.')],
  ])
}

export const SECTION_ISSUES = {
  team: teamIssues,
  activityOfficial: officialIssues,
  delegationHead: personIssues,
  driver: personIssues,
}

export function studentIssues(student, students = [], L) {
  // Back-compat: studentIssues(student, L) — second arg may be the strings object.
  if (students && !Array.isArray(students) && typeof students === 'object') {
    L = students
    students = []
  }
  const registration = text(student.registrationNumber).replace(/\s/g, '')
  const shared = registration && students.some((other) => other.id !== student.id
    && text(other.registrationNumber).replace(/\s/g, '') === registration)
  return collect([
    ['fullName', !text(student.fullName) ? msg(L, 'errStudentNameRequired', 'Full name is required.')
      : text(student.fullName).length < 3 ? msg(L, 'errStudentNameShort', 'Enter the full name as written on the student card.') : ''],
    ['registrationNumber', !registration ? msg(L, 'errRegRequired', 'Student registration number is required.')
      : !/^\d{6,20}$/.test(registration) ? msg(L, 'errRegDigits', 'Use digits only, as printed on the student card.')
        : shared ? msg(L, 'errRegShared', 'Each student needs their own registration number.') : ''],
    ['studyLevel', student.studyLevel ? '' : msg(L, 'errLevelRequired', 'Study level is required.')],
    ['phone', phoneIssue(student.phone, L)],
    ['studentCard', student.studentCard ? '' : msg(L, 'errCardRequired', 'Student card is required.')],
  ])
}

export function checkCardFile(file, L) {
  if (!file) return msg(L, 'errFileNone', 'No file was selected.')
  if (!CARD_TYPES.includes(file.type)) return msg(L, 'errFileType', 'Use a JPG, PNG or WEBP image of the card.')
  if (file.size > CARD_MAX_BYTES) return msg(L, 'errFileSize', 'This image is larger than 5 MB.')
  return ''
}

export const formatBytes = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

export const roleLabel = (value) => activityRoles.find((role) => role.value && role.value === value)?.label || ''

export const institutionLabel = (team, lang) => (team.institution === OTHER_INSTITUTION_ID
  ? text(team.customInstitution)
  : institutionDisplayName(findInstitution(team.wilaya, team.institution), lang) || '')

export const wilayaLabel = (code, lang) => {
  const wilaya = findWilaya(code)
  return wilaya ? `${wilaya.code} — ${wilayaDisplayName(wilaya, lang)}` : ''
}

// Backend contract v3: answers are JSON, each student card travels as its own
// multipart file referenced by field name. The server re-checks everything.
export function buildSubmission({ team, activityOfficial, delegationHead, driver, students, consent }) {
  const wilaya = findWilaya(team.wilaya)
  const custom = team.institution === OTHER_INSTITUTION_ID
  const listed = custom ? null : findInstitution(team.wilaya, team.institution)
  const person = (value) => ({
    fullName: text(value.fullName),
    phone: normalizePhone(value.phone),
    nationalId: normalizeNationalId(value.nationalId),
  })

  return {
    answers: {
      team: {
        name: text(team.name),
        wilaya: { code: wilaya?.code ?? '', name: wilaya?.name ?? '' },
        institution: custom
          ? { id: OTHER_INSTITUTION_ID, name: text(team.customInstitution), custom: true }
          : { id: listed?.id ?? '', name: listed?.name ?? '', custom: false },
      },
      activityOfficial: {
        role: activityOfficial.role,
        fullName: text(activityOfficial.fullName),
        email: text(activityOfficial.email).toLowerCase(),
        phone: normalizePhone(activityOfficial.phone),
      },
      delegationHead: person(delegationHead),
      driver: person(driver),
      students: students.map((student) => ({
        position: student.position,
        fullName: text(student.fullName),
        registrationNumber: text(student.registrationNumber).replace(/\s/g, ''),
        studyLevel: student.studyLevel,
        phone: normalizePhone(student.phone),
        studentCard: `studentCard_${student.position}`,
      })),
      consent: consent === true,
    },
    files: students
      .filter((student) => student.studentCard)
      .map((student) => ({ field: `studentCard_${student.position}`, file: student.studentCard })),
  }
}

// Fallback text the applicant can send to the organisers. National ID
// numbers are deliberately left out: this text may travel through
// third-party messaging.
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
    `Driver: ${text(driver.fullName) || '-'} · ${text(driver.phone) || '-'}`,
    '(National ID numbers are provided in the form only.)',
    '',
    ...students.map((student) => [
      `Student ${String(student.position).padStart(2, '0')}: ${text(student.fullName) || 'Unnamed'}`,
      `   Registration: ${text(student.registrationNumber) || '-'} · ${student.studyLevel || '-'} · ${text(student.phone) || '-'}`,
      `   Student card: ${student.studentCard ? 'attached' : 'missing'}`,
    ].join('\n')),
  ].join('\n')
}
