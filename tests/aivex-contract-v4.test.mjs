// AIVEX Data Contract V4 — contract tests (node --test, no network, no database).
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import {
  ACTIVITY_OFFICIAL_ROLES, AIVEX_EDITION, AIVEX_FORM_VERSION, AIVEX_STUDENT_COUNT, DATA_CLASSES,
  DEFAULT_DOCUMENT_STATUS, DEFAULT_REGISTRATION_STATUS, DOCUMENT_STATUSES, REGISTRATION_STATUSES,
  STUDENT_CARD_FIELDS, STUDENT_CARD_FIELD_PATTERN, STUDENT_CARD_POLICY, V4_FIELDS,
  buildRegistrationPayloadV4, buildStudentCardPartsV4, createRegistrationStateV4, formatRegistrationReference,
  isRegistrationReference, normalizeBacYear, normalizeEmail, normalizePhone, normalizeRfid, normalizeText,
  registrationResponsesV4, studentCardStoragePath, studentCardUploadName, validateRegistrationV4,
} from '../shared/aivex/contract-v4.js'
import { WORD_EXCLUDED_FIELDS_V4, WORD_VARIABLES_V4, resolveWordDataV4 } from '../shared/aivex/word-mapping-v4.js'
import { validateStudentCardsV4 } from '../api/_lib/aivex-validation-v4.js'
import { validateRegistrationV3 } from '../api/_lib/aivex-validation.js'
import { parseMultipart } from '../api/_lib/multipart.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const NOW = new Date('2026-09-18T10:00:00Z')
const SUBMISSION_ID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'
const REGISTRATION_ID = '6c1f0e2a-7b3d-4c5e-9f8a-0b1c2d3e4f5a'

// Tiny but real files: the checks read their magic bytes.
const IMAGES = {
  jpeg: Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'),
  png: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  webp: Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64'),
  pdf: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'),
}

const validPayload = () => ({
  form: 'aivex',
  version: 4,
  submissionId: SUBMISSION_ID,
  submittedAt: NOW.toISOString(),
  source: 'https://infinity-project-zeta.vercel.app/aivex/register',
  answers: {
    team: {
      name: 'Infinity AI',
      wilaya: { code: '34', name: 'Bordj Bou Arréridj' },
      institution: { id: 'univ-bba', name: 'Université Mohamed El Bachir El Ibrahimi', custom: false },
    },
    activityOfficial: { role: 'activities_officer', fullName: 'Amina Benali', email: 'activities@univ-bba.dz', phone: '0555 12 34 56' },
    delegationHead: { fullName: 'Karim Haddad', phone: '+213 661 23 45 67', rfid: '00471236' },
    driver: { fullName: 'Nabil Saidi', phone: '0770 11 22 33', rfid: 'A1B2C3D4' },
    students: [1, 2, 3].map((position) => ({
      position,
      fullName: `Student Number ${position}`,
      phone: `0550 00 00 0${position}`,
      bacYear: 2021 + position,
      rfid: `00${position}9876`,
      studentCard: `studentCard_${position}`,
    })),
    consent: true,
  },
})

const validate = (payload) => validateRegistrationV4(payload, { now: NOW })
const withChange = (change) => {
  const payload = validPayload()
  change(payload)
  return validate(payload)
}
const rejects = (result, field) => {
  assert.equal(result.ok, false, `expected a rejection on ${field}`)
  assert.equal(result.status, 400)
  assert.equal(result.field, field)
  assert.equal(typeof result.message, 'string')
}

const cardFiles = (overrides = {}) => new Map(STUDENT_CARD_FIELDS.map((field) => [field, {
  buffer: IMAGES.jpeg,
  mimeType: 'image/jpeg',
  filename: `${field}.jpg`,
  ...overrides[field],
}]))
const validStudents = () => validate(validPayload()).value.students

// 1 -------------------------------------------------------------------------
test('1. the contract is version 4 and only accepts version 4', () => {
  assert.equal(AIVEX_FORM_VERSION, 4)
  assert.equal(AIVEX_EDITION, 2)
  assert.equal(AIVEX_STUDENT_COUNT, 3)

  const result = validate(validPayload())
  assert.equal(result.ok, true, result.message)
  assert.equal(result.value.formVersion, 4)

  rejects(withChange((p) => { p.version = 3 }), 'version')
  rejects(withChange((p) => { p.version = '4' }), 'version')
  rejects(withChange((p) => { delete p.version }), 'version')
  rejects(withChange((p) => { p.form = 'membership' }), 'form')
})

