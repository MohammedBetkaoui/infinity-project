import {
  OTHER_INSTITUTION_ID, findInstitution, findWilaya,
} from '../../../data/algeriaHigherEducation.js'

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

export const normalizePhone = (value) => text(value).replace(/[\s().-]/g, '')
// Kept as a string: leading zeros are part of the number.
export const normalizeNationalId = (value) => text(value).replace(/[\s-]/g, '')

const phoneIssue = (value) => {
  const phone = text(value)
  if (!phone) return 'Phone number is required.'
  if (!/^\+?[\d\s().-]+$/.test(phone) || digits(phone).length < 9 || digits(phone).length > 15) return 'Enter a valid phone number.'
  return ''
}

const nameIssue = (value) => {
  const name = text(value)
  if (!name) return 'Full name is required.'
  if (name.length < 3 || name.length > 120) return 'Enter the full name (3 to 120 characters).'
  return ''
}

const collect = (entries) => Object.fromEntries(entries.filter(([, message]) => message))

export function teamIssues(team) {
  const wilaya = findWilaya(team.wilaya)
  const institution = findInstitution(team.wilaya, team.institution)
  const custom = text(team.customInstitution)
  return collect([
    ['name', text(team.name).length < 2 ? 'Team name is required.' : text(team.name).length > 120 ? 'Use at most 120 characters.' : ''],
    ['wilaya', wilaya ? '' : 'Wilaya is required.'],
    ['institution', !wilaya || institution ? '' : 'University or institution is required.'],
    ['customInstitution', team.institution !== OTHER_INSTITUTION_ID ? ''
      : !custom ? 'Institution name is required.'
        : custom.length < 3 || custom.length > 180 ? 'Enter the institution name (3 to 180 characters).' : ''],
  ])
}

export function officialIssues(official) {
  const email = text(official.email)
  return collect([
    ['role', activityRoles.some((role) => role.value && role.value === official.role) ? '' : 'Role is required.'],
    ['fullName', nameIssue(official.fullName)],
    ['email', !email ? 'Email is required.' : !EMAIL_RE.test(email) || email.length > 254 ? 'Enter a valid email address.' : ''],
    ['phone', phoneIssue(official.phone)],
  ])
}

export function personIssues(person) {
  const nationalId = normalizeNationalId(person.nationalId)
  return collect([
    ['fullName', nameIssue(person.fullName)],
    ['phone', phoneIssue(person.phone)],
    ['nationalId', !nationalId ? 'National ID number is required.'
      : /^[A-Za-z0-9]{6,20}$/.test(nationalId) ? '' : 'Use 6 to 20 letters or digits, as printed on the ID card.'],
  ])
}

export const SECTION_ISSUES = {
  team: teamIssues,
  activityOfficial: officialIssues,
  delegationHead: personIssues,
  driver: personIssues,
}

export function studentIssues(student, students = []) {
  const registration = text(student.registrationNumber).replace(/\s/g, '')
  const shared = registration && students.some((other) => other.id !== student.id
    && text(other.registrationNumber).replace(/\s/g, '') === registration)
  return collect([
    ['fullName', !text(student.fullName) ? 'Full name is required.'
      : text(student.fullName).length < 3 ? 'Enter the full name as written on the student card.' : ''],
    ['registrationNumber', !registration ? 'Student registration number is required.'
      : !/^\d{6,20}$/.test(registration) ? 'Use digits only, as printed on the student card.'
        : shared ? 'Each student needs their own registration number.' : ''],
    ['studyLevel', student.studyLevel ? '' : 'Study level is required.'],
    ['phone', phoneIssue(student.phone)],
    ['studentCard', student.studentCard ? '' : 'Student card is required.'],
  ])
}

export function checkCardFile(file) {
  if (!file) return 'No file was selected.'
  if (!CARD_TYPES.includes(file.type)) return 'Use a JPG, PNG or WEBP image of the card.'
  if (file.size > CARD_MAX_BYTES) return 'This image is larger than 5 MB.'
  return ''
}

export const formatBytes = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

export const roleLabel = (value) => activityRoles.find((role) => role.value && role.value === value)?.label || ''

export const institutionLabel = (team) => (team.institution === OTHER_INSTITUTION_ID
  ? text(team.customInstitution)
  : findInstitution(team.wilaya, team.institution)?.name || '')

export const wilayaLabel = (code) => {
  const wilaya = findWilaya(code)
  return wilaya ? `${wilaya.code} — ${wilaya.name}` : ''
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
