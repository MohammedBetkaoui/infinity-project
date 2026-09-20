// AIVEX form v4 — contract, API and form tests (node --test, no network, no database).
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import {
  ACTIVITY_OFFICIAL_ROLES, AIVEX_EDITION, AIVEX_FORM_VERSION, AIVEX_STUDENT_COUNT, DATA_CLASSES, DEFAULT_DOCUMENT_STATUS,
  DEFAULT_REGISTRATION_STATUS, DOCUMENT_STATUSES, LEGACY_V3_FIELDS, REGISTRATION_FILE_FIELD_PATTERN, REGISTRATION_MAX_FILES,
  REGISTRATION_STATUSES, STUDENT_CARD_FIELDS, STUDENT_CARD_POLICY, V4_FIELDS, bacYearChoices, buildRegistrationPayloadV4,
  createRegistrationStateV4, createSubmissionId, isUuidV4, isValidBacYear, normalizeBacYear, normalizeEmail, normalizePhone,
  normalizeRfid, normalizeText, registrationResponsesV4, studentCardFileIssue, studentCardStoragePath, studentCardUploadName,
  identityCardUploadName,
  validateRegistrationV4,
} from '../shared/aivex/contract-v4.js'
import { WORD_EXCLUDED_FIELDS_V4, WORD_VARIABLES_V4, resolveWordDataV4 } from '../shared/aivex/word-mapping-v4.js'
import { REGISTRATION_REFERENCE_PATTERN, generateRegistrationReference } from '../api/_lib/aivex-reference.js'
import {
  STALE_AFTER_MS, registerV4, registrationFingerprint, toRegistrationRow, toStudentRows,
} from '../api/_lib/aivex-registration-v4.js'
import { validateRegistrationFilesV4, validateStudentCardsV4 } from '../api/_lib/aivex-validation-v4.js'
import { parseMultipart } from '../api/_lib/multipart.js'
import { createRegisterHandler } from '../api/aivex/register.js'
import {
  CARD_TYPES, DRAFT_KEY, FORM_VERSION, LEGACY_DRAFT_KEYS, SECTIONS, STUDENT_COUNT, STUDENT_FIELDS, STUDENT_TEXT_FIELDS,
  buildSubmission, checkCardFile, personIssues, studentIssues,
} from '../src/pages/aivex/register/registrationModel.js'
import { getBacYearOptions, getRegistrationStrings, registrationStrings } from '../src/pages/aivex/register/registrationI18n.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const NOW = new Date('2026-09-18T10:00:00Z')
// Letters and spaces only (a name never holds a digit); student RFIDs are exactly eight digits, leading zeros kept.
const STUDENT_NAMES = ['Student Number One', 'Student Number Two', 'Student Number Three']
const studentRfid = (position) => `0000000${position}`
const SUBMISSION_ID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'
const OTHER_SUBMISSION_ID = '9b1d2c3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e'
const REGISTRATION_ID = '6c1f0e2a-7b3d-4c5e-9f8a-0b1c2d3e4f5a'

// Tiny but real files: the API reads their magic bytes.
const IMAGES = {
  jpeg: Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'),
  png: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  webp: Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64'),
  pdf: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'),
}

// The canonical v4 payload (the `payload` multipart part).
const validPayload = (overrides = {}) => ({
  submissionId: SUBMISSION_ID,
  edition: 2,
  formVersion: 4,
  team: {
    name: 'Infinity AI',
    wilaya: { code: '34', name: 'Bordj Bou Arréridj' },
    institution: { id: 'univ-bba', name: 'Université Mohamed El Bachir El Ibrahimi', custom: false },
  },
  activityOfficial: { role: 'activities_officer', fullName: 'Amina Benali', email: 'activities@univ-bba.dz', phone: '0555 12 34 56' },
  delegationHead: { fullName: 'Karim Haddad', phone: '0661 23 45 67', rfid: '00471236', idCard: 'delegationHeadIdCard' },
  driver: { fullName: 'Nabil Saidi', phone: '0770 11 22 33', rfid: 'A1B2C3D4', idCard: 'driverIdCard' },
  students: [1, 2, 3].map((position) => ({
    position,
    fullName: STUDENT_NAMES[position - 1],
    phone: `0550 00 00 0${position}`,
    bacYear: 2021 + position,
    rfid: studentRfid(position),
    studentCard: `studentCard_${position}`,
  })),
  consent: true,
  ...overrides,
})

// A production v3 payload, as the previous form sent it.
const v3Payload = () => ({
  form: 'aivex',
  version: 3,
  reference: 'AX-MFX3K2-AB12',
  answers: {
    team: validPayload().team,
    activityOfficial: validPayload().activityOfficial,
    delegationHead: { fullName: 'Karim Haddad', phone: '0661234567', nationalId: '123456789' },
    driver: { fullName: 'Nabil Saidi', phone: '0770112233', nationalId: '987654321' },
    students: [1, 2, 3].map((position) => ({
      position, fullName: `Student Number ${position}`, registrationNumber: `20213304609${position}`,
      studyLevel: 'Licence 3', phone: `055000000${position}`, studentCard: `studentCard_${position}`,
    })),
    consent: true,
  },
})

const validate = (payload) => validateRegistrationV4(payload)
const withChange = (change) => {
  const payload = validPayload()
  change(payload)
  return validate(payload)
}
const rejects = (result, field, status = 400) => {
  assert.equal(result.ok, false, `expected a rejection on ${field}`)
  assert.equal(result.status, status)
  assert.equal(result.field, field)
  assert.equal(typeof result.message, 'string')
}
const validStudents = () => validate(validPayload()).value.students
const cardFiles = (overrides = {}) => new Map(STUDENT_CARD_FIELDS.map((field) => [field, {
  buffer: IMAGES.jpeg, mimeType: 'image/jpeg', filename: `${field}.jpg`, ...overrides[field],
}]))