test('1a. the legacy v3 validator still accepts a production v3 payload', () => {
  const v3 = validPayload()
  v3.version = 3
  v3.answers.delegationHead = { fullName: 'Karim Haddad', phone: '0661234567', nationalId: '123456789' }
  v3.answers.driver = { fullName: 'Nabil Saidi', phone: '0770112233', nationalId: '987654321' }
  v3.answers.students = [1, 2, 3].map((position) => ({
    position,
    fullName: `Student Number ${position}`,
    registrationNumber: `20213304609${position}`,
    studyLevel: 'Licence 3',
    phone: `055000000${position}`,
    studentCard: `studentCard_${position}`,
  }))
  const result = validateRegistrationV3(v3)
  assert.equal(result.ok, true, result.message)
  assert.equal(result.value.formVersion, 3)
})

test('1b. v3 and v4 are never converted into each other', () => {
  const v4 = validPayload()
  const v3Result = validateRegistrationV3(v4)
  assert.equal(v3Result.ok, false)

  const v3Shaped = validPayload()
  v3Shaped.version = 3
  v3Shaped.answers.delegationHead = { fullName: 'Karim Haddad', phone: '0661234567', nationalId: '123456789' }
  rejects(validate(v3Shaped), 'version')
})

// 2 -------------------------------------------------------------------------
test('2. a team is exactly three students', () => {
  rejects(withChange((p) => { p.answers.students.pop() }), 'answers.students')
  rejects(withChange((p) => { p.answers.students.push({ ...p.answers.students[0], position: 4 }) }), 'answers.students')
  rejects(withChange((p) => { p.answers.students = [] }), 'answers.students')
  rejects(withChange((p) => { p.answers.students = {} }), 'answers.students')
  assert.equal(validate(validPayload()).value.students.length, 3)
})

// 3 -------------------------------------------------------------------------
test('3. positions are exactly 1, 2, 3 in order', () => {
  rejects(withChange((p) => {
    const [first, second] = p.answers.students
    first.position = 2
    second.position = 1
  }), 'answers.students[0].position')
  rejects(withChange((p) => { p.answers.students[2].position = '3' }), 'answers.students[2].position')
  rejects(withChange((p) => { delete p.answers.students[1].position }), 'answers.students[1].position')
  assert.deepEqual(validate(validPayload()).value.students.map((s) => s.position), [1, 2, 3])
})

// 4 -------------------------------------------------------------------------
test('4. bacYear is an integer inside a dynamic range', () => {
  const at = 'answers.students[0].bacYear'
  for (const bad of ['2023', 'BAC 2023', '2023/2024', 2023.5, null, 1989, 2028]) {
    rejects(withChange((p) => { p.answers.students[0].bacYear = bad }), at)
  }
  for (const good of [1990, 2026, 2027]) {
    assert.equal(withChange((p) => { p.answers.students[0].bacYear = good }).ok, true, `bacYear ${good}`)
  }
  // The range follows the clock: 2028 becomes valid in 2027.
  const later = validPayload()
  later.answers.students[0].bacYear = 2028
  assert.equal(validateRegistrationV4(later, { now: new Date('2027-03-01T00:00:00Z') }).ok, true)

  assert.equal(normalizeBacYear('2023'), 2023)
  assert.equal(normalizeBacYear(' 2023 '), 2023)
  assert.equal(normalizeBacYear(2023), 2023)
  assert.equal(normalizeBacYear('BAC 2023'), null)
  assert.equal(normalizeBacYear('2023/2024'), null)
  assert.equal(normalizeBacYear(2023.5), null)
})

// 5 -------------------------------------------------------------------------
test('5. RFID is always a string', () => {
  rejects(withChange((p) => { p.answers.students[0].rfid = 1239876 }), 'answers.students[0].rfid')
  rejects(withChange((p) => { p.answers.delegationHead.rfid = 471236 }), 'answers.delegationHead.rfid')
  rejects(withChange((p) => { p.answers.driver.rfid = '' }), 'answers.driver.rfid')
  rejects(withChange((p) => { p.answers.driver.rfid = 'x'.repeat(65) }), 'answers.driver.rfid')
  rejects(withChange((p) => { p.answers.driver.rfid = 'AB CD' }), 'answers.driver.rfid')

  const { value } = validate(validPayload())
  for (const rfid of [value.delegationHead.rfid, value.driver.rfid, ...value.students.map((s) => s.rfid)]) {
    assert.equal(typeof rfid, 'string')
  }
})

