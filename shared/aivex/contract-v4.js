// AIVEX registration — Data Contract V4 (canonical).
//
// One module shared by the browser form, the API and the tests: versions,
// enums, limits, pure normalisers, the pure V4 payload validator, the
// frontend state/payload builders, the Storage path rule and the response
// shapes. See docs/aivex-data-contract-v4.md.
//
// A registration carries two classes of data:
//   OFFICIAL DATA               -> PostgreSQL, Word/PDF, admin views
//   INTERNAL VERIFICATION DATA  -> the three student card photos: private
//                                  Storage bucket, path/mime/size in
//                                  PostgreSQL, never printed, never public.
//
// No I/O here (no network, Storage or database), so the module runs as is
// in Vite, in a Vercel Function and under `node --test`. The browser may run
// these checks for UX; the API always re-runs them and is the authority.
//
// Form v3 (api/_lib/aivex-validation.js) is the legacy contract still served
// in production. A v3 payload is never converted into a v4 one: each
// validator refuses the other's version.

import { OTHER_INSTITUTION_ID, findInstitution, findWilaya } from '../../src/data/algeriaHigherEducation.js'

const frozen = (list) => Object.freeze([...list])

// --- Versions -----------------------------------------------------------

export const AIVEX_FORM = 'aivex'
export const AIVEX_FORM_VERSION = 4
export const AIVEX_LEGACY_FORM_VERSION = 3
// Server-side default edition. The API decides the edition of a
// registration (from this value or aivex_settings), never the browser.
export const AIVEX_EDITION = 2
// Official rule: a team is EXACTLY three students.
export const AIVEX_STUDENT_COUNT = 3
export const STUDENT_POSITIONS = frozen(Array.from({ length: AIVEX_STUDENT_COUNT }, (_, index) => index + 1))

// --- Enums (values stored in the database, never UI labels) --------------

export const ACTIVITY_OFFICIAL_ROLES = frozen(['sub_director_activities', 'activities_officer'])

export const REGISTRATION_STATUSES = frozen(['submitted', 'under_review', 'approved', 'rejected', 'cancelled'])
export const DEFAULT_REGISTRATION_STATUS = 'submitted'

// inscription -> Word/PDF -> print -> signature + stamp -> upload -> admin check
export const DOCUMENT_STATUSES = frozen([
  'not_generated',
  'generating',
  'awaiting_signature',
  'signed_document_uploaded',
  'under_review',
  'changes_required',
  'validated',
  'generation_failed',
  'expired',
])
export const DEFAULT_DOCUMENT_STATUS = 'not_generated'

// --- Payload shape --------------------------------------------------------

// Every object of the payload is closed: a key outside these lists (a legacy
// nationalId, registrationNumber, studyLevel...) is refused, never dropped.
export const V4_FIELDS = Object.freeze({
  envelope: frozen(['form', 'version', 'submissionId', 'submittedAt', 'source', 'answers']),
  answers: frozen(['team', 'activityOfficial', 'delegationHead', 'driver', 'students', 'consent']),
  team: frozen(['name', 'wilaya', 'institution']),
  wilaya: frozen(['code', 'name']),
  institution: frozen(['id', 'name', 'custom']),
  activityOfficial: frozen(['role', 'fullName', 'email', 'phone']),
  person: frozen(['fullName', 'phone', 'rfid']),
  student: frozen(['position', 'fullName', 'phone', 'bacYear', 'rfid', 'studentCard']),
})

// Owned by the server: sending one of them is a contract violation.
export const SERVER_AUTHORITATIVE_FIELDS = frozen([
  'id', 'reference', 'edition', 'formVersion', 'status', 'registrationStatus', 'documentStatus',
  'currentFormRevision', 'templateVersion', 'createdAt', 'updatedAt',
])

// Anti-bot field. The handler answers a neutral success before validation
// when it is filled, so the validator only tolerates the key, at the envelope
// and answers levels (where form v3 put it).
const HONEYPOT_FIELD = 'website'