// --- In-memory store: the constraints of the database that matter here ----------
function createMemoryStore() {
  const registrations = []
  const students = []
  const objects = new Map()
  const identityObjects = new Map()
  let nextId = 0
  const store = {
    registrations, students, objects, identityObjects,
    async findBySubmissionId(submissionId) {
      const row = registrations.find((entry) => entry.submission_id === submissionId)
      if (!row) return null
      return {
        id: row.id,
        reference: row.reference,
        fingerprint: row.submission_fingerprint,
        createdAt: row.created_at,
        studentCount: students.filter((entry) => entry.registration_id === row.id).length,
        identityCardPaths: [row.delegation_head_id_card_path, row.driver_id_card_path].filter(Boolean),
      }
    },
    async insertRegistration(row) {
      // UNIQUE(submission_id), UNIQUE(reference) — and NOT unique on the e-mail.
      if (registrations.some((entry) => entry.submission_id === row.submission_id || entry.reference === row.reference)) {
        return { ok: false, duplicate: true, code: '23505' }
      }
      // The API generates the registration id: the identity card paths name it.
      const id = row.id || `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`
      registrations.push({ ...row, id, created_at: row.submitted_at })
      return { ok: true, id, reference: row.reference }
    },
    async uploadCard(path, buffer, mime) {
      if (objects.has(path)) throw Object.assign(new Error('exists'), { code: 'Duplicate' })
      objects.set(path, { size: buffer.length, mime })
    },
    async uploadIdentityCard(path, buffer, mime) {
      if (identityObjects.has(path)) throw Object.assign(new Error('exists'), { code: 'Duplicate' })
      identityObjects.set(path, { size: buffer.length, mime })
    },
    async insertStudents(rows) {
      if (rows.length !== AIVEX_STUDENT_COUNT) throw Object.assign(new Error('team size'), { code: '23514' })
      students.push(...rows)
    },
    async removeCards(paths) { paths.forEach((path) => objects.delete(path)) },
    async removeIdentityCards(paths) { paths.forEach((path) => identityObjects.delete(path)) },
    async deleteRegistration(id) {
      registrations.splice(registrations.findIndex((entry) => entry.id === id), 1)
      for (let index = students.length - 1; index >= 0; index -= 1) if (students[index].registration_id === id) students.splice(index, 1)
    },
  }
  return store
}

// --- HTTP helper: a real multipart request through the real handler ------------
let ipCounter = 0
const pngCards = (overrides = {}) => [
  ...[1, 2, 3].map((position) => ({
    field: `studentCard_${position}`, buffer: IMAGES.png, type: 'image/png', filename: `studentCard_${position}.png`, ...overrides[position],
  })),
  ...['delegationHeadIdCard', 'driverIdCard'].map((field) => ({
    field, buffer: IMAGES.png, type: 'image/png', filename: `${field}.png`, ...overrides[field],
  })),
]

// Builds the real multipart request and hands it to the real handler.
// `fields` is [{ name, value }] for the non-file parts (normally just
// `payload`); a raw variant so a test can omit or malform that part.
async function postForm(handler, fields, cards = pngCards()) {
  const form = new FormData()
  for (const { name, value } of fields) form.append(name, value)
  for (const { field, buffer, type, filename } of cards) form.append(field, new Blob([buffer], { type }), filename)
  const response = new Response(form)
  const req = Readable.from([Buffer.from(await response.arrayBuffer())])
  ipCounter += 1
  Object.assign(req, {
    method: 'POST',
    headers: {
      'content-type': response.headers.get('content-type'),
      'x-forwarded-for': `203.0.113.${ipCounter}`,
      referer: 'https://infinity-project-zeta.vercel.app/aivex/register?utm=x',
    },
    socket: {},
  })
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value },
      end(body) { resolve({ status: this.statusCode, body: JSON.parse(body), headers: this.headers }) },
    }
    handler(req, res)
  })
}

const post = (handler, payload, cards = pngCards()) => postForm(handler, [{ name: 'payload', value: JSON.stringify(payload) }], cards)

const makeApi = () => {
  const store = createMemoryStore()
  delete process.env.VERCEL
  // No document store: these tests cover the registration contract only (see
  // tests/aivex-document-generation.test.mjs), and must never reach a real
  // Supabase project even if the shell happens to export its credentials.
  return { store, handler: createRegisterHandler({ createStore: () => store, createDocumentStore: () => null, now: () => NOW }) }
}

// =================================================================================
// Required scenarios (API, real multipart through the real handler)
// =================================================================================

test('1. a valid v4 submission is stored and answered 201 with a server reference', async () => {
  const { store, handler } = makeApi()
  const { status, body } = await post(handler, validPayload())
  assert.equal(status, 201)
  assert.equal(body.success, true)
  assert.match(body.reference, REGISTRATION_REFERENCE_PATTERN)

  assert.equal(store.registrations.length, 1)
  const [row] = store.registrations
  assert.equal(row.reference, body.reference)
  assert.equal(row.submission_id, SUBMISSION_ID)
  assert.equal(row.edition, 2)
  assert.equal(row.form_version, 4)
  assert.equal(row.registration_status, 'submitted')
  assert.equal(row.document_status, 'not_generated')
  assert.equal(row.delegation_head_rfid, '00471236')
  assert.equal(row.source, 'https://infinity-project-zeta.vercel.app/aivex/register')
  assert.match(row.submission_fingerprint, /^[0-9a-f]{64}$/)

  assert.equal(store.students.length, 3)
  assert.deepEqual(store.students.map((student) => student.student_card_path),
    [1, 2, 3].map((position) => `edition-2/${row.id}/student-${position}.png`))
  assert.deepEqual([...store.objects.keys()], store.students.map((student) => student.student_card_path))
  assert.deepEqual(store.students.map((student) => [student.bac_year, student.rfid_number]), [[2022, '00000001'], [2023, '00000002'], [2024, '00000003']])
  assert.doesNotMatch(JSON.stringify(body), /edition-2\/|student-1\.png/, 'no Storage path in the response')
})

test('1b. a request with no payload part is refused, nothing written', async () => {
  const { store, handler } = makeApi()
  const { status, body } = await postForm(handler, [])
  assert.equal(status, 400)
  assert.equal(body.success, false)
  assert.doesNotMatch(body.message, /json|parse|syntax/i, 'no parser internals in the message')
  assert.equal(store.registrations.length, 0)
})

test('1c. a payload part that is not valid JSON is refused, nothing written', async () => {
  const { store, handler } = makeApi()
  const { status, body } = await postForm(handler, [{ name: 'payload', value: '{not valid json' }])
  assert.equal(status, 400)
  assert.equal(body.success, false)
  assert.doesNotMatch(body.message, /json|parse|syntax/i, 'no parser internals in the message')
  assert.equal(store.registrations.length, 0)
})

for (const position of [1, 2, 3]) {
  test(`${1 + position}. a missing studentCard_${position} is refused before anything is written`, async () => {
    const { store, handler } = makeApi()
    const { status, body } = await post(handler, validPayload(), pngCards().filter((card) => card.field !== `studentCard_${position}`))
    assert.equal(status, 400)
    assert.equal(body.field, `studentCard_${position}`)
    assert.equal(store.registrations.length + store.objects.size, 0)
  })
}