// 6 -------------------------------------------------------------------------
test('6. RFID keeps its leading zeros and is only trimmed', () => {
  assert.equal(normalizeRfid('  00471236 '), '00471236')
  assert.equal(normalizeRfid('0a:1B'), '0a:1B')
  assert.equal(normalizeRfid(471236), '')

  const result = withChange((p) => { p.answers.delegationHead.rfid = '  000123  ' })
  assert.equal(result.value.delegationHead.rfid, '000123')
  assert.equal(result.value.students[0].rfid, '0019876')
})

// 7 -------------------------------------------------------------------------
test('7. two students cannot share an RFID', () => {
  rejects(withChange((p) => { p.answers.students[1].rfid = p.answers.students[0].rfid }), 'answers.students[1].rfid')
  rejects(withChange((p) => { p.answers.students[2].rfid = ` ${p.answers.students[0].rfid} ` }), 'answers.students[2].rfid')
  // Only students are compared: this cross-person rule is an open decision.
  assert.equal(withChange((p) => { p.answers.driver.rfid = p.answers.students[0].rfid }).ok, true)
})

// 8, 9, 10 ---------------------------------------------------------------
for (const position of [1, 2, 3]) {
  test(`${7 + position}. studentCard_${position} is mandatory`, async () => {
    const field = `studentCard_${position}`
    const index = position - 1
    rejects(withChange((p) => { delete p.answers.students[index].studentCard }), `answers.students[${index}].studentCard`)
    rejects(withChange((p) => { p.answers.students[index].studentCard = `studentCard_${(position % 3) + 1}` }), `answers.students[${index}].studentCard`)

    const files = cardFiles()
    files.delete(field)
    const missing = await validateStudentCardsV4(validStudents(), files)
    assert.equal(missing.ok, false)
    assert.equal(missing.field, field)
    assert.equal(missing.status, 400)
  })
}

// 11 ------------------------------------------------------------------------
test('11. consent must be exactly true', () => {
  for (const value of [false, 'true', 1, undefined]) {
    rejects(withChange((p) => { p.answers.consent = value }), 'answers.consent')
  }
})

// 12 ------------------------------------------------------------------------
test('12. submissionId is a UUID v4', () => {
  for (const bad of ['abc', '', 42, undefined, '3f2b8c1e-9a4d-1e6f-8b2a-1c3d5e7f9a0b', '3f2b8c1e9a4d4e6f8b2a1c3d5e7f9a0b']) {
    rejects(withChange((p) => { p.submissionId = bad }), 'submissionId')
  }
  const upper = withChange((p) => { p.submissionId = SUBMISSION_ID.toUpperCase() })
  assert.equal(upper.value.submissionId, SUBMISSION_ID)

  const first = createRegistrationStateV4()
  const second = createRegistrationStateV4()
  assert.match(first.submissionId, /^[0-9a-f-]{36}$/)
  assert.notEqual(first.submissionId, second.submissionId)
})

// 13 ------------------------------------------------------------------------
test('13. the wilaya is checked and snapshotted from the dataset', () => {
  for (const code of ['99', '00', '1', 34, '']) {
    rejects(withChange((p) => { p.answers.team.wilaya.code = code }), 'answers.team.wilaya.code')
  }
  const renamed = withChange((p) => { p.answers.team.wilaya.name = 'Somewhere else' })
  assert.deepEqual(renamed.value.team.wilaya, { code: '34', name: 'Bordj Bou Arréridj' })
})

// 14 ------------------------------------------------------------------------
test('14. a listed institution must belong to the chosen wilaya', () => {
  rejects(withChange((p) => { p.answers.team.institution.id = 'univ-setif-1' }), 'answers.team.institution.id')
  rejects(withChange((p) => { p.answers.team.institution.id = 'not-an-institution' }), 'answers.team.institution.id')
  rejects(withChange((p) => { p.answers.team.institution.custom = 'false' }), 'answers.team.institution.custom')

  const renamed = withChange((p) => { p.answers.team.institution.name = 'Fake label' })
  assert.deepEqual(renamed.value.team.institution, {
    id: 'univ-bba',
    name: 'Université Mohamed El Bachir El Ibrahimi de Bordj Bou Arréridj',
    custom: false,
  })
})