export const DATA_CLASSES = Object.freeze({
  internalVerification: frozen(['answers.students[].studentCard']),
})

// --- Student card (INTERNAL VERIFICATION DATA) ---------------------------

export const studentCardField = (position) => `studentCard_${position}`
export const STUDENT_CARD_FIELDS = frozen(STUDENT_POSITIONS.map(studentCardField))
export const STUDENT_CARD_FIELD_PATTERN = new RegExp(`^studentCard_[1-${AIVEX_STUDENT_COUNT}]$`)

export const STUDENT_CARD_POLICY = Object.freeze({
  classification: 'internal_verification',
  required: true,
  printable: false,
  bucket: 'aivex-student-cards',
  publicBucket: false,
  maxBytes: 5 * 1024 * 1024,
  // Images only, as in form v3: the organisers ask for a photo of the card.
  // PDF stays out until they explicitly need it (open decision).
  types: Object.freeze({
    'image/jpeg': Object.freeze({ extension: 'jpg', extensions: frozen(['jpg', 'jpeg']) }),
    'image/png': Object.freeze({ extension: 'png', extensions: frozen(['png']) }),
    'image/webp': Object.freeze({ extension: 'webp', extensions: frozen(['webp']) }),
  }),
  mimeAliases: Object.freeze({ 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg' }),
})

// Multipart file name for a card: derived from the position and type, so the
// applicant's own file name (which may contain a name) never leaves the device.
export function studentCardUploadName(position, mime) {
  const type = STUDENT_CARD_POLICY.types[STUDENT_CARD_POLICY.mimeAliases[mime] || mime]
  return type ? `${studentCardField(position)}.${type.extension}` : studentCardField(position)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const isUuidV4 = (value) => typeof value === 'string' && UUID_V4_RE.test(value)

// Deterministic private path inside the bucket (no bucket prefix, no personal
// data): {registrationId}/student-{position}.{ext}. Never a public URL.
export function studentCardStoragePath(registrationId, position, mime) {
  const type = STUDENT_CARD_POLICY.types[mime]
  if (typeof registrationId !== 'string' || !UUID_RE.test(registrationId)
    || !STUDENT_POSITIONS.includes(position) || !type) {
    throw new TypeError('Invalid student card storage path input.')
  }
  return `${registrationId.toLowerCase()}/student-${position}.${type.extension}`
}

// --- Public reference (server-generated only) ----------------------------

// AX{edition}-{yy}-{8 uppercase hex}, e.g. AX2-26-A83F19C2. `token` must come
// from a server-side CSPRNG. submissionId is the technical idempotency key;
// the reference is the administrative identifier shown to people.
export const REGISTRATION_REFERENCE_PATTERN = /^AX[0-9]{1,2}-[0-9]{2}-[0-9A-F]{8}$/

export function formatRegistrationReference({ edition, year, token }) {
  const reference = `AX${edition}-${String(year % 100).padStart(2, '0')}-${String(token).toUpperCase()}`
  if (!REGISTRATION_REFERENCE_PATTERN.test(reference)) throw new TypeError('Invalid registration reference input.')
  return reference
}

export const isRegistrationReference = (value) => typeof value === 'string' && REGISTRATION_REFERENCE_PATTERN.test(value)

// --- Limits -------------------------------------------------------------

export const LIMITS = Object.freeze({
  teamName: frozen([2, 120]),
  customInstitution: frozen([3, 180]),
  fullName: frozen([3, 120]),
  email: 254,
  phoneInput: 40,
  // Technical bounds only: no RFID format has been confirmed by the organisers.
  rfid: frozen([1, 64]),
  source: 500,
  bacYearMin: 1990,
  bacYearAhead: 1,
})

// --- Normalisers (pure, identical in the browser and on the server) -------

const CONTROL_CHARS = /\p{Cc}/gu

// Trimmed, NFC, control characters and runs of whitespace folded to one space.
export const normalizeText = (value) => (typeof value === 'string'
  ? value.normalize('NFC').replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
  : '')

export const normalizeEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '')

// Separators removed, optional leading '+' kept: '0555 12 34 56' -> '0555123456',
// '+213 555 12 34 56' -> '+213555123456'. Always a string, never a Number.
export const normalizePhone = (value) => (typeof value === 'string' ? value.trim().replace(/[\s().-]/g, '') : '')

// An RFID is an identifier, not a quantity: a string, trimmed, nothing else
// (leading zeros and case are kept as typed).
export const normalizeRfid = (value) => (typeof value === 'string' ? value.trim() : '')

// Form inputs give '2023'; the payload carries the integer 2023. Anything
// else ('BAC 2023', '2023/2024', 2023.5) becomes null and fails validation.
export function normalizeBacYear(value) {
  if (Number.isInteger(value)) return value
  if (typeof value === 'string' && /^\d{4}$/.test(value.trim())) return Number(value.trim())
  return null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?\d{9,15}$/
const WILAYA_CODE_RE = /^(0[1-9]|[1-4][0-9]|5[0-8])$/

export const isValidEmail = (email) => email.length <= LIMITS.email && EMAIL_RE.test(email)
export const isValidPhone = (phone) => PHONE_RE.test(phone)
export const isValidRfid = (rfid) => rfid.length >= LIMITS.rfid[0] && rfid.length <= LIMITS.rfid[1]
  && !/\p{Cc}/u.test(rfid)

export const bacYearRange = (now = new Date()) => ({
  min: LIMITS.bacYearMin,
  max: now.getUTCFullYear() + LIMITS.bacYearAhead,
})

export function isValidBacYear(year, now = new Date()) {
  const { min, max } = bacYearRange(now)
  return Number.isInteger(year) && year >= min && year <= max
}

// --- Validator (pure: no database, no Storage, no network) ---------------

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const within = (text, [min, max]) => text.length >= min && text.length <= max
const pass = (value) => ({ ok: true, value })
const fail = (message, field) => ({ ok: false, status: 400, message, ...(field ? { field } : {}) })
const at = (path, key) => (path ? `${path}.${key}` : key)

function unexpectedKey(record, allowed, path) {
  for (const key of Object.keys(record)) {
    if (allowed.includes(key)) continue
    if (SERVER_AUTHORITATIVE_FIELDS.includes(key)) {
      return fail(`"${key}" is assigned by the server and must not be sent.`, at(path, key))
    }
    return fail(`Unexpected field "${key}": it is not part of AIVEX form v${AIVEX_FORM_VERSION}.`, at(path, key))
  }
  return null
}

function readPhone(value, label, field) {
  if (typeof value !== 'string' || value.trim().length > LIMITS.phoneInput) return fail(`${label}: enter a valid phone number.`, field)
  const phone = normalizePhone(value)
  return isValidPhone(phone) ? pass(phone) : fail(`${label}: enter a valid phone number.`, field)
}

function readFullName(value, label, field) {
  const fullName = normalizeText(value)
  return within(fullName, LIMITS.fullName) ? pass(fullName) : fail(`${label}: enter the full name (3 to 120 characters).`, field)
}

function readRfid(value, label, field) {
  // A JSON number has already lost its leading zeros: strings only.
  if (typeof value !== 'string') return fail(`${label}: the RFID must be sent as text.`, field)
  const rfid = normalizeRfid(value)
  return isValidRfid(rfid) ? pass(rfid) : fail(`${label}: enter the RFID (1 to 64 characters).`, field)
}

function readTeam(raw) {
  const path = 'answers.team'
  if (!isObject(raw)) return fail('Team: invalid data.', path)
  const extra = unexpectedKey(raw, V4_FIELDS.team, path)
  if (extra) return extra

  const name = normalizeText(raw.name)
  if (!within(name, LIMITS.teamName)) return fail('Please enter a team name (2 to 120 characters).', `${path}.name`)

  if (!isObject(raw.wilaya)) return fail('Please choose a valid wilaya.', `${path}.wilaya`)
  const wilayaExtra = unexpectedKey(raw.wilaya, V4_FIELDS.wilaya, `${path}.wilaya`)
  if (wilayaExtra) return wilayaExtra
  const code = typeof raw.wilaya.code === 'string' ? raw.wilaya.code.trim() : ''
  const wilaya = WILAYA_CODE_RE.test(code) ? findWilaya(code) : null
  if (!wilaya) return fail('Please choose a valid wilaya.', `${path}.wilaya.code`)

  const rawInstitution = raw.institution
  if (!isObject(rawInstitution)) return fail('Please choose a university or institution.', `${path}.institution`)
  const institutionExtra = unexpectedKey(rawInstitution, V4_FIELDS.institution, `${path}.institution`)
  if (institutionExtra) return institutionExtra
  if (typeof rawInstitution.custom !== 'boolean') return fail('Invalid institution data.', `${path}.institution.custom`)
  const id = typeof rawInstitution.id === 'string' ? rawInstitution.id.trim() : ''

  let institution
  if (rawInstitution.custom) {
    if (id !== OTHER_INSTITUTION_ID) return fail(`A custom institution must use the id "${OTHER_INSTITUTION_ID}".`, `${path}.institution.id`)
    const customName = normalizeText(rawInstitution.name)
    if (!within(customName, LIMITS.customInstitution)) {
      return fail('Please enter the institution name (3 to 180 characters).', `${path}.institution.name`)
    }
    institution = { id: OTHER_INSTITUTION_ID, name: customName, custom: true }
  } else {
    const listed = id && id !== OTHER_INSTITUTION_ID ? findInstitution(wilaya.code, id) : null
    if (!listed) return fail('Please choose a university or institution from the selected wilaya.', `${path}.institution.id`)
    // Official label from the dataset, whatever the request claimed.
    institution = { id: listed.id, name: listed.name, custom: false }
  }

  // Snapshot: the labels stored with the registration are the dataset labels
  // of the day, so old registrations stay readable if the dataset changes.
  return pass({ name, wilaya: { code: wilaya.code, name: wilaya.name }, institution })
}

function readActivityOfficial(raw) {
  const path = 'answers.activityOfficial'
  const label = 'Activity administration contact'
  if (!isObject(raw)) return fail(`${label}: invalid data.`, path)
  const extra = unexpectedKey(raw, V4_FIELDS.activityOfficial, path)
  if (extra) return extra

  const role = typeof raw.role === 'string' ? raw.role.trim() : ''
  if (!ACTIVITY_OFFICIAL_ROLES.includes(role)) return fail(`${label}: choose a role.`, `${path}.role`)

  const fullName = readFullName(raw.fullName, label, `${path}.fullName`)
  if (!fullName.ok) return fullName

  // Not unique: one official may register several teams (idempotency is
  // carried by submissionId, not by this address).
  const email = normalizeEmail(raw.email)
  if (!isValidEmail(email)) return fail(`${label}: enter a valid email address.`, `${path}.email`)

  const phone = readPhone(raw.phone, label, `${path}.phone`)
  if (!phone.ok) return phone

  return pass({ role, fullName: fullName.value, email, phone: phone.value })
}

// Head of delegation and driver: same record, identified by RFID (v4 never
// collects national ID numbers).
function readPerson(raw, key, label) {
  const path = `answers.${key}`
  if (!isObject(raw)) return fail(`${label}: invalid data.`, path)
  const extra = unexpectedKey(raw, V4_FIELDS.person, path)
  if (extra) return extra

  const fullName = readFullName(raw.fullName, label, `${path}.fullName`)
  if (!fullName.ok) return fullName
  const phone = readPhone(raw.phone, label, `${path}.phone`)
  if (!phone.ok) return phone
  const rfid = readRfid(raw.rfid, label, `${path}.rfid`)
  if (!rfid.ok) return rfid

  return pass({ fullName: fullName.value, phone: phone.value, rfid: rfid.value })
}

function readStudents(raw, now) {
  const path = 'answers.students'
  if (!Array.isArray(raw)) return fail('Invalid student list.', path)
  if (raw.length !== AIVEX_STUDENT_COUNT) return fail(`A team is exactly ${AIVEX_STUDENT_COUNT} students.`, path)

  const { min, max } = bacYearRange(now)
  const students = []
  const rfids = new Set()
  for (const [index, student] of raw.entries()) {
    const position = index + 1
    const base = `${path}[${index}]`
    const label = `Student ${position}`
    if (!isObject(student)) return fail(`${label}: invalid data.`, base)
    const extra = unexpectedKey(student, V4_FIELDS.student, base)
    if (extra) return extra

    if (student.position !== position) return fail(`${label}: the position must be ${position}.`, `${base}.position`)

    const fullName = readFullName(student.fullName, label, `${base}.fullName`)
    if (!fullName.ok) return fullName
    const phone = readPhone(student.phone, label, `${base}.phone`)
    if (!phone.ok) return phone

    // The payload carries an integer: '2023', 'BAC 2023' or '2023/2024' are refused.
    if (!Number.isInteger(student.bacYear) || student.bacYear < min || student.bacYear > max) {
      return fail(`${label}: enter the BAC year (${min} to ${max}).`, `${base}.bacYear`)
    }

    const rfid = readRfid(student.rfid, label, `${base}.rfid`)
    if (!rfid.ok) return rfid
    if (rfids.has(rfid.value)) return fail(`${label}: each student needs their own RFID.`, `${base}.rfid`)
    rfids.add(rfid.value)

    // The JSON only names the multipart part; the bytes travel separately.
    const cardField = studentCardField(position)
    if (student.studentCard !== cardField) return fail(`${label}: the student card must be sent as "${cardField}".`, `${base}.studentCard`)

    students.push({ position, fullName: fullName.value, phone: phone.value, bacYear: student.bacYear, rfid: rfid.value, studentCard: cardField })
  }
  return pass(students)
}

// Validates a form v4 envelope. Returns { ok: true, value } with a clean,
// explicitly rebuilt structure, or { ok: false, status: 400, message, field }
// where `field` is the payload path of the first problem.
export function validateRegistrationV4(body, { now = new Date() } = {}) {
  if (!isObject(body)) return fail('Invalid registration data.')
  if (body.form !== AIVEX_FORM) return fail('Invalid registration data.', 'form')
  if (body.version !== AIVEX_FORM_VERSION) {
    return fail(`This registration must use AIVEX form v${AIVEX_FORM_VERSION}. Please reload the page.`, 'version')
  }
  const extra = unexpectedKey(body, [...V4_FIELDS.envelope, HONEYPOT_FIELD], '')
  if (extra) return extra

  if (!isUuidV4(body.submissionId)) return fail('Invalid submission id.', 'submissionId')
  if (body.source !== undefined && typeof body.source !== 'string') return fail('Invalid registration data.', 'source')

  const { answers } = body
  if (!isObject(answers)) return fail('Invalid registration data.', 'answers')
  const answersExtra = unexpectedKey(answers, [...V4_FIELDS.answers, HONEYPOT_FIELD], 'answers')
  if (answersExtra) return answersExtra

  const team = readTeam(answers.team)
  if (!team.ok) return team
  const activityOfficial = readActivityOfficial(answers.activityOfficial)
  if (!activityOfficial.ok) return activityOfficial
  const delegationHead = readPerson(answers.delegationHead, 'delegationHead', 'Head of delegation')
  if (!delegationHead.ok) return delegationHead
  const driver = readPerson(answers.driver, 'driver', 'Driver')
  if (!driver.ok) return driver
  const students = readStudents(answers.students, now)
  if (!students.ok) return students
  if (answers.consent !== true) return fail('Please confirm the registration statement before submitting.', 'answers.consent')

  // submittedAt is informational only: the server stamps submitted_at itself.
  return pass({
    formVersion: AIVEX_FORM_VERSION,
    submissionId: body.submissionId.toLowerCase(),
    source: normalizeText(body.source).slice(0, LIMITS.source) || null,
    team: team.value,
    activityOfficial: activityOfficial.value,
    delegationHead: delegationHead.value,
    driver: driver.value,
    students: students.value,
    consent: true,
  })
}

// --- Response contract ----------------------------------------------------

// 201 new registration, 200 idempotent replay of the same submissionId,
// 400 validation (with `field`), 409 business conflict, 413/415 card file,
// 429 rate limit, 500 server error. Bodies never carry SQL, Supabase or
// stack details.
export const registrationResponsesV4 = Object.freeze({
  created: (reference) => ({ status: 201, body: { success: true, reference } }),
  replayed: (reference) => ({ status: 200, body: { success: true, reference, alreadyProcessed: true } }),
  failed: (status, message, field) => ({ status, body: { success: false, message, ...(field ? { field } : {}) } }),
})

// --- Frontend contract ----------------------------------------------------

export const createStudentStateV4 = (position) => ({
  position,
  fullName: '',
  phone: '',
  bacYear: '',
  rfid: '',
  studentCard: null,
})

// Initial form state: always three student records, no add/remove. The
// submissionId is created once and must survive retries and reloads of the
// same attempt; it is renewed only after a confirmed success or a reset.
export function createRegistrationStateV4({ submissionId = globalThis.crypto.randomUUID() } = {}) {
  return {
    submissionId,
    team: { name: '', wilaya: '', institution: '', customInstitution: '' },
    activityOfficial: { role: '', fullName: '', email: '', phone: '' },
    delegationHead: { fullName: '', phone: '', rfid: '' },
    driver: { fullName: '', phone: '', rfid: '' },
    students: STUDENT_POSITIONS.map(createStudentStateV4),
    consent: false,
  }
}

// Canonical JSON envelope (the `payload` multipart part). No reference, no
// edition, no status: those belong to the server.
export function buildRegistrationPayloadV4(state, { now = new Date(), source } = {}) {
  const { team, activityOfficial, delegationHead, driver, students } = state
  const wilaya = findWilaya(team.wilaya)
  const custom = team.institution === OTHER_INSTITUTION_ID
  const listed = custom ? null : findInstitution(team.wilaya, team.institution)
  const person = (record) => ({
    fullName: normalizeText(record.fullName),
    phone: normalizePhone(record.phone),
    rfid: normalizeRfid(record.rfid),
  })

  return {
    form: AIVEX_FORM,
    version: AIVEX_FORM_VERSION,
    submissionId: state.submissionId,
    submittedAt: now.toISOString(),
    ...(source ? { source } : {}),
    answers: {
      team: {
        name: normalizeText(team.name),
        wilaya: { code: wilaya?.code ?? '', name: wilaya?.name ?? '' },
        institution: custom
          ? { id: OTHER_INSTITUTION_ID, name: normalizeText(team.customInstitution), custom: true }
          : { id: listed?.id ?? '', name: listed?.name ?? '', custom: false },
      },
      activityOfficial: {
        role: activityOfficial.role,
        fullName: normalizeText(activityOfficial.fullName),
        email: normalizeEmail(activityOfficial.email),
        phone: normalizePhone(activityOfficial.phone),
      },
      delegationHead: person(delegationHead),
      driver: person(driver),
      students: students.map((student) => ({
        position: student.position,
        fullName: normalizeText(student.fullName),
        phone: normalizePhone(student.phone),
        bacYear: normalizeBacYear(student.bacYear),
        rfid: normalizeRfid(student.rfid),
        studentCard: studentCardField(student.position),
      })),
      consent: state.consent === true,
    },
  }
}

// The file parts: [{ field: 'studentCard_1', file, filename: 'studentCard_1.jpg' }, ...].
export function buildStudentCardPartsV4(state) {
  return state.students
    .filter((student) => student.studentCard)
    .map((student) => ({
      field: studentCardField(student.position),
      file: student.studentCard,
      filename: studentCardUploadName(student.position, student.studentCard.type),
    }))
}