test('5. an invalid MIME type is refused (declared type and real bytes)', async () => {
  const { handler } = makeApi()
  const pdf = await post(handler, validPayload(), pngCards({ 2: { buffer: IMAGES.pdf, type: 'application/pdf', filename: 'studentCard_2.pdf' } }))
  assert.equal(pdf.status, 415)
  assert.equal(pdf.body.field, 'studentCard_2')

  const lying = await post(handler, validPayload(), pngCards({ 3: { type: 'image/jpeg', filename: 'studentCard_3.jpg' } }))
  assert.equal(lying.status, 415)
  assert.equal(lying.body.field, 'studentCard_3')
})

test('6. a file larger than 5 MB is refused', async () => {
  const { store, handler } = makeApi()
  const big = Buffer.concat([IMAGES.png, Buffer.alloc(STUDENT_CARD_POLICY.maxBytes)])
  const { status } = await post(handler, validPayload(), pngCards({ 1: { buffer: big } }))
  assert.equal(status, 413)
  assert.equal(store.registrations.length, 0)
  // Same rule applied to a received part by the card validator.
  const direct = await validateStudentCardsV4(validStudents(), cardFiles({ studentCard_1: { buffer: Buffer.concat([IMAGES.jpeg, Buffer.alloc(STUDENT_CARD_POLICY.maxBytes)]) } }))
  assert.equal(direct.status, 413)
  assert.equal(direct.field, 'studentCard_1')
})

test('7. a team that is not exactly three students is refused (fewer or more)', async () => {
  const { store, handler } = makeApi()
  const two = validPayload()
  two.students.pop()
  const fewer = await post(handler, two, pngCards().filter((card) => card.field !== 'studentCard_3'))
  assert.equal(fewer.status, 400)
  assert.equal(fewer.body.field, 'students')

  // Four students in the payload, still three files: the JSON shape fails first.
  const four = validPayload()
  four.students.push({ ...four.students[0], position: 4, studentCard: 'studentCard_4' })
  const more = await post(handler, four)
  assert.equal(more.status, 400)
  assert.equal(more.body.field, 'students')

  // A sixth file is refused by the multipart layer itself (maxFiles = 5: three
  // student cards and two identity cards), before the JSON is even parsed.
  const extraFile = await post(handler, validPayload(), [...pngCards(), { field: 'studentCard_4', buffer: IMAGES.png, type: 'image/png', filename: 'studentCard_4.png' }])
  assert.equal(extraFile.status, 413)
  assert.equal(REGISTRATION_MAX_FILES, 5)
  assert.equal(store.registrations.length, 0)
})

test('8. a missing BAC year is refused', async () => {
  const { handler } = makeApi()
  const payload = validPayload()
  delete payload.students[1].bacYear
  const { status, body } = await post(handler, payload)
  assert.equal(status, 400)
  assert.equal(body.field, 'students[1].bacYear')
  assert.match(body.message, /required/)
})

test('9. an invalid BAC year is refused (integers from 2019 to 2026 only, whatever the date)', () => {
  for (const bad of ['2023', 'BAC 2023', '2023/2024', 2023.5, 1989, 1990, 2018, 2027, 2028, null]) {
    rejects(withChange((p) => { p.students[0].bacYear = bad }), 'students[0].bacYear')
  }
  for (const good of [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]) assert.equal(withChange((p) => { p.students[0].bacYear = good }).ok, true, `bacYear ${good}`)
})

test('10. a missing RFID is refused (students, head of delegation, driver)', () => {
  rejects(withChange((p) => { delete p.students[2].rfid }), 'students[2].rfid')
  rejects(withChange((p) => { delete p.delegationHead.rfid }), 'delegationHead.rfid')
  rejects(withChange((p) => { delete p.driver.rfid }), 'driver.rfid')
})

test('11. an empty RFID is refused, and an RFID is always text', () => {
  rejects(withChange((p) => { p.students[0].rfid = '' }), 'students[0].rfid')
  rejects(withChange((p) => { p.driver.rfid = '   ' }), 'driver.rfid')
  const numeric = withChange((p) => { p.students[0].rfid = 1239876 })
  rejects(numeric, 'students[0].rfid')
  assert.match(numeric.message, /text/)
  rejects(withChange((p) => { p.driver.rfid = 'x'.repeat(65) }), 'driver.rfid')
})

test('12. an activity role outside the two internal values is refused', () => {
  for (const role of ['Activities Officer', 'مسؤول النشاطات', 'president', '', undefined]) {
    rejects(withChange((p) => { p.activityOfficial.role = role }), 'activityOfficial.role')
  }
  for (const role of ACTIVITY_OFFICIAL_ROLES) assert.equal(withChange((p) => { p.activityOfficial.role = role }).ok, true)
})

test('13. consent must be exactly true', () => {
  for (const value of [false, 'true', 1, undefined]) rejects(withChange((p) => { p.consent = value }), 'consent')
})

test('14. an invalid submissionId is refused', () => {
  for (const bad of ['abc', '', 42, undefined, '3f2b8c1e-9a4d-1e6f-8b2a-1c3d5e7f9a0b', '3f2b8c1e9a4d4e6f8b2a1c3d5e7f9a0b']) {
    rejects(withChange((p) => { p.submissionId = bad }), 'submissionId')
  }
  assert.equal(withChange((p) => { p.submissionId = SUBMISSION_ID.toUpperCase() }).value.submissionId, SUBMISSION_ID)
})

test('15. formVersion other than 4 is refused', () => {
  for (const bad of [3, '4', 5, undefined]) rejects(withChange((p) => { p.formVersion = bad }), 'formVersion')
})

test('16. edition other than 2 is refused', () => {
  assert.equal(AIVEX_EDITION, 2)
  for (const bad of [1, 3, '2', undefined]) rejects(withChange((p) => { p.edition = bad }), 'edition')
})

test('17. a duplicate submissionId returns the same reference and creates nothing new', async () => {
  const { store, handler } = makeApi()
  const first = await post(handler, validPayload())
  const again = await post(handler, validPayload())
  assert.equal(first.status, 201)
  assert.deepEqual(again, { status: 200, body: { success: true, reference: first.body.reference, alreadyProcessed: true }, headers: again.headers })
  assert.equal(store.registrations.length, 1)
  assert.equal(store.students.length, 3)
  assert.equal(store.objects.size, 3)

  // Same submissionId, different answers: refused, existing reference given back.
  const edited = await post(handler, validPayload({ team: { ...validPayload().team, name: 'Other Team' } }))
  assert.equal(edited.status, 409)
  assert.ok(edited.body.message.includes(first.body.reference))
  assert.equal(store.registrations.length, 1)
})