// 15 ------------------------------------------------------------------------
test('15. a custom institution is "other" + custom: true + a typed name', () => {
  const custom = withChange((p) => { p.answers.team.institution = { id: 'other', name: '  École   Supérieure X ', custom: true } })
  assert.equal(custom.ok, true, custom.message)
  assert.deepEqual(custom.value.team.institution, { id: 'other', name: 'École Supérieure X', custom: true })

  rejects(withChange((p) => { p.answers.team.institution = { id: 'univ-bba', name: 'X school', custom: true } }), 'answers.team.institution.id')
  rejects(withChange((p) => { p.answers.team.institution = { id: 'other', name: 'X school', custom: false } }), 'answers.team.institution.id')
  rejects(withChange((p) => { p.answers.team.institution = { id: 'other', name: 'X', custom: true } }), 'answers.team.institution.name')
  // Wilayas without a listed institution only accept the custom form.
  const unlisted = withChange((p) => {
    p.answers.team.wilaya = { code: '55', name: 'Touggourt' }
    p.answers.team.institution = { id: 'other', name: 'Centre de formation de Touggourt', custom: true }
  })
  assert.equal(unlisted.ok, true, unlisted.message)
})

// 16 ------------------------------------------------------------------------
test('16. the activity role is an internal value, never a UI label', () => {
  assert.deepEqual([...ACTIVITY_OFFICIAL_ROLES], ['sub_director_activities', 'activities_officer'])
  for (const role of ACTIVITY_OFFICIAL_ROLES) {
    assert.equal(withChange((p) => { p.answers.activityOfficial.role = role }).ok, true)
  }
  for (const label of ['Activities Officer', 'مسؤول النشاطات', '', undefined]) {
    rejects(withChange((p) => { p.answers.activityOfficial.role = label }), 'answers.activityOfficial.role')
  }
})

// 17 ------------------------------------------------------------------------
test('17. phones are strings normalised to 9-15 digits', () => {
  assert.equal(normalizePhone('0555 12 34 56'), '0555123456')
  assert.equal(normalizePhone('+213 555 12 34 56'), '+213555123456')
  assert.equal(normalizePhone('(0555) 12-34.56'), '0555123456')
  assert.equal(normalizePhone(555123456), '')

  const { value } = validate(validPayload())
  assert.equal(value.activityOfficial.phone, '0555123456')
  assert.equal(value.delegationHead.phone, '+213661234567')

  for (const bad of ['12345', '05a5 12 34 56', '+213+555123456', 555123456, '1'.repeat(16), `0555${' '.repeat(40)}123456`]) {
    rejects(withChange((p) => { p.answers.students[1].phone = bad }), 'answers.students[1].phone')
  }
})

// 18 ------------------------------------------------------------------------
test('18. the activity e-mail is trimmed, lowercased and validated', () => {
  assert.equal(normalizeEmail('  Activities@Univ-BBA.DZ '), 'activities@univ-bba.dz')
  const result = withChange((p) => { p.answers.activityOfficial.email = '  Activities@Univ-BBA.DZ ' })
  assert.equal(result.value.activityOfficial.email, 'activities@univ-bba.dz')

  for (const bad of ['not-an-email', 'a@b', '', `${'a'.repeat(250)}@x.dz`]) {
    rejects(withChange((p) => { p.answers.activityOfficial.email = bad }), 'answers.activityOfficial.email')
  }
})

test('18b. the e-mail is not unique for v4 (idempotency is the submissionId)', async () => {
  const sql = await read('supabase/migrations/20260918120000_aivex_v4_contract.sql')
  assert.match(sql, /drop index if exists public\.aivex_registrations_edition_contact_uidx;/)
  assert.match(sql, /aivex_registrations_edition_contact_v3_uidx\s+on public\.aivex_registrations \(edition, lower\(activity_official_email\)\)\s+where form_version < 4;/)
  assert.match(sql, /create unique index if not exists aivex_registrations_submission_id_uidx\s+on public\.aivex_registrations \(submission_id\);/)
})

// 19 ------------------------------------------------------------------------
test('19. v4 does not use nationalId, registrationNumber, studyLevel or a leader', () => {
  const everyField = Object.values(V4_FIELDS).flat()
  for (const legacy of ['nationalId', 'registrationNumber', 'studyLevel', 'leader', 'isLeader']) {
    assert.equal(everyField.includes(legacy), false, legacy)
  }
  // activityOfficial.role is the official's function; students have no role.
  assert.equal(V4_FIELDS.student.includes('role'), false)

  rejects(withChange((p) => { p.answers.delegationHead.nationalId = '123456789' }), 'answers.delegationHead.nationalId')
  rejects(withChange((p) => { p.answers.driver.nationalId = '123456789' }), 'answers.driver.nationalId')
  rejects(withChange((p) => { p.answers.students[0].registrationNumber = '202133046094' }), 'answers.students[0].registrationNumber')
  rejects(withChange((p) => { p.answers.students[0].studyLevel = 'Licence 3' }), 'answers.students[0].studyLevel')
  rejects(withChange((p) => { p.answers.students[0].isLeader = true }), 'answers.students[0].isLeader')

  assert.doesNotMatch(JSON.stringify(validate(validPayload()).value), /nationalId|registrationNumber|studyLevel|leader/i)
})

test('19b. server-owned fields cannot come from the browser', () => {
  for (const key of ['reference', 'edition', 'status', 'registrationStatus', 'documentStatus']) {
    const result = withChange((p) => { p[key] = 'x' })
    rejects(result, key)
    assert.match(result.message, /assigned by the server/)
  }
  rejects(withChange((p) => { p.answers.reference = 'AX2-26-A83F19C2' }), 'answers.reference')
  // The honeypot key is tolerated (the handler filters a filled one first).
  assert.equal(withChange((p) => { p.website = '' }).ok, true)
})

// 20 ------------------------------------------------------------------------
test('20. the student card stays in the contract as internal verification data', async () => {
  assert.equal(V4_FIELDS.student.includes('studentCard'), true)
  assert.deepEqual([...DATA_CLASSES.internalVerification], ['answers.students[].studentCard'])
  assert.equal(STUDENT_CARD_POLICY.required, true)
  assert.equal(STUDENT_CARD_POLICY.printable, false)
  assert.equal(STUDENT_CARD_POLICY.publicBucket, false)
  assert.equal(STUDENT_CARD_POLICY.bucket, 'aivex-student-cards')
  assert.equal(STUDENT_CARD_POLICY.maxBytes, 5 * 1024 * 1024)
  assert.deepEqual(Object.keys(STUDENT_CARD_POLICY.types), ['image/jpeg', 'image/png', 'image/webp'])
  assert.deepEqual([...STUDENT_CARD_FIELDS], ['studentCard_1', 'studentCard_2', 'studentCard_3'])
  assert.deepEqual(validStudents().map((s) => s.studentCard), [...STUDENT_CARD_FIELDS])

  const sql = await read('supabase/migrations/20260918120000_aivex_v4_contract.sql')
  for (const column of ['student_card_path text not null', 'student_card_mime text not null', 'student_card_size_bytes bigint not null']) {
    assert.match(sql, new RegExp(column))
  }
})

// 21 ------------------------------------------------------------------------
test('21. the student card has no Word variable and is never resolved into the document', () => {
  const described = JSON.stringify(WORD_VARIABLES_V4)
  assert.doesNotMatch(described, /card/i)
  for (const excluded of WORD_EXCLUDED_FIELDS_V4) assert.equal(described.includes(excluded), false, excluded)

  const students = [1, 2, 3].map((position) => ({
    position,
    full_name: `Student Number ${position}`,
    phone: '0550000001',
    bac_year: 2023,
    rfid_number: `00${position}`,
    student_card_path: `${REGISTRATION_ID}/student-${position}.jpg`,
    student_card_mime: 'image/jpeg',
    student_card_size_bytes: 1234,
  }))
  const data = resolveWordDataV4({ settings: { edition_name: 'AIVEX' }, registration: { team_name: 'Infinity AI' }, students })
  assert.doesNotMatch(JSON.stringify(data), /student-\d\.jpg|image\/jpeg|card/i)
})

// Word mapping --------------------------------------------------------------
test('the Word mapping covers every official variable, three students each', () => {
  const names = WORD_VARIABLES_V4.map((entry) => entry.variable)
  assert.equal(new Set(names).size, names.length)
  for (const expected of [
    'edition_name', 'event_start_date', 'event_end_date', 'institution_name', 'wilaya_name', 'team_name',
    'activity_official_phone', 'activity_official_email',
    'delegation_head_name', 'delegation_head_phone', 'delegation_head_rfid',
    'driver_name', 'driver_phone', 'driver_rfid', 'submission_deadline', 'submission_email',
    ...[1, 2, 3].flatMap((n) => [`student_${n}_name`, `student_${n}_phone`, `student_${n}_bac_year`, `student_${n}_rfid`]),
  ]) assert.ok(names.includes(expected), expected)

  const student2Rfid = WORD_VARIABLES_V4.find((entry) => entry.variable === 'student_2_rfid')
  assert.equal(student2Rfid.db, 'aivex_students[position=2].rfid_number')
  assert.equal(student2Rfid.payload, 'answers.students[1].rfid')
  assert.equal(student2Rfid.frontend, 'students[1].rfid')

  const students = [3, 1, 2].map((position) => ({ position, full_name: `S${position}`, phone: '0550000001', bac_year: 2020 + position, rfid_number: `0${position}` }))
  const data = resolveWordDataV4({
    settings: { edition_name: 'AIVEX 2', submission_email: 'aivex@univ-bba.dz', event_start_date: null },
    registration: { team_name: 'Infinity AI', driver_rfid: '0007' },
    students,
  })
  assert.equal(data.student_1_name, 'S1')
  assert.equal(data.student_3_bac_year, '2023')
  assert.equal(data.driver_rfid, '0007')
  assert.equal(data.event_start_date, '')
  assert.throws(() => resolveWordDataV4({ settings: {}, registration: {}, students: students.slice(0, 2) }))
})