test('18. the same activity e-mail with another submissionId is accepted', async () => {
  const { store, handler } = makeApi()
  const first = await post(handler, validPayload())
  const second = await post(handler, validPayload({ submissionId: OTHER_SUBMISSION_ID }))
  assert.equal(first.status, 201)
  assert.equal(second.status, 201)
  assert.notEqual(first.body.reference, second.body.reference)
  assert.equal(store.registrations.length, 2)
  assert.equal(new Set(store.registrations.map((row) => row.activity_official_email)).size, 1)
})

test('19. an old v3 payload is never accepted as v4', async () => {
  const { store, handler } = makeApi()
  const { status, body } = await post(handler, v3Payload())
  assert.equal(status, 400)
  assert.equal(body.field, 'formVersion')
  assert.equal(store.registrations.length, 0)
  // Even relabelled as v4, the v3 envelope does not pass.
  rejects(validate({ ...v3Payload(), formVersion: 4, edition: 2 }), 'form')
})

test('20. forbidden v3 fields are refused and never reach the database mapping', async () => {
  for (const [path, change] of [
    ['delegationHead.nationalId', (p) => { p.delegationHead.nationalId = '123456789' }],
    ['driver.nationalId', (p) => { p.driver.nationalId = '123456789' }],
    ['students[0].registrationNumber', (p) => { p.students[0].registrationNumber = '202133046094' }],
    ['students[1].studyLevel', (p) => { p.students[1].studyLevel = 'Licence 3' }],
    ['students[2].isLeader', (p) => { p.students[2].isLeader = true }],
    ['answers', (p) => { p.answers = {} }],
  ]) {
    const result = withChange(change)
    rejects(result, path)
    assert.match(result.message, /old registration form/)
  }
  const { store, handler } = makeApi()
  const payload = validPayload()
  payload.delegationHead.nationalId = '123456789'
  assert.equal((await post(handler, payload)).status, 400)
  assert.equal(store.registrations.length, 0)

  // The canonical mapper only emits v4 columns.
  const value = validate(validPayload()).value
  const row = toRegistrationRow(value, { reference: 'AIVEX2-TEST0000', fingerprint: 'f'.repeat(64), source: null, now: NOW })
  const studentRows = toStudentRows(REGISTRATION_ID, value, [1, 2, 3].map((position) => ({ position, path: 'p', mime: 'image/png', size: 1 })))
  assert.doesNotMatch(JSON.stringify([row, studentRows]), /national|registration_number|study_level|leader/i)
})

// =================================================================================
// Contract: frontend buildSubmission() -> backend validator, one source of truth
// =================================================================================

const filledState = () => {
  const state = createRegistrationStateV4({ submissionId: SUBMISSION_ID })
  Object.assign(state.team, { name: ' Infinity  AI ', wilaya: '34', institution: 'univ-bba' })
  Object.assign(state.activityOfficial, { role: 'sub_director_activities', fullName: 'Amina Benali', email: ' Amina@Univ-BBA.dz', phone: '0555 12 34 56' })
  Object.assign(state.delegationHead, {
    fullName: 'Karim Haddad', phone: '0661 23 45 67', rfid: ' 00471236 ', idCard: new File([IMAGES.png], 'CNI_karim_haddad.PNG', { type: 'image/png' }),
  })
  Object.assign(state.driver, {
    fullName: 'Nabil Saidi', phone: '0770 11 22 33', rfid: '0099', idCard: new File([IMAGES.jpeg], 'nabil-saidi-id.jpg', { type: 'image/jpeg' }),
  })
  state.students.forEach((student) => Object.assign(student, {
    fullName: STUDENT_NAMES[student.position - 1],
    phone: `0550 00 00 0${student.position}`,
    bacYear: String(2021 + student.position),
    rfid: ` ${studentRfid(student.position)} `,
    studentCard: new File([IMAGES.png], `IMG_000${student.position}.PNG`, { type: 'image/png' }),
  }))
  state.consent = true
  return state
}

test('contract: the form builds exactly the payload the API validates', () => {
  const { payload, files } = buildSubmission(filledState())
  assert.deepEqual(Object.keys(payload), [...V4_FIELDS.registration])
  assert.equal(payload.formVersion, AIVEX_FORM_VERSION)
  assert.equal(payload.edition, AIVEX_EDITION)
  assert.equal(payload.submissionId, SUBMISSION_ID)
  assert.equal(payload.students[1].bacYear, 2023)
  assert.equal(payload.delegationHead.rfid, '00471236')
  assert.equal('reference' in payload, false)
  assert.doesNotMatch(JSON.stringify(payload), /nationalId|registrationNumber|studyLevel|base64|data:image/)
  for (const key of V4_FIELDS.student) assert.ok(key in payload.students[0], key)

  const result = validate(payload)
  assert.equal(result.ok, true, result.message)
  assert.equal(result.value.team.name, 'Infinity AI')
  assert.equal(result.value.activityOfficial.email, 'amina@univ-bba.dz')

  // Files travel as their own parts, never inside the JSON: the three student
  // cards, then the two identity cards (the payload only names their parts).
  assert.deepEqual(files.map(({ field }) => field), ['studentCard_1', 'studentCard_2', 'studentCard_3', 'delegationHeadIdCard', 'driverIdCard'])
  assert.deepEqual(files.filter(({ position }) => position).map(({ position }) => position), [1, 2, 3])
  assert.deepEqual(files.filter(({ subject }) => subject).map(({ subject }) => subject), ['delegationHead', 'driver'])
  assert.ok(files.every(({ file }) => file instanceof File))
  assert.equal(payload.delegationHead.idCard, 'delegationHeadIdCard')
  assert.equal(payload.driver.idCard, 'driverIdCard')
  assert.doesNotMatch(JSON.stringify(payload), /CNI_karim|nabil-saidi-id/, "the applicant's own file names never leave the device")
})