// Student card files --------------------------------------------------------
test('student card files: real JPEG, PNG and WEBP pass with a canonical extension', async () => {
  const files = cardFiles({
    studentCard_2: { buffer: IMAGES.png, mimeType: 'image/png', filename: 'studentCard_2.png' },
    studentCard_3: { buffer: IMAGES.webp, mimeType: 'image/webp', filename: 'studentCard_3.webp' },
  })
  files.set('studentCard_1', { buffer: IMAGES.jpeg, mimeType: 'image/jpg', filename: 'studentCard_1.jpeg' })
  const result = await validateStudentCardsV4(validStudents(), files)
  assert.equal(result.ok, true, result.message)
  assert.deepEqual(result.cards.map(({ position, field, mime, extension }) => ({ position, field, mime, extension })), [
    { position: 1, field: 'studentCard_1', mime: 'image/jpeg', extension: 'jpg' },
    { position: 2, field: 'studentCard_2', mime: 'image/png', extension: 'png' },
    { position: 3, field: 'studentCard_3', mime: 'image/webp', extension: 'webp' },
  ])
})

test('student card files: suspicious or invalid files are refused', async () => {
  const cases = [
    [{ buffer: IMAGES.png, mimeType: 'image/jpeg', filename: 'studentCard_2.jpg' }, 415], // declared type lies
    [{ buffer: IMAGES.jpeg, mimeType: 'image/jpeg', filename: 'studentCard_2.png' }, 415], // extension lies
    [{ buffer: IMAGES.jpeg, mimeType: 'image/jpeg', filename: 'studentCard_2' }, 415], // no extension
    [{ buffer: IMAGES.pdf, mimeType: 'application/pdf', filename: 'studentCard_2.pdf' }, 415], // PDF: not accepted
    [{ buffer: Buffer.from('<?php echo 1; ?>'), mimeType: 'image/jpeg', filename: 'studentCard_2.jpg' }, 415],
    [{ buffer: Buffer.alloc(0), mimeType: 'image/jpeg', filename: 'studentCard_2.jpg' }, 400],
    [{ buffer: Buffer.concat([IMAGES.jpeg, Buffer.alloc(STUDENT_CARD_POLICY.maxBytes)]), mimeType: 'image/jpeg', filename: 'studentCard_2.jpg' }, 413],
  ]
  for (const [file, status] of cases) {
    const result = await validateStudentCardsV4(validStudents(), cardFiles({ studentCard_2: file }))
    assert.equal(result.ok, false, file.filename)
    assert.equal(result.status, status, file.filename)
    assert.equal(result.field, 'studentCard_2')
  }

  const extra = cardFiles()
  extra.set('studentCard_4', { buffer: IMAGES.jpeg, mimeType: 'image/jpeg', filename: 'studentCard_4.jpg' })
  const unexpected = await validateStudentCardsV4(validStudents(), extra)
  assert.equal(unexpected.ok, false)
  assert.equal(unexpected.field, 'studentCard_4')
  assert.equal(STUDENT_CARD_FIELD_PATTERN.test('studentCard_4'), false)
})

// Storage -------------------------------------------------------------------
test('student cards get a deterministic private path per student', () => {
  assert.equal(studentCardStoragePath(REGISTRATION_ID, 1, 'image/jpeg'), `${REGISTRATION_ID}/student-1.jpg`)
  assert.equal(studentCardStoragePath(REGISTRATION_ID.toUpperCase(), 2, 'image/png'), `${REGISTRATION_ID}/student-2.png`)
  assert.equal(studentCardStoragePath(REGISTRATION_ID, 3, 'image/webp'), `${REGISTRATION_ID}/student-3.webp`)
  assert.throws(() => studentCardStoragePath(REGISTRATION_ID, 4, 'image/jpeg'))
  assert.throws(() => studentCardStoragePath('../other', 1, 'image/jpeg'))
  assert.throws(() => studentCardStoragePath(REGISTRATION_ID, 1, 'application/pdf'))
})

test('no public URL is ever built for student cards', async () => {
  const sources = []
  for (const dir of ['api', 'api/_lib', 'api/aivex', 'shared/aivex']) {
    for (const name of await readdir(new URL(`../${dir}/`, import.meta.url))) {
      if (name.endsWith('.js')) sources.push(await read(`${dir}/${name}`))
    }
  }
  for (const source of sources) assert.doesNotMatch(source, /getPublicUrl/)
})

// Frontend contract + transport --------------------------------------------
const filledState = () => {
  const state = createRegistrationStateV4({ submissionId: SUBMISSION_ID })
  Object.assign(state.team, { name: ' Infinity  AI ', wilaya: '34', institution: 'univ-bba' })
  Object.assign(state.activityOfficial, { role: 'sub_director_activities', fullName: 'Amina Benali', email: ' Amina@Univ-BBA.dz', phone: '0555 12 34 56' })
  Object.assign(state.delegationHead, { fullName: 'Karim Haddad', phone: '+213 661 23 45 67', rfid: ' 00471236 ' })
  Object.assign(state.driver, { fullName: 'Nabil Saidi', phone: '0770 11 22 33', rfid: '0099' })
  state.students.forEach((student) => Object.assign(student, {
    fullName: `Student Number ${student.position}`,
    phone: `0550 00 00 0${student.position}`,
    bacYear: String(2021 + student.position),
    rfid: `00${student.position}`,
    studentCard: new File([IMAGES.png], `IMG_000${student.position}.PNG`, { type: 'image/png' }),
  }))
  state.consent = true
  return state
}

test('the frontend state has three fixed students and builds a valid canonical payload', () => {
  const empty = createRegistrationStateV4()
  assert.deepEqual(empty.students.map((s) => s.position), [1, 2, 3])
  assert.deepEqual(Object.keys(empty.students[0]), ['position', 'fullName', 'phone', 'bacYear', 'rfid', 'studentCard'])
  assert.equal('nationalId' in empty.delegationHead, false)

  const payload = buildRegistrationPayloadV4(filledState(), { now: NOW })
  assert.deepEqual(Object.keys(payload), ['form', 'version', 'submissionId', 'submittedAt', 'answers'])
  assert.equal(payload.answers.students[1].bacYear, 2023)
  assert.equal(payload.answers.delegationHead.rfid, '00471236')
  assert.equal(payload.answers.team.institution.name, 'Université Mohamed El Bachir El Ibrahimi de Bordj Bou Arréridj')
  assert.equal('reference' in payload, false)

  const result = validate(payload)
  assert.equal(result.ok, true, result.message)
  assert.equal(result.value.team.name, 'Infinity AI')

  const parts = buildStudentCardPartsV4(filledState())
  assert.deepEqual(parts.map(({ field, filename }) => ({ field, filename })), [
    { field: 'studentCard_1', filename: 'studentCard_1.png' },
    { field: 'studentCard_2', filename: 'studentCard_2.png' },
    { field: 'studentCard_3', filename: 'studentCard_3.png' },
  ])
  assert.equal(studentCardUploadName(2, 'image/jpg'), 'studentCard_2.jpg')
})

test('multipart transport: payload + studentCard_1..3 survive the real parser', async () => {
  const state = filledState()
  const form = new FormData()
  form.append('payload', JSON.stringify(buildRegistrationPayloadV4(state, { now: NOW })))
  for (const { field, file, filename } of buildStudentCardPartsV4(state)) form.append(field, file, filename)

  const response = new Response(form)
  const req = Readable.from([Buffer.from(await response.arrayBuffer())])
  req.headers = { 'content-type': response.headers.get('content-type') }

  const parsed = await parseMultipart(req, {
    maxFileBytes: STUDENT_CARD_POLICY.maxBytes,
    maxFiles: AIVEX_STUDENT_COUNT,
    maxRequestBytes: 30 * 1024 * 1024,
    allowedFields: new Set(['payload']),
    fileFieldPattern: STUDENT_CARD_FIELD_PATTERN,
  })
  const registration = validate(JSON.parse(parsed.fields.payload))
  assert.equal(registration.ok, true, registration.message)
  const cards = await validateStudentCardsV4(registration.value.students, parsed.files)
  assert.equal(cards.ok, true, cards.message)
  assert.deepEqual(cards.cards.map((card) => studentCardStoragePath(REGISTRATION_ID, card.position, card.mime)), [
    `${REGISTRATION_ID}/student-1.png`, `${REGISTRATION_ID}/student-2.png`, `${REGISTRATION_ID}/student-3.png`,
  ])
})