test('contract: multipart payload + the five image parts survive the real parser, with derived file names', async () => {
  const state = filledState()
  const { payload, files } = buildSubmission(state)
  const form = new FormData()
  form.append('payload', JSON.stringify(payload))
  for (const { field, position, file } of files) {
    form.append(field, file, position ? studentCardUploadName(position, file.type) : identityCardUploadName(field, file.type))
  }

  const response = new Response(form)
  const req = Readable.from([Buffer.from(await response.arrayBuffer())])
  req.headers = { 'content-type': response.headers.get('content-type') }
  const parsed = await parseMultipart(req, {
    maxFileBytes: STUDENT_CARD_POLICY.maxBytes,
    maxFiles: REGISTRATION_MAX_FILES,
    maxRequestBytes: 30 * 1024 * 1024,
    allowedFields: new Set(['payload']),
    fileFieldPattern: REGISTRATION_FILE_FIELD_PATTERN,
  })
  assert.deepEqual([...parsed.files.values()].map((file) => file.filename),
    ['studentCard_1.png', 'studentCard_2.png', 'studentCard_3.png', 'delegationHeadIdCard.png', 'driverIdCard.jpg'])
  const registration = validate(JSON.parse(parsed.fields.payload))
  assert.equal(registration.ok, true, registration.message)
  const checked = await validateRegistrationFilesV4(registration.value.students, parsed.files)
  assert.equal(checked.ok, true, checked.message)
  assert.deepEqual(checked.identityCards.map((card) => [card.subject, card.mime]), [['delegationHead', 'image/png'], ['driver', 'image/jpeg']])
})

test('contract: versions and the student count are defined once, in the shared contract', async () => {
  assert.equal(FORM_VERSION, AIVEX_FORM_VERSION)
  assert.equal(STUDENT_COUNT, AIVEX_STUDENT_COUNT)
  const files = [
    ...(await readdir(new URL('../src/pages/aivex/register/', import.meta.url))).map((name) => `src/pages/aivex/register/${name}`),
    'api/aivex/register.js', 'api/_lib/aivex-validation-v4.js', 'api/_lib/aivex-registration-v4.js', 'api/_lib/aivex-reference.js',
    'src/lib/applicationSubmission.js',
  ].filter((file) => /\.(js|jsx)$/.test(file))
  for (const file of files) {
    const source = await read(file)
    assert.doesNotMatch(source, /(FORM_VERSION|EDITION|STUDENT_COUNT)\s*=\s*\d/, `${file} redefines a contract constant`)
    assert.doesNotMatch(source, /\b(nationalId|registrationNumber|studyLevel|isLeader)\b/, `${file} still uses a v3 field`)
  }
  await assert.rejects(readFile(new URL('../api/_lib/aivex-validation.js', import.meta.url)), 'the v3 validator is gone')
  await assert.rejects(readFile(new URL('../src/pages/aivex/register/formVersion.js', import.meta.url)), 'no v3/v4 switch anymore')
})

test('contract: frontend field checks agree with the API validator', () => {
  // Head of delegation: phone, delegation RFID (any text up to 64 characters) and name.
  const samples = {
    phone: ['0555 12 34 56', '0555-12-34-56', '0555.12.34.56', '0661234567', '+213 555 12 34 56', '+213555123456', '12345', '05a5 12 34 56',
      '055512345', '05551234567', '0455123456', '0855123456', '1234567890', '', '   ', `0555${' '.repeat(40)}123456`],
    rfid: ['00471236', 'A1B2C3D4', ' 0047 ', '', '   ', 'x'.repeat(64), 'x'.repeat(65), 'AB\u0000CD'],
    fullName: ['Karim Haddad', 'Al', 'Al1', '   ', 'K'.repeat(120), 'K'.repeat(121), 'Karim123', 'Karim_Haddad', 'عبد الرحمان', 'عبد-الرحمان'],
  }
  for (const [field, values] of Object.entries(samples)) {
    for (const value of values) {
      const frontendOk = !personIssues({ fullName: 'Karim Haddad', phone: '0661234567', rfid: '00471236', [field]: value })[field]
      const backendOk = withChange((p) => { p.delegationHead[field] = value }).ok
      assert.equal(frontendOk, backendOk, `delegationHead.${field} = ${JSON.stringify(value)}`)
    }
  }
  const students = filledState().students
  for (const bacYear of ['1989', '1990', '2018', '2019', '2026', '2027', '2028', 'BAC 2023', '']) {
    const frontendOk = !studentIssues({ ...students[0], bacYear }, students).bacYear
    const backendOk = withChange((p) => { p.students[0].bacYear = normalizeBacYear(bacYear) ?? bacYear }).ok
    assert.equal(frontendOk, backendOk, `bacYear ${bacYear}`)
  }
  // Student RFID: exactly eight digits, in the form and in the API alike.
  for (const rfid of ['12345678', '00123456', '00000001', '1234567', '123456789', '1234ABCD', '1234 5678', '1234567A', '', '   ', ' 12345678 ']) {
    const frontendOk = !studentIssues({ ...students[0], rfid }, [students[0]]).rfid
    const backendOk = withChange((p) => { p.students[0].rfid = rfid }).ok
    assert.equal(frontendOk, backendOk, `students[0].rfid = ${JSON.stringify(rfid)}`)
  }
  // Student names and phones follow the same shared rules as the delegation's.
  for (const value of ['Amina Benali', 'محمد أمين', 'Amina2', 'Amina@', 'Am']) {
    const frontendOk = !studentIssues({ ...students[0], fullName: value }, students).fullName
    assert.equal(frontendOk, withChange((p) => { p.students[0].fullName = value }).ok, `students[0].fullName = ${value}`)
  }
  for (const value of ['0550000001', '+213550000001', '0450000001']) {
    const frontendOk = !studentIssues({ ...students[0], phone: value }, students).phone
    assert.equal(frontendOk, withChange((p) => { p.students[0].phone = value }).ok, `students[0].phone = ${value}`)
  }
})

test('contract: the card check is the same in the form and in the API', async () => {
  const cases = [
    [{ type: 'image/png', size: 10 }, ''],
    [{ type: 'image/jpg', size: 10 }, ''],
    [{ type: 'application/pdf', size: 10 }, 'type'],
    [{ type: 'image/heic', size: 10 }, 'type'],
    [{ type: 'image/webp', size: 0 }, 'empty'],
    [{ type: 'image/jpeg', size: STUDENT_CARD_POLICY.maxBytes + 1 }, 'size'],
    [null, 'missing'],
  ]
  for (const [file, issue] of cases) {
    assert.equal(studentCardFileIssue(file), issue, JSON.stringify(file))
    assert.equal(Boolean(checkCardFile(file)), Boolean(issue), 'form message')
  }
  assert.deepEqual(CARD_TYPES, ['image/jpeg', 'image/png', 'image/webp'])
  assert.equal(STUDENT_CARD_POLICY.maxBytes, 5 * 1024 * 1024)

  const status = { type: 415, empty: 400, size: 413 }
  for (const [issue, file] of [
    ['type', { buffer: IMAGES.pdf, mimeType: 'application/pdf', filename: 'studentCard_2.pdf' }],
    ['empty', { buffer: Buffer.alloc(0), mimeType: 'image/jpeg', filename: 'studentCard_2.jpg' }],
    ['type', { buffer: Buffer.from('<?php echo 1; ?>'), mimeType: 'image/jpeg', filename: 'studentCard_2.jpg' }],
    ['type', { buffer: IMAGES.jpeg, mimeType: 'image/jpeg', filename: 'studentCard_2.png' }],
    ['type', { buffer: IMAGES.jpeg, mimeType: 'image/jpeg', filename: 'studentCard_2' }],
  ]) {
    const result = await validateStudentCardsV4(validStudents(), cardFiles({ studentCard_2: file }))
    assert.equal(result.status, status[issue], file.filename)
    assert.equal(result.field, 'studentCard_2')
  }
  const extra = cardFiles()
  extra.set('studentCard_4', { buffer: IMAGES.jpeg, mimeType: 'image/jpeg', filename: 'studentCard_4.jpg' })
  assert.equal((await validateStudentCardsV4(validStudents(), extra)).field, 'studentCard_4')

  const mixed = await validateStudentCardsV4(validStudents(), cardFiles({
    studentCard_2: { buffer: IMAGES.png, mimeType: 'image/png', filename: 'studentCard_2.png' },
    studentCard_3: { buffer: IMAGES.webp, mimeType: 'image/webp', filename: 'studentCard_3.webp' },
  }))
  assert.deepEqual(mixed.cards.map((card) => card.extension), ['jpg', 'png', 'webp'])
})

// =================================================================================
// Form model, draft and wording
// =================================================================================

test('form: three fixed students, RFID + BAC year, text-only draft under the v4 key', () => {
  const state = createRegistrationStateV4()
  assert.deepEqual(state.students, [1, 2, 3].map((position) => ({
    id: `student-${position}`, position, fullName: '', phone: '', bacYear: '', rfid: '', studentCard: null,
  })))
  assert.deepEqual(state.delegationHead, { fullName: '', phone: '', rfid: '', idCard: null })
  assert.deepEqual(state.driver, { fullName: '', phone: '', rfid: '', idCard: null })
  assert.deepEqual(SECTIONS.delegationHead.fields, ['fullName', 'phone', 'rfid'])
  assert.deepEqual(STUDENT_FIELDS, ['fullName', 'phone', 'bacYear', 'rfid', 'studentCard'])
  assert.deepEqual(STUDENT_TEXT_FIELDS, ['fullName', 'phone', 'bacYear', 'rfid'])
  assert.equal(DRAFT_KEY, 'aivex-registration-draft-v4')
  assert.deepEqual(LEGACY_DRAFT_KEYS, ['aivex-registration-draft-v1', 'aivex-registration-draft-v2', 'aivex-registration-draft-v3'])

  const filled = filledState()
  for (const student of filled.students) assert.deepEqual(studentIssues(student, filled.students), {})
  const missingCard = { ...filled.students[0], studentCard: null }
  assert.ok(studentIssues(missingCard, filled.students).studentCard, 'a missing card blocks the submission')
  const sameRfid = filled.students.map((student) => ({ ...student, rfid: ' 12345678 ' }))
  assert.equal(studentIssues(sameRfid[1], sameRfid).rfid, 'Each student needs their own RFID.')
})

test('form: every language has the v4 wording and no v3 field label', () => {
  const removed = ['nationalIdLabel', 'regNumberLabel', 'studyLevelLabel', 'studyLevels', 'revNationalId', 'revRegId', 'revStudyLevel', 'errNationalRequired', 'errRegRequired', 'errLevelRequired']
  for (const lang of ['en', 'fr', 'ar']) {
    const t = getRegistrationStrings(lang)
    for (const key of ['rfidLabel', 'rfidHint', 'bacYearLabel', 'selectBacYear', 'revRfid', 'revBacYear', 'errRfidRequired', 'errRfidShared',
      'errBacYearRequired', 'errBacYearInvalid', 'errCardRequired', 'errFileEmpty', 'successTitle', 'successReference']) {
      assert.ok(t[key], `${lang}.${key}`)
    }
    assert.equal(typeof t.fileRejected({ name: 'a.heic', details: 'image/heic · 2.0 MB' }), 'string')
    for (const key of removed) assert.equal(key in t, false, `${lang}.${key} removed`)
    assert.match(t.privacyIntro, /RFID/)
  }
  assert.equal(registrationStrings.fr.successTitle, 'Inscription enregistrée avec succès.')
  for (const key of ['rfidLabel', 'bacYearLabel', 'errRfidRequired', 'errBacYearRequired', 'errFileEmpty']) {
    assert.notEqual(registrationStrings.fr[key], registrationStrings.en[key], `fr.${key} translated`)
    assert.notEqual(registrationStrings.ar[key], registrationStrings.en[key], `ar.${key} translated`)
  }
  // The select offers exactly the years the API accepts (2019 to 2026, most recent first), and no others.
  const options = getBacYearOptions(getRegistrationStrings('en'), bacYearChoices())
  assert.deepEqual(options.map(({ value }) => value), ['', '2026', '2025', '2024', '2023', '2022', '2021', '2020', '2019'])
  assert.deepEqual(options[0], { value: '', label: 'Select year' })
  for (const { value } of options.slice(1)) assert.equal(isValidBacYear(Number(value)), true)
})

// =================================================================================
// Write path: idempotency and failures (store-level)
// =================================================================================

const registration = () => validate(validPayload()).value
const cards = () => [1, 2, 3].map((position) => ({ position, field: `studentCard_${position}`, buffer: Buffer.alloc(10), mime: 'image/png', extension: 'png', size: 10 }))
const identityCards = () => ['delegationHead', 'driver'].map((subject) => {
  const buffer = Buffer.from(IMAGES.png)
  return {
    subject, field: `${subject}IdCard`, buffer, mime: 'image/png', extension: 'png', size: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  }
})

test('write path: an incomplete registration answers 409 while recent, and is redone once stale', async () => {
  const store = createMemoryStore()
  const value = registration()
  await store.insertRegistration(toRegistrationRow(value, {
    reference: 'AIVEX2-DEAD0000', fingerprint: registrationFingerprint(value), source: null, now: NOW,
  }))
  const busy = await registerV4({ store, registration: value, cards: cards(), identityCards: identityCards(), now: NOW })
  assert.equal(busy.status, 409)
  assert.equal(busy.retryAfterSeconds, 15)

  const later = await registerV4({ store, registration: value, cards: cards(), identityCards: identityCards(), now: new Date(NOW.getTime() + STALE_AFTER_MS + 1) })
  assert.equal(later.status, 201)
  assert.notEqual(later.body.reference, 'AIVEX2-DEAD0000')
  assert.equal(store.registrations.length, 1)
  assert.equal(store.students.length, 3)
})