// Statuses, reference, responses -------------------------------------------
test('registration and document statuses match the migration', async () => {
  assert.deepEqual([...REGISTRATION_STATUSES], ['submitted', 'under_review', 'approved', 'rejected', 'cancelled'])
  assert.equal(DEFAULT_REGISTRATION_STATUS, 'submitted')
  assert.deepEqual([...DOCUMENT_STATUSES], [
    'not_generated', 'generating', 'awaiting_signature', 'signed_document_uploaded', 'under_review',
    'changes_required', 'validated', 'generation_failed', 'expired',
  ])
  assert.equal(DEFAULT_DOCUMENT_STATUS, 'not_generated')

  const sql = await read('supabase/migrations/20260918120000_aivex_v4_contract.sql')
  const listed = (column) => sql.match(new RegExp(`check \\(${column} in \\(([^)]+)\\)\\)`))[1].match(/'([a-z_]+)'/g).map((v) => v.slice(1, -1))
  assert.deepEqual(listed('registration_status'), [...REGISTRATION_STATUSES])
  assert.deepEqual(listed('document_status'), [...DOCUMENT_STATUSES])
})

test('the public reference is server-shaped: AX{edition}-{yy}-{8 hex}', () => {
  assert.equal(formatRegistrationReference({ edition: 2, year: 2026, token: 'a83f19c2' }), 'AX2-26-A83F19C2')
  assert.equal(isRegistrationReference('AX2-26-A83F19C2'), true)
  for (const bad of ['AX-MFX3K2-AB12', 'AX2-26-A83F19C', 'ax2-26-a83f19c2', 42]) assert.equal(isRegistrationReference(bad), false)
  assert.throws(() => formatRegistrationReference({ edition: 2, year: 2026, token: 'nothex!!' }))
})

test('responses follow the contract', () => {
  assert.deepEqual(registrationResponsesV4.created('AX2-26-A83F19C2'), { status: 201, body: { success: true, reference: 'AX2-26-A83F19C2' } })
  assert.deepEqual(registrationResponsesV4.replayed('AX2-26-A83F19C2'), {
    status: 200, body: { success: true, reference: 'AX2-26-A83F19C2', alreadyProcessed: true },
  })
  const invalid = validate({ ...validPayload(), version: 3 })
  assert.deepEqual(registrationResponsesV4.failed(invalid.status, invalid.message, invalid.field).body, {
    success: false, message: invalid.message, field: 'version',
  })
})

test('normalizeText trims, folds whitespace and control characters, and composes NFC', () => {
  assert.equal(normalizeText('  Amina \t\n Benali  '), 'Amina Benali')
  assert.equal(normalizeText('Ali Omar'), 'Ali Omar')
  assert.equal(normalizeText('Arréridj'), 'Arréridj')
  assert.equal(normalizeText(42), '')
})

// Migration -----------------------------------------------------------------
test('the v4 migration is additive and keeps the card bucket private', async () => {
  const names = await readdir(new URL('../supabase/migrations/', import.meta.url))
  assert.ok(names.includes('20260918120000_aivex_v4_contract.sql'))
  const sql = (await read('supabase/migrations/20260918120000_aivex_v4_contract.sql'))
    .split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').toLowerCase()

  for (const destructive of [/drop\s+table/, /drop\s+column/, /\btruncate\b/, /delete\s+from/, /drop\s+schema/, /drop\s+function/]) {
    assert.doesNotMatch(sql, destructive)
  }
  assert.doesNotMatch(sql, /public\s*=\s*true/)
  assert.match(sql, /on conflict \(id\) do update set public = false/)
  assert.match(sql, /create table if not exists public\.aivex_students/)
  assert.match(sql, /create table if not exists public\.aivex_settings/)
  assert.match(sql, /unique \(registration_id, position\)/)
  assert.match(sql, /unique \(registration_id, rfid_number\)/)
  assert.doesNotMatch(sql, /unique \(edition, rfid_number\)/)
  assert.match(sql, /check \(position between 1 and 3\)/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /delegation_head_national_id is null/)
})