test('write path: a failed upload removes what was written; a reference collision draws a new one', async () => {
  const store = createMemoryStore()
  let uploads = 0
  store.uploadCard = async (path, buffer, mime) => {
    uploads += 1
    if (uploads === 3) throw Object.assign(new Error('storage down'), { statusCode: 500 })
    store.objects.set(path, { size: buffer.length, mime })
  }
  const logged = console.error
  console.error = () => {}
  try {
    const failed = await registerV4({ store, registration: registration(), cards: cards(), identityCards: identityCards(), now: NOW })
    assert.equal(failed.status, 500)
    assert.doesNotMatch(failed.body.message, /storage|supabase|edition-/i)
  } finally {
    console.error = logged
  }
  assert.equal(store.registrations.length + store.students.length + store.objects.size, 0)

  const clean = createMemoryStore()
  await clean.insertRegistration({ submission_id: OTHER_SUBMISSION_ID, reference: 'AIVEX2-TAKEN000', submitted_at: NOW.toISOString() })
  const references = ['AIVEX2-TAKEN000', 'AIVEX2-FRESH000']
  const outcome = await registerV4({ store: clean, registration: registration(), cards: cards(), identityCards: identityCards(), now: NOW, generateReference: () => references.shift() })
  assert.equal(outcome.status, 201)
  assert.deepEqual(outcome.body, { success: true, reference: 'AIVEX2-FRESH000' })
  assert.equal(typeof outcome.registrationId, 'string') // internal id: for document generation, never in the response body
})

test('write path: the reference is generated by the server, in one format', () => {
  const references = new Set(Array.from({ length: 200 }, () => generateRegistrationReference(2)))
  assert.equal(references.size, 200)
  for (const reference of references) assert.match(reference, REGISTRATION_REFERENCE_PATTERN)
  assert.equal(generateRegistrationReference(2, () => Buffer.alloc(8)), 'AIVEX2-00000000')
  assert.throws(() => generateRegistrationReference(0))
  // A client-proposed reference is refused outright.
  rejects(withChange((p) => { p.reference = 'AIVEX2-CHOSEN00' }), 'reference')
})

test('API: POST only, honeypot, rate limit, and no internals in errors', async () => {
  const { store, handler } = makeApi()
  const get = await new Promise((resolve) => {
    const res = { headers: {}, setHeader(name, value) { this.headers[name] = value }, end(body) { resolve({ status: this.statusCode, body: JSON.parse(body), allow: this.headers.Allow }) } }
    handler({ method: 'GET', headers: {} }, res)
  })
  assert.deepEqual([get.status, get.allow], [405, 'POST'])

  const bot = await post(handler, validPayload({ website: 'http://spam.example' }))
  assert.equal(bot.status, 201)
  assert.match(bot.body.reference, REGISTRATION_REFERENCE_PATTERN)
  assert.equal(store.registrations.length, 0, 'honeypot: nothing written')

  const unconfigured = createRegisterHandler({ createStore: () => null, createDocumentStore: () => null, now: () => NOW })
  const logged = console.error
  console.error = () => {}
  try {
    assert.deepEqual((await post(unconfigured, validPayload())).body, { success: false, message: 'Server configuration error.' })
  } finally {
    console.error = logged
  }
})

// =================================================================================
// Contract details kept from Phase 1
// =================================================================================

test('normalisers: text, e-mail, phone, RFID (leading zeros kept), BAC year', () => {
  assert.equal(normalizeText('  Amina \t\n Benali  '), 'Amina Benali')
  assert.equal(normalizeText('Arréridj'), 'Arréridj')
  assert.equal(normalizeEmail('  Activities@Univ-BBA.DZ '), 'activities@univ-bba.dz')
  assert.equal(normalizePhone('0555 12 34 56'), '0555123456')
  assert.equal(normalizePhone('+213 555 12 34 56'), '+213555123456')
  assert.equal(normalizeRfid('  00471236 '), '00471236')
  assert.equal(normalizeRfid(471236), '')
  assert.equal(normalizeBacYear('2023'), 2023)
  assert.equal(normalizeBacYear('BAC 2023'), null)
  assert.equal(validate(validPayload()).value.students[0].rfid, '00000001')
})

test('validation: wilaya and institution come from the dataset (snapshot), custom institutions allowed', () => {
  for (const code of ['99', '00', '1', 34, '']) rejects(withChange((p) => { p.team.wilaya.code = code }), 'team.wilaya.code')
  rejects(withChange((p) => { p.team.institution.id = 'univ-setif-1' }), 'team.institution.id')
  const renamed = withChange((p) => { p.team.wilaya.name = 'x'; p.team.institution.name = 'Fake' })
  assert.deepEqual(renamed.value.team, {
    name: 'Infinity AI',
    wilaya: { code: '34', name: 'Bordj Bou Arréridj' },
    institution: { id: 'univ-bba', name: 'Université Mohamed El Bachir El Ibrahimi de Bordj Bou Arréridj', custom: false },
  })
  const custom = withChange((p) => { p.team.institution = { id: 'other', name: '  École   Supérieure X ', custom: true } })
  assert.deepEqual(custom.value.team.institution, { id: 'other', name: 'École Supérieure X', custom: true })
  rejects(withChange((p) => { p.team.institution = { id: 'univ-bba', name: 'X school', custom: true } }), 'team.institution.id')
  rejects(withChange((p) => { p.activityOfficial.email = 'not-an-email' }), 'activityOfficial.email')
  rejects(withChange((p) => { p.students[1].rfid = p.students[0].rfid }), 'students[1].rfid')
  rejects(withChange((p) => { const [a, b] = p.students; a.position = 2; b.position = 1 }), 'students[0].position')
})

test('statuses: v4 values, shared by the contract and the migration', async () => {
  assert.deepEqual([...REGISTRATION_STATUSES], ['submitted', 'under_review', 'approved', 'rejected', 'cancelled'])
  assert.deepEqual([...DOCUMENT_STATUSES], ['not_generated', 'generating', 'awaiting_signature', 'signed_document_uploaded',
    'under_review', 'changes_required', 'validated', 'generation_failed', 'expired'])
  assert.deepEqual([DEFAULT_REGISTRATION_STATUS, DEFAULT_DOCUMENT_STATUS], ['submitted', 'not_generated'])
  const sql = await read('supabase/migrations/20260918120000_aivex_v4_contract.sql')
  const listed = (column) => sql.match(new RegExp(`check \\(${column} in \\(([^)]+)\\)\\)`))[1].match(/'([a-z_]+)'/g).map((v) => v.slice(1, -1))
  assert.deepEqual(listed('registration_status'), [...REGISTRATION_STATUSES])
  assert.deepEqual(listed('document_status'), [...DOCUMENT_STATUSES])
  assert.deepEqual(registrationResponsesV4.replayed('R'), { status: 200, body: { success: true, reference: 'R', alreadyProcessed: true } })
})

test('student cards: internal verification data, private bucket, deterministic path per edition', () => {
  assert.deepEqual([...DATA_CLASSES.internalVerification], ['students[].studentCard', 'delegationHead.idCard', 'driver.idCard'])
  assert.equal(STUDENT_CARD_POLICY.required, true)
  assert.equal(STUDENT_CARD_POLICY.printable, false)
  assert.equal(STUDENT_CARD_POLICY.publicBucket, false)
  assert.equal(STUDENT_CARD_POLICY.bucket, 'aivex-student-cards')
  assert.equal(studentCardStoragePath(REGISTRATION_ID, 1, 'image/jpeg'), `edition-2/${REGISTRATION_ID}/student-1.jpg`)
  assert.equal(studentCardStoragePath(REGISTRATION_ID.toUpperCase(), 3, 'image/webp', 3), `edition-3/${REGISTRATION_ID}/student-3.webp`)
  assert.throws(() => studentCardStoragePath(REGISTRATION_ID, 4, 'image/jpeg'))
  assert.throws(() => studentCardStoragePath('../other', 1, 'image/jpeg'))
  assert.equal(studentCardUploadName(2, 'image/jpg'), 'studentCard_2.jpg')
  assert.equal(LEGACY_V3_FIELDS.includes('nationalId'), true)
})

test('student cards: never a public URL; AIVEX logs carry a stage and a code only', async () => {
  const files = ['api/aivex/register.js', 'shared/aivex/contract-v4.js', 'shared/aivex/word-mapping-v4.js',
    ...(await readdir(new URL('../api/_lib/', import.meta.url))).filter((name) => name.startsWith('aivex-')).map((name) => `api/_lib/${name}`)]
  for (const file of files) {
    const source = await read(file)
    assert.doesNotMatch(source, /getPublicUrl|createSignedUrl/, file)
    for (const [, args] of source.matchAll(/console\.(?:error|log|warn)\(([^)]*)\)/g)) {
      const logged = args.replace(/'[^']*'/g, "''")
      assert.doesNotMatch(logged, /path|payload|body|registration\b|email|rfid|phone|message/i, `${file} logs ${args}`)
    }
  }
})

test('Word mapping: official data only, 29 variables, no student card', () => {
  const names = WORD_VARIABLES_V4.map((entry) => entry.variable)
  assert.equal(names.length, 29)
  for (const expected of ['registration_reference', 'wilaya_name', 'institution_name', 'team_name', 'activity_official_phone',
    'activity_official_email', 'delegation_head_rfid', 'driver_rfid', 'student_1_bac_year', 'student_3_rfid']) {
    assert.ok(names.includes(expected), expected)
  }
  const described = JSON.stringify(WORD_VARIABLES_V4)
  assert.doesNotMatch(described, /card|national|registration_number|study_level|registrationNumber|studyLevel/i)
  for (const excluded of WORD_EXCLUDED_FIELDS_V4) assert.equal(described.includes(excluded), false, excluded)
  const data = resolveWordDataV4({
    settings: { edition_name: 'AIVEX 2' },
    registration: { reference: 'AIVEX2-7K3M9QXT', team_name: 'Infinity AI' },
    students: [1, 2, 3].map((position) => ({ position, full_name: `S${position}`, student_card_path: `edition-2/x/student-${position}.jpg` })),
  })
  assert.equal(data.registration_reference, 'AIVEX2-7K3M9QXT')
  assert.doesNotMatch(JSON.stringify(data), /student-\d\.jpg|card/i)
})

test('shared contract is pure: no React, window, document, Supabase or process.env', async () => {
  for (const file of ['shared/aivex/contract-v4.js', 'shared/aivex/word-mapping-v4.js']) {
    const code = (await read(file)).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
    for (const forbidden of [/\bwindow\./, /\bdocument\./, /process\.env/, /from ['"]react['"]/, /@supabase/, /node:/]) {
      assert.doesNotMatch(code, forbidden, `${file}: ${forbidden}`)
    }
  }
  const ids = new Set(Array.from({ length: 50 }, () => createSubmissionId({ getRandomValues: (a) => globalThis.crypto.getRandomValues(a) })))
  assert.equal(ids.size, 50)
  for (const id of ids) assert.equal(isUuidV4(id), true)
})

test('migrations: additive, private bucket, v4 keys and constraints, e-mail not unique for v4', async () => {
  const strip = (sql) => sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').toLowerCase()
  const contract = strip(await read('supabase/migrations/20260918120000_aivex_v4_contract.sql'))
  const writePath = strip(await read('supabase/migrations/20260919120000_aivex_v4_write_path.sql'))
  for (const sql of [contract, writePath]) {
    for (const destructive of [/drop\s+table/, /drop\s+column/, /\btruncate\b/, /delete\s+from/, /drop\s+schema/, /drop\s+function/]) {
      assert.doesNotMatch(sql, destructive)
    }
    assert.doesNotMatch(sql, /public\s*=\s*true/)
  }
  assert.match(contract, /on conflict \(id\) do update set public = false/)
  assert.match(contract, /create unique index if not exists aivex_registrations_submission_id_uidx\s+on public\.aivex_registrations \(submission_id\)/)
  assert.match(contract, /aivex_registrations_edition_contact_v3_uidx\s+on public\.aivex_registrations \(edition, lower\(activity_official_email\)\)\s+where form_version < 4/)
  assert.match(contract, /unique \(registration_id, position\)/)
  assert.match(contract, /unique \(registration_id, rfid_number\)/)
  assert.doesNotMatch(contract + writePath, /unique \(edition, rfid_number\)/)
  assert.match(contract, /student_card_path text not null/)
  assert.match(writePath, /alter column submission_id set not null/)
  assert.match(writePath, /add column if not exists submission_fingerprint text/)
  assert.match(writePath, /'edition-' \|\| edition::text \|\| '\/' \|\| registration_id::text/)
})
