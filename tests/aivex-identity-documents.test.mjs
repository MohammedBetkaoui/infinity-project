// AIVEX identity documents — the identity card image of the head of delegation
// and of the driver (node --test, no network, no database).
//
// Everything HTTP goes through the real multipart parser and the real
// api/aivex/register.js handler; the database and both Storage buckets are an
// in-memory store with fault injection. The SQL is checked statically here
// and was also executed on a real PostgreSQL engine (see the migration's
// header and the report of the change).

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import {
  IDENTITY_CARD_FIELDS, IDENTITY_CARD_POLICY, IDENTITY_CARD_SUBJECTS, REGISTRATION_FILE_FIELD_PATTERN, REGISTRATION_MAX_FILES,
  STUDENT_CARD_POLICY, buildRegistrationPayloadV4, createRegistrationStateV4, identityCardFileIssue, identityCardStoragePath,
  identityCardUploadName, validateRegistrationV4,
} from '../shared/aivex/contract-v4.js'
import { WORD_EXCLUDED_FIELDS_V4, WORD_VARIABLES_V4, resolveWordDataV4 } from '../shared/aivex/word-mapping-v4.js'
import { STALE_AFTER_MS, registerV4, toRegistrationRow } from '../api/_lib/aivex-registration-v4.js'
import { validateIdentityCardsV4, validateRegistrationFilesV4 } from '../api/_lib/aivex-validation-v4.js'
import { MultipartError, parseMultipart } from '../api/_lib/multipart.js'
import { createRegisterHandler } from '../api/aivex/register.js'
import {
  IDENTITY_CARD_TYPES, buildSubmission, buildSummary, checkIdentityFile, identityIssues, SECTIONS,
} from '../src/pages/aivex/register/registrationModel.js'
import { getRegistrationStrings, registrationStrings } from '../src/pages/aivex/register/registrationI18n.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const NOW = new Date('2026-09-23T10:00:00Z')
const SUBMISSION_ID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b'
const HEAD = 'delegationHeadIdCard'
const DRIVER = 'driverIdCard'
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

// Tiny but real files: the API reads their magic bytes.
const IMAGES = {
  jpeg: Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'),
  png: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  webp: Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64'),
  pdf: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'),
  gif: Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'),
  tiff: Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]),
  heic: Buffer.from('000000186674797068656963000000006d696631686569630000', 'hex'),
  zip: Buffer.from('504b03041400000000000000000000000000000000000000', 'hex'),
  exe: Buffer.from('4d5a90000300000004000000ffff0000b800000000000000', 'hex'),
  svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><script>alert(1)</script></svg>'),
  html: Buffer.from('<!doctype html><html><body><script>alert(1)</script></body></html>'),
  js: Buffer.from('alert(document.cookie)'),
  text: Buffer.from('this is not an image at all'),
}
const oversize = () => Buffer.concat([IMAGES.png, Buffer.alloc(IDENTITY_CARD_POLICY.maxBytes)])

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
  delegationHead: { fullName: 'Karim Haddad', phone: '0661 23 45 67', rfid: '00471236', idCard: HEAD },
  driver: { fullName: 'Nabil Saidi', phone: '0770 11 22 33', rfid: 'A1B2C3D4', idCard: DRIVER },
  students: [1, 2, 3].map((position) => ({
    position, fullName: ['Student Number One', 'Student Number Two', 'Student Number Three'][position - 1], phone: `0550 00 00 0${position}`, bacYear: 2021 + position,
    rfid: `0000000${position}`, studentCard: `studentCard_${position}`,
  })),
  consent: true,
  ...overrides,
})
const validRegistration = () => validateRegistrationV4(validPayload(), { now: NOW }).value

// --- Parts of a request ---------------------------------------------------------------

const imagePart = (field, buffer, type, filename) => ({ field, buffer, type, filename })
const imageParts = (overrides = {}) => [
  ...[1, 2, 3].map((n) => imagePart(`studentCard_${n}`, IMAGES.png, 'image/png', `studentCard_${n}.png`)),
  imagePart(HEAD, IMAGES.png, 'image/png', `${HEAD}.png`),
  imagePart(DRIVER, IMAGES.jpeg, 'image/jpeg', `${DRIVER}.jpg`),
].map((entry) => ({ ...entry, ...overrides[entry.field] }))
const without = (field) => imageParts().filter((entry) => entry.field !== field)

// --- In-memory backend with fault injection -----------------------------------------------

function createStore() {
  const registrations = []
  const students = []
  const cards = new Map() // aivex-student-cards
  const identity = new Map() // aivex-id-cards
  const counters = { uploadCard: 0, uploadIdentity: 0, removeIdentity: [] }
  const order = [] // every write, in the order the API made it
  // Faults: `uploadIdentity: 2` fails the 2nd identity upload, and so on.
  const fail = { uploadCard: 0, uploadIdentity: 0, insertStudents: false, removeIdentity: false, removeCards: false, deleteRegistration: false }
  let nextId = 0
  const boom = (code) => Object.assign(new Error('injected failure'), { statusCode: code })
  return {
    registrations, students, cards, identity, counters, fail, order,
    async findBySubmissionId(submissionId) {
      const row = registrations.find((entry) => entry.submission_id === submissionId)
      if (!row) return null
      return {
        id: row.id, reference: row.reference, fingerprint: row.submission_fingerprint, createdAt: row.created_at,
        studentCount: students.filter((entry) => entry.registration_id === row.id).length,
        identityCardPaths: [row.delegation_head_id_card_path, row.driver_id_card_path].filter(Boolean),
      }
    },
    async insertRegistration(row) {
      order.push('insertRegistration')
      if (registrations.some((entry) => entry.submission_id === row.submission_id || entry.reference === row.reference)) {
        return { ok: false, duplicate: true, code: '23505' }
      }
      const id = row.id || `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`
      registrations.push({ ...row, id, created_at: row.submitted_at })
      return { ok: true, id, reference: row.reference }
    },
    async uploadCard(path, buffer, mime) {
      order.push('uploadCard')
      counters.uploadCard += 1
      if (fail.uploadCard === counters.uploadCard) throw boom(500)
      if (cards.has(path)) throw boom('Duplicate')
      cards.set(path, { size: buffer.length, mime })
    },
    async uploadIdentityCard(path, buffer, mime) {
      order.push('uploadIdentityCard')
      counters.uploadIdentity += 1
      if (fail.uploadIdentity === counters.uploadIdentity) throw boom(503)
      if (identity.has(path)) throw boom('Duplicate')
      identity.set(path, { size: buffer.length, mime, sha256: sha256(buffer) })
    },
    async insertStudents(rows) {
      order.push('insertStudents')
      if (fail.insertStudents) throw boom('57P01')
      students.push(...rows)
    },
    async removeCards(paths) {
      if (fail.removeCards) throw boom(500)
      paths.forEach((path) => cards.delete(path))
    },
    async removeIdentityCards(paths) {
      counters.removeIdentity.push([...paths])
      if (fail.removeIdentity) throw boom(500)
      paths.forEach((path) => identity.delete(path))
    },
    async deleteRegistration(id) {
      if (fail.deleteRegistration) throw boom(500)
      registrations.splice(registrations.findIndex((entry) => entry.id === id), 1)
      for (let index = students.length - 1; index >= 0; index -= 1) if (students[index].registration_id === id) students.splice(index, 1)
    },
    // Nothing of the registration is left anywhere.
    empty() { return registrations.length + students.length + cards.size + identity.size === 0 },
  }
}

// --- HTTP: a real multipart request through the real handler ------------------------------

let ipCounter = 0
const nextIp = () => `198.51.100.${(ipCounter += 1) % 250}`

async function submit(handler, { payload = validPayload(), files = imageParts(), fields, ip = nextIp(), headers = {} } = {}) {
  const form = new FormData()
  for (const { name, value } of fields ?? [{ name: 'payload', value: JSON.stringify(payload) }]) form.append(name, value)
  for (const { field, buffer, type, filename } of files) form.append(field, new Blob([buffer], { type }), filename)
  const response = new Response(form)
  const req = Readable.from([Buffer.from(await response.arrayBuffer())])
  Object.assign(req, {
    method: 'POST',
    headers: { 'content-type': response.headers.get('content-type'), 'x-forwarded-for': ip, ...headers },
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

function makeApi({ now = NOW } = {}) {
  const store = createStore()
  delete process.env.VERCEL
  let opened = 0
  // No document store: these tests cover the registration and its files (see
  // tests/aivex-document-generation.test.mjs for the DOCX), and must never
  // reach a real Supabase project.
  const handler = createRegisterHandler({
    createStore: () => { opened += 1; return store },
    createDocumentStore: () => null,
    createMagicLinkStore: () => null,
    now: () => now,
  })
  return { store, handler, opened: () => opened }
}

async function captureLogs(run) {
  const logged = []
  const originals = ['error', 'warn', 'log', 'info', 'debug'].map((name) => [name, console[name]])
  for (const [name] of originals) console[name] = (...args) => logged.push(args)
  try {
    await run()
  } finally {
    for (const [name, original] of originals) console[name] = original
  }
  return logged
}

// A refused request: 4xx on the given part, and NOTHING written — not even a
// store opened, so no row and no file in either bucket.
async function assertRefused(name, files, status, field) {
  const { store, handler, opened } = makeApi()
  const { status: got, body } = await submit(handler, { files })
  assert.equal(got, status, `${name}: status (${JSON.stringify(body)})`)
  assert.equal(body.success, false)
  assert.equal(body.field, field, `${name}: field`)
  assert.equal(opened(), 0, `${name}: the store is never opened`)
  assert.ok(store.empty(), `${name}: nothing written`)
  return body
}

// =================================================================================
// 1-2. A valid image for each person is stored privately, with its metadata
// =================================================================================

test('1. a valid delegation head identity card is stored in the private bucket with its metadata', async () => {
  const { store, handler } = makeApi()
  const { status, body } = await submit(handler)
  assert.equal(status, 201)
  assert.equal(body.success, true)

  const [row] = store.registrations
  const path = row.delegation_head_id_card_path
  assert.match(path, new RegExp(`^edition-2/${row.id}/delegation-head/[0-9a-f-]{36}\\.png$`))
  assert.equal(row.delegation_head_id_card_mime, 'image/png')
  assert.equal(row.delegation_head_id_card_size, IMAGES.png.length)
  assert.equal(row.delegation_head_id_card_sha256, sha256(IMAGES.png))
  assert.deepEqual(store.identity.get(path), { size: IMAGES.png.length, mime: 'image/png', sha256: sha256(IMAGES.png) })
})

test('2. a valid driver identity card is stored in the private bucket with its metadata', async () => {
  const { store, handler } = makeApi()
  const { status } = await submit(handler)
  assert.equal(status, 201)
  const [row] = store.registrations
  const path = row.driver_id_card_path
  assert.match(path, new RegExp(`^edition-2/${row.id}/driver/[0-9a-f-]{36}\\.jpg$`), 'the type of the real bytes decides the extension')
  assert.equal(row.driver_id_card_mime, 'image/jpeg')
  assert.equal(row.driver_id_card_size, IMAGES.jpeg.length)
  assert.equal(row.driver_id_card_sha256, sha256(IMAGES.jpeg))
  assert.equal(store.identity.get(path).sha256, sha256(IMAGES.jpeg))
  assert.equal(store.identity.size, 2)
})

test('2b. the students — the completion marker — are inserted LAST, after all five files are stored', async () => {
  const { store, handler } = makeApi()
  const { status } = await submit(handler)
  assert.equal(status, 201)
  assert.deepEqual(store.order, [
    'insertRegistration',
    'uploadCard', 'uploadCard', 'uploadCard',
    'uploadIdentityCard', 'uploadIdentityCard',
    'insertStudents',
  ])
  // So there is never a complete registration (three students) with a document missing.
  const failing = makeApi()
  failing.store.fail.uploadIdentity = 2
  await captureLogs(() => submit(failing.handler))
  assert.ok(!failing.store.order.includes('insertStudents'), 'no student is written when a required document could not be stored')
})

// =================================================================================
// 3-6. Required, and size-limited
// =================================================================================

test('3. a missing delegation head identity card is refused before anything is written', async () => {
  const body = await assertRefused('missing head', without(HEAD), 400, HEAD)
  assert.match(body.message, /Head of delegation: the identity card image is missing/)
})

test('4. a missing driver identity card is refused before anything is written', async () => {
  const body = await assertRefused('missing driver', without(DRIVER), 400, DRIVER)
  assert.match(body.message, /Driver: the identity card image is missing/)
})

test('5. an oversized delegation head image is refused (413) before anything is written', async () => {
  const body = await assertRefused('big head', imageParts({ [HEAD]: { buffer: oversize() } }), 413, HEAD)
  assert.match(body.message, /identity card image must be 5 MB or smaller/, 'the message is about the identity card, not the student cards')
})

test('6. an oversized driver image is refused (413) before anything is written', async () => {
  const body = await assertRefused('big driver', imageParts({ [DRIVER]: { buffer: oversize() } }), 413, DRIVER)
  assert.match(body.message, /identity card image/)
  // Exactly 5 MB is still accepted; one byte more is not (the rule is shared with the form).
  assert.equal(identityCardFileIssue({ type: 'image/png', size: IDENTITY_CARD_POLICY.maxBytes }), '')
  assert.equal(identityCardFileIssue({ type: 'image/png', size: IDENTITY_CARD_POLICY.maxBytes + 1 }), 'size')
})

test('6b. the size limit is enforced WHILE the file streams: a 40 MB body is refused after about 5 MB', async () => {
  const boundary = '----identitytest'
  const CHUNK = 64 * 1024
  const TOTAL = 40 * 1024 * 1024
  let pulled = 0
  async function* body() {
    yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${HEAD}"; filename="${HEAD}.png"\r\nContent-Type: image/png\r\n\r\n`)
    for (let sent = 0; sent < TOTAL; sent += CHUNK) {
      pulled += CHUNK
      yield Buffer.alloc(CHUNK, 0x41)
    }
    yield Buffer.from(`\r\n--${boundary}--\r\n`)
  }
  const req = Readable.from(body())
  req.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` }

  let pulledAtRejection = 0
  await assert.rejects(
    parseMultipart(req, {
      maxFileBytes: IDENTITY_CARD_POLICY.maxBytes,
      maxFiles: REGISTRATION_MAX_FILES,
      maxRequestBytes: 64 * 1024 * 1024,
      allowedFields: new Set(['payload']),
      fileFieldPattern: REGISTRATION_FILE_FIELD_PATTERN,
      fileSizeMessage: (field) => `too large: ${field}`,
    }).catch((error) => { pulledAtRejection = pulled; throw error }),
    (error) => error instanceof MultipartError && error.status === 413 && error.field === HEAD && error.message === `too large: ${HEAD}`,
  )
  assert.ok(pulledAtRejection < 8 * 1024 * 1024, `rejected after ${pulledAtRejection} bytes of ${TOTAL}: the body was not buffered to its end`)
  assert.ok(pulledAtRejection >= IDENTITY_CARD_POLICY.maxBytes, 'and not before the limit was actually reached')
})

// =================================================================================
// 7-11. What is really in the file decides
// =================================================================================

test('7. a fake .jpg that contains no image is refused', async () => {
  const body = await assertRefused('fake jpeg', imageParts({ [HEAD]: { buffer: IMAGES.text, type: 'image/jpeg', filename: `${HEAD}.jpg` } }), 415, HEAD)
  assert.match(body.message, /must be a JPG or PNG image/)
  await assertRefused('fake png', imageParts({ [DRIVER]: { buffer: Buffer.from('<?php system($_GET["c"]); ?>'), type: 'image/png', filename: `${DRIVER}.png` } }), 415, DRIVER)
})

test('8. MIME spoofing is refused: the declared type, the name and the real bytes must all agree', async () => {
  // PNG bytes declared as JPEG.
  const declared = await assertRefused('png as jpeg', imageParts({ [HEAD]: { buffer: IMAGES.png, type: 'image/jpeg', filename: `${HEAD}.jpg` } }), 415, HEAD)
  assert.match(declared.message, /file type does not match its content/)
  // JPEG bytes declared as PNG.
  await assertRefused('jpeg as png', imageParts({ [DRIVER]: { buffer: IMAGES.jpeg, type: 'image/png', filename: `${DRIVER}.png` } }), 415, DRIVER)
  // Right bytes, right declared type, wrong extension.
  const named = await assertRefused('png named jpg', imageParts({ [HEAD]: { buffer: IMAGES.png, type: 'image/png', filename: `${HEAD}.jpg` } }), 415, HEAD)
  assert.match(named.message, /file name does not match its content/)
  // No extension at all.
  await assertRefused('no extension', imageParts({ [HEAD]: { filename: HEAD } }), 415, HEAD)
  // A PDF that claims to be a PNG.
  await assertRefused('pdf as png', imageParts({ [DRIVER]: { buffer: IMAGES.pdf, type: 'image/png', filename: `${DRIVER}.png` } }), 415, DRIVER)
})

test('9. a PDF is refused, declared honestly or renamed', async () => {
  await assertRefused('pdf', imageParts({ [HEAD]: { buffer: IMAGES.pdf, type: 'application/pdf', filename: `${HEAD}.pdf` } }), 415, HEAD)
  await assertRefused('pdf renamed', imageParts({ [DRIVER]: { buffer: IMAGES.pdf, type: 'image/jpeg', filename: `${DRIVER}.jpg` } }), 415, DRIVER)
})

test('10. SVG, GIF, TIFF, HEIC, WEBP, ZIP, executables, HTML and JavaScript are all refused', async () => {
  const cases = {
    svg: [IMAGES.svg, 'image/svg+xml', 'svg'],
    'svg as png': [IMAGES.svg, 'image/png', 'png'],
    gif: [IMAGES.gif, 'image/gif', 'gif'],
    tiff: [IMAGES.tiff, 'image/tiff', 'tiff'],
    heic: [IMAGES.heic, 'image/heic', 'heic'],
    // Accepted for a student card, deliberately not for an identity document.
    webp: [IMAGES.webp, 'image/webp', 'webp'],
    zip: [IMAGES.zip, 'application/zip', 'zip'],
    exe: [IMAGES.exe, 'application/x-msdownload', 'exe'],
    'exe as jpg': [IMAGES.exe, 'image/jpeg', 'jpg'],
    html: [IMAGES.html, 'text/html', 'html'],
    'html as jpg': [IMAGES.html, 'image/jpeg', 'jpg'],
    js: [IMAGES.js, 'application/javascript', 'js'],
  }
  for (const [name, [buffer, type, extension]] of Object.entries(cases)) {
    await assertRefused(name, imageParts({ [HEAD]: { buffer, type, filename: `${HEAD}.${extension}` } }), 415, HEAD)
  }
  // The student cards keep accepting WEBP: the identity rule is narrower on purpose.
  const { store, handler } = makeApi()
  const ok = await submit(handler, { files: imageParts({ studentCard_2: { buffer: IMAGES.webp, type: 'image/webp', filename: 'studentCard_2.webp' } }) })
  assert.equal(ok.status, 201)
  assert.equal(store.students[1].student_card_mime, 'image/webp')
  assert.deepEqual(IDENTITY_CARD_TYPES, ['image/jpeg', 'image/png'])
  assert.ok(Object.keys(STUDENT_CARD_POLICY.types).includes('image/webp'))
})

test('11. an empty file is refused', async () => {
  const body = await assertRefused('empty head', imageParts({ [HEAD]: { buffer: Buffer.alloc(0) } }), 400, HEAD)
  assert.match(body.message, /identity card image is empty/)
  await assertRefused('empty driver', imageParts({ [DRIVER]: { buffer: Buffer.alloc(0) } }), 400, DRIVER)
})

// =================================================================================
// 12-16. Idempotency, retries, storage and database failures, cleanup
// =================================================================================

test('12. a duplicate submission neither registers nor stores anything a second time', async () => {
  const { store, handler } = makeApi()
  const first = await submit(handler)
  const uploadsAfterFirst = store.counters.uploadIdentity
  const again = await submit(handler)
  assert.equal(first.status, 201)
  assert.equal(again.status, 200)
  assert.deepEqual(again.body, { success: true, reference: first.body.reference, alreadyProcessed: true })
  assert.equal(store.registrations.length, 1)
  assert.equal(store.identity.size, 2)
  assert.equal(store.counters.uploadIdentity, uploadsAfterFirst, 'the replay does not upload the identity cards again')
  assert.equal(store.cards.size, 3)

  // Browser retry after the response was lost, with re-encoded photos: same outcome.
  const retried = await submit(handler, { files: imageParts({ [HEAD]: { buffer: IMAGES.jpeg, type: 'image/jpeg', filename: `${HEAD}.jpg` } }) })
  assert.equal(retried.status, 200)
  assert.equal(store.identity.size, 2)
  assert.equal(store.registrations[0].delegation_head_id_card_sha256, sha256(IMAGES.png), 'the first document is the one on record')
})

test('12b. two simultaneous identical submissions create one registration and two identity files', async () => {
  const { store, handler } = makeApi()
  const [a, b] = await Promise.all([submit(handler), submit(handler)])
  assert.ok([a, b].some((response) => response.status === 201), 'one of them creates it')
  assert.ok([a, b].every((response) => [201, 200, 409].includes(response.status)), `statuses ${a.status}/${b.status}`)
  assert.equal(store.registrations.length, 1)
  assert.equal(store.identity.size, 2)
  assert.equal(store.students.length, 3)
})

test('13. a retry after a partial failure completes the registration, with no duplicate and no orphan', async () => {
  const { store, handler } = makeApi()
  store.fail.uploadIdentity = 2 // the driver's card fails after the head's succeeded
  const logged = await captureLogs(async () => {
    const failed = await submit(handler)
    assert.equal(failed.status, 500)
    assert.ok(store.empty(), 'the head\'s card, the student cards and the row were all rolled back')
  })
  assert.ok(logged.length > 0)

  store.fail.uploadIdentity = 0 // storage is back; the browser retries the same submissionId
  const retry = await submit(handler)
  assert.equal(retry.status, 201)
  assert.equal(store.registrations.length, 1)
  assert.equal(store.identity.size, 2)
  assert.equal(store.cards.size, 3)
  assert.equal(store.students.length, 3)
  assert.ok(store.registrations[0].delegation_head_id_card_path && store.registrations[0].driver_id_card_path)
})

test('14. a storage failure while saving an identity card answers a generic 500 and leaves nothing', async () => {
  for (const at of [1, 2]) {
    const { store, handler } = makeApi()
    store.fail.uploadIdentity = at
    const logged = await captureLogs(async () => {
      const { status, body } = await submit(handler)
      assert.equal(status, 500)
      assert.deepEqual(body, { success: false, message: 'We could not save your registration. Please try again.' })
    })
    assert.ok(store.empty(), `failure at identity upload ${at}: nothing left`)
    assert.ok(logged.length > 0)
  }
  // And a failure in the student-card bucket is compensated for the identity cards too.
  const { store, handler } = makeApi()
  store.fail.uploadCard = 3
  await captureLogs(async () => assert.equal((await submit(handler)).status, 500))
  assert.ok(store.empty())
})

test('15. a database failure AFTER every file was stored answers 500 and the registration never looks complete', async () => {
  const { store, handler } = makeApi()
  store.fail.insertStudents = true
  await captureLogs(async () => {
    const { status } = await submit(handler)
    assert.equal(status, 500)
  })
  assert.equal(store.students.length, 0, 'the students are the completion marker: none exist')
  assert.ok(store.empty())
})

test('16. cleanup after a failed persistence removes exactly the files this attempt planned', async () => {
  const { store, handler } = makeApi()
  store.fail.insertStudents = true
  await captureLogs(() => submit(handler))
  assert.equal(store.counters.uploadIdentity, 2, 'both identity cards had been stored...')
  const [removed] = store.counters.removeIdentity
  assert.equal(removed.length, 2, '...and both were removed')
  assert.ok(removed.every((path) => /^edition-2\/[0-9a-f-]{36}\/(delegation-head|driver)\/[0-9a-f-]{36}\.(png|jpg)$/.test(path)))
  assert.equal(store.identity.size, 0)
  assert.equal(store.cards.size, 0)
})

test('16b. if a file cannot be removed the row is KEPT, and the next stale attempt removes it by its recorded path', async () => {
  const { store, handler } = makeApi()
  store.fail.insertStudents = true
  store.fail.removeIdentity = true
  await captureLogs(() => submit(handler))
  assert.equal(store.registrations.length, 1, 'the row survives: it is the only thing that still says where the cards are')
  assert.equal(store.identity.size, 2, 'the two files are still there, and still referenced')
  const kept = [store.registrations[0].delegation_head_id_card_path, store.registrations[0].driver_id_card_path]
  assert.ok(kept.every((path) => store.identity.has(path)))

  // Storage recovers. Too early: still processing.
  store.fail.insertStudents = false
  store.fail.removeIdentity = false
  const early = await submit(handler)
  assert.equal(early.status, 409)

  // Long enough: the dead attempt's files (by recorded path) and row are discarded, then it is redone.
  const later = makeApiSharing(store, new Date(NOW.getTime() + STALE_AFTER_MS + 1))
  const done = await submit(later)
  assert.equal(done.status, 201)
  assert.equal(store.registrations.length, 1)
  assert.equal(store.identity.size, 2, 'the old files were removed: exactly the new pair remains')
  assert.ok(kept.every((path) => !store.identity.has(path)), 'no orphan from the dead attempt')
})

function makeApiSharing(store, now) {
  delete process.env.VERCEL
  return createRegisterHandler({ createStore: () => store, createDocumentStore: () => null, createMagicLinkStore: () => null, now: () => now })
}

test('16c. a stale unfinished registration is discarded with its identity files, then redone', async () => {
  const { store, handler } = makeApi()
  store.fail.insertStudents = true
  store.fail.deleteRegistration = true
  await captureLogs(() => submit(handler)) // files removed, but the row could not be deleted
  assert.equal(store.identity.size, 0)
  assert.equal(store.registrations.length, 1)
  store.fail.insertStudents = false
  store.fail.deleteRegistration = false
  const done = await submit(makeApiSharing(store, new Date(NOW.getTime() + STALE_AFTER_MS + 1)))
  assert.equal(done.status, 201)
  assert.equal(store.registrations.length, 1)
  assert.equal(store.identity.size, 2)
})

// =================================================================================
// 17. SHA-256
// =================================================================================

test('17. the SHA-256 is computed by the server from the received bytes, lowercase hex, and never taken from the client', async () => {
  const cards = await validateIdentityCardsV4(new Map([
    [HEAD, { buffer: IMAGES.png, mimeType: 'image/png', filename: `${HEAD}.png` }],
    [DRIVER, { buffer: IMAGES.jpeg, mimeType: 'image/jpeg', filename: `${DRIVER}.jpg` }],
  ]))
  assert.equal(cards.ok, true)
  assert.deepEqual(cards.cards.map((card) => card.sha256), [sha256(IMAGES.png), sha256(IMAGES.jpeg)])
  for (const { sha256: digest } of cards.cards) assert.match(digest, /^[0-9a-f]{64}$/)

  // What is stored is what was hashed: recompute from the stored object.
  const { store, handler } = makeApi()
  await submit(handler)
  for (const [path, object] of store.identity) {
    const row = store.registrations[0]
    const column = path.includes('/delegation-head/') ? row.delegation_head_id_card_sha256 : row.driver_id_card_sha256
    assert.equal(object.sha256, column)
  }

  // A checksum from the client has no way in: not in the JSON (closed objects), not as a part.
  const inJson = validPayload()
  inJson.delegationHead.sha256 = 'a'.repeat(64)
  const json = await submit(makeApi().handler, { payload: inJson })
  assert.equal(json.status, 400)
  assert.equal(json.body.field, 'delegationHead.sha256')
  const asPart = await submit(makeApi().handler, { fields: [{ name: 'payload', value: JSON.stringify(validPayload()) }, { name: 'delegationHeadIdCardSha256', value: 'a'.repeat(64) }] })
  assert.equal(asPart.status, 400)
})

// =================================================================================
// 18-21. Private bucket, no URL, no secret, no raw document in logs
// =================================================================================

const strip = (sql) => sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').toLowerCase()
const MIGRATION = 'supabase/migrations/20260923120000_aivex_v4_identity_documents.sql'

test('18. the bucket is private everywhere it is configured, with no policy that could open it', async () => {
  assert.equal(IDENTITY_CARD_POLICY.bucket, 'aivex-id-cards')
  assert.equal(IDENTITY_CARD_POLICY.publicBucket, false)
  assert.notEqual(IDENTITY_CARD_POLICY.bucket, STUDENT_CARD_POLICY.bucket, 'its own bucket, apart from the student cards')
  assert.equal(IDENTITY_CARD_POLICY.printable, false)
  assert.equal(IDENTITY_CARD_POLICY.classification, 'internal_verification')

  const sql = strip(await read(MIGRATION))
  assert.match(sql, /insert into storage\.buckets \(id, name, public, file_size_limit, allowed_mime_types\)\s+values \('aivex-id-cards', 'aivex-id-cards', false, 5242880, array\['image\/jpeg', 'image\/png'\]\)\s+on conflict \(id\) do update set public = false/)
  assert.doesNotMatch(sql, /public\s*=\s*true|,\s*true\s*,/)
  assert.doesNotMatch(sql, /create\s+policy|alter\s+policy/, 'no storage or table policy is created')
  assert.doesNotMatch(sql, /\bgrant\b|\brevoke\b/, 'no privilege is granted to anyone, none is changed')
  assert.doesNotMatch(sql, /\banon\b|\bauthenticated\b/)
  assert.doesNotMatch(sql, /row level security/, 'the existing RLS posture is not touched')

  // The bucket name is never a candidate-facing value.
  for (const file of await listSource('src')) {
    assert.doesNotMatch(await read(file), /aivex-id-cards/, `${file} must not know the private bucket`)
  }
})

async function listSource(dir, extensions = ['.js', '.jsx']) {
  const names = await readdir(new URL(`../${dir}/`, import.meta.url), { recursive: true })
  return names.filter((name) => extensions.some((extension) => name.endsWith(extension))).map((name) => `${dir}/${name.replace(/\\/g, '/')}`)
}

test('19. no public or signed URL is ever generated, and none is stored or returned', async () => {
  for (const dir of ['api', 'shared', 'src', 'scripts']) {
    for (const file of await listSource(dir, ['.js', '.jsx', '.mjs'])) {
      assert.doesNotMatch(await read(file), /getPublicUrl|createSignedUrl|createSignedUrls/, file)
    }
  }
  const { store, handler } = makeApi()
  const { body, headers } = await submit(handler)
  assert.deepEqual(Object.keys(body).sort(), ['reference', 'success'])
  assert.doesNotMatch(JSON.stringify([body, headers]), /https?:|edition-|storage|bucket|aivex-id-cards|delegation-head|\.png|\.jpg/i)
  // What the database holds is a private path, never a URL.
  for (const row of store.registrations) {
    for (const column of ['delegation_head_id_card_path', 'driver_id_card_path']) assert.doesNotMatch(row[column], /^https?:|token=|signed/i)
  }
})

test('20. no secret and no storage detail reaches the frontend or a response', async () => {
  for (const file of await listSource('src')) {
    assert.doesNotMatch(await read(file), /SUPABASE_SECRET_KEY|SUPABASE_URL|service_role\s*key|delegation-head\/|edition-\$\{/, file)
  }
  for (const file of ['IdentityCardUpload.jsx', 'IdentityDocuments.jsx']) {
    const source = await read(`src/pages/aivex/register/${file}`)
    assert.doesNotMatch(source, /supabase|storage\.|bucket|createObjectURL|useObjectUrl|<img|FileReader|localStorage|sessionStorage|fetch\(|XMLHttpRequest/i, file)
  }
  const { handler } = makeApi()
  const wrong = await submit(handler, { files: imageParts({ [HEAD]: { buffer: IMAGES.pdf, type: 'application/pdf', filename: `${HEAD}.pdf` } }) })
  assert.doesNotMatch(JSON.stringify(wrong.body), /supabase|sb_secret|service_role|postgres|edition-|stack/i)
})

test('21. no image, path, checksum or file name is ever logged, on any failure path', async () => {
  const scenarios = [
    (store) => { store.fail.uploadIdentity = 1 },
    (store) => { store.fail.insertStudents = true },
    (store) => { store.fail.insertStudents = true; store.fail.removeIdentity = true },
    (store) => { store.fail.uploadCard = 2 },
  ]
  const forbidden = [
    /edition-\d+\//, /delegation-head/, /driver\//, /[0-9a-f]{40,}/i, /delegationHeadIdCard|driverIdCard/, /\.(png|jpg)/i,
    /iVBOR|\/9j\//, /karim|nabil|haddad|saidi|amina|benali/i, /0047|A1B2C3D4|0661|0770|0555/, /univ-bba/, /<Buffer|Uint8Array/,
  ]
  for (const arrange of scenarios) {
    const { store, handler } = makeApi()
    arrange(store)
    const logged = await captureLogs(() => submit(handler))
    assert.ok(logged.length > 0, 'the failure is logged (stage and code)')
    const text = JSON.stringify(logged)
    for (const pattern of forbidden) assert.doesNotMatch(text, pattern, `log line leaked ${pattern}`)
  }
  // Statically: nothing that could carry a document is ever an argument of a log call.
  for (const file of ['api/aivex/register.js', 'api/_lib/aivex-registration-v4.js', 'api/_lib/aivex-validation-v4.js', 'api/_lib/multipart.js']) {
    for (const [, args] of (await read(file)).matchAll(/console\.(?:error|log|warn|info|debug)\(([^)]*)\)/g)) {
      const logged = args.replace(/'[^']*'/g, "''")
      assert.doesNotMatch(logged, /buffer|sha256|path|card|identity|payload|body|file|token/i, `${file} logs ${args}`)
    }
  }
})

// =================================================================================
// 22-23. Origin and rate limit
// =================================================================================

test('22. a cross-site submission is refused before anything is read or written (trusted origin)', async () => {
  const { store, handler, opened } = makeApi()
  process.env.VERCEL = '1'
  try {
    const evil = await submit(handler, { headers: { origin: 'https://evil.example', host: 'www.infinty-bba.com' } })
    assert.equal(evil.status, 403)
    assert.equal(evil.body.success, false)
    assert.equal(opened(), 0)
    assert.ok(store.empty())
    const foreignReferer = await submit(handler, { headers: { referer: 'https://evil.example/aivex/register', host: 'www.infinty-bba.com' } })
    assert.equal(foreignReferer.status, 403)
    const own = await submit(handler, { headers: { origin: 'https://www.infinty-bba.com', host: 'www.infinty-bba.com' } })
    assert.equal(own.status, 201)
  } finally {
    delete process.env.VERCEL
  }
})

test('23. submissions are rate limited per client: the sixth attempt in the window is refused', async () => {
  const { store, handler } = makeApi()
  const ip = '203.0.113.201'
  const statuses = []
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await submit(handler, { fields: [], files: [], ip })
    statuses.push(response.status)
    if (attempt === 5) {
      assert.equal(response.body.success, false)
      assert.ok(Number(response.headers['Retry-After']) >= 1, 'tells the client when to retry')
    }
  }
  assert.deepEqual(statuses, [400, 400, 400, 400, 400, 429])
  assert.ok(store.empty())
  // Another client is not affected.
  assert.equal((await submit(handler, { fields: [], files: [], ip: '203.0.113.202' })).status, 400)
})

// =================================================================================
// Multipart hygiene: unexpected, duplicated or malformed parts
// =================================================================================

test('multipart: an unexpected file, a duplicated file, a text part with a file name, or garbage is refused', async () => {
  const cases = [
    ['unexpected file part', [...imageParts(), imagePart('idCard', IMAGES.png, 'image/png', 'idCard.png')]],
    ['a sixth file', [...imageParts(), imagePart('studentCard_4', IMAGES.png, 'image/png', 'studentCard_4.png')]],
    ['duplicated identity card', [...imageParts(), imagePart(DRIVER, IMAGES.png, 'image/png', `${DRIVER}.png`)]],
  ]
  for (const [name, files] of cases) {
    const { store, handler, opened } = makeApi()
    const { status } = await submit(handler, { files })
    assert.ok([400, 413].includes(status), `${name}: ${status}`)
    assert.equal(opened(), 0, name)
    assert.ok(store.empty(), name)
  }
  // An identity card sent as a plain text field is not a file: refused.
  const asText = await submit(makeApi().handler, { fields: [{ name: 'payload', value: JSON.stringify(validPayload()) }, { name: HEAD, value: 'data:image/png;base64,AAAA' }], files: imageParts().filter((entry) => entry.field !== HEAD) })
  assert.equal(asText.status, 400)
  // Two payload parts.
  const twice = await submit(makeApi().handler, { fields: [{ name: 'payload', value: '{}' }, { name: 'payload', value: '{}' }] })
  assert.equal(twice.status, 400)
  // Not multipart at all.
  const handler = makeApi().handler
  const plain = await new Promise((resolve) => {
    const req = Readable.from([Buffer.from('{}')])
    Object.assign(req, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp() }, socket: {} })
    handler(req, { headers: {}, setHeader() {}, end(body) { resolve({ status: this.statusCode, body: JSON.parse(body) }) } })
  })
  assert.equal(plain.status, 415)
  // A multipart header over a body that is not multipart.
  const garbage = await new Promise((resolve) => {
    const req = Readable.from([Buffer.from('this is not a multipart body')])
    Object.assign(req, { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=xyz', 'x-forwarded-for': nextIp() }, socket: {} })
    handler(req, { headers: {}, setHeader() {}, end(body) { resolve({ status: this.statusCode, body: JSON.parse(body) }) } })
  })
  assert.equal(garbage.status, 400)
})

test('the payload must name each identity card part exactly, and a client path never reaches storage', async () => {
  for (const [subject, field] of [['delegationHead', HEAD], ['driver', DRIVER]]) {
    for (const bad of [undefined, '', 'idCard', `../../${field}`, `${field}.png`, 'edition-2/x/y.png', 123]) {
      const payload = validPayload()
      if (bad === undefined) delete payload[subject].idCard
      else payload[subject].idCard = bad
      const { status, body } = await submit(makeApi().handler, { payload })
      assert.equal(status, 400, `${subject}.idCard = ${String(bad)}`)
      assert.equal(body.field, `${subject}.idCard`)
    }
  }
  // No path, URL or national number can be smuggled through the JSON either.
  for (const key of ['path', 'url', 'idCardPath', 'nationalId', 'idNumber']) {
    const payload = validPayload()
    payload.delegationHead[key] = '../../etc/passwd'
    const { status, body } = await submit(makeApi().handler, { payload })
    assert.equal(status, 400, key)
    assert.equal(body.field, `delegationHead.${key}`)
  }
})

// =================================================================================
// Paths: server-generated, no personal data, unguessable
// =================================================================================

test('storage paths are built by the server from random ids, and contain nothing about the people', async () => {
  const { store, handler } = makeApi()
  await submit(handler)
  await submit(handler, { payload: validPayload({ submissionId: '9b1d2c3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e' }) })
  assert.equal(store.registrations.length, 2)
  const paths = store.registrations.flatMap((row) => [row.delegation_head_id_card_path, row.driver_id_card_path])
  assert.equal(new Set(paths).size, 4, 'every file has its own path')
  const randomParts = paths.map((path) => path.split('/').at(-1).replace(/\.\w+$/, ''))
  assert.equal(new Set(randomParts).size, 4, 'the last component is random per file')
  for (const part of randomParts) assert.match(part, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  for (const path of paths) {
    assert.doesNotMatch(path, /karim|haddad|nabil|saidi|amina|benali|infinity|univ|0047|a1b2|0661|0770|0555|@/i, path)
  }
  assert.ok(paths.every((path) => path.startsWith('edition-2/')), 'namespaced by edition, like every other AIVEX object')
})

test('identityCardStoragePath: exact shape, normalised case, and every invalid input refused', () => {
  const registrationId = '6c1f0e2a-7b3d-4c5e-9f8a-0b1c2d3e4f5a'
  const randomId = '11111111-2222-4333-8444-555555555555'
  assert.equal(identityCardStoragePath(registrationId, 'delegationHead', 'image/jpeg', randomId), `edition-2/${registrationId}/delegation-head/${randomId}.jpg`)
  assert.equal(identityCardStoragePath(registrationId.toUpperCase(), 'driver', 'image/png', randomId.toUpperCase(), 3), `edition-3/${registrationId}/driver/${randomId}.png`)
  for (const bad of [
    ['../x', 'driver', 'image/png', randomId], [registrationId, 'driver', 'image/png', '../../x'], [registrationId, 'student', 'image/png', randomId],
    [registrationId, 'driver', 'image/webp', randomId], [registrationId, 'driver', 'application/pdf', randomId], [registrationId, 'driver', 'image/png', undefined],
    [undefined, 'driver', 'image/png', randomId],
  ]) assert.throws(() => identityCardStoragePath(...bad), TypeError, JSON.stringify(bad))
  assert.throws(() => identityCardStoragePath(registrationId, 'driver', 'image/png', randomId, 0), TypeError)
  assert.equal(identityCardUploadName(HEAD, 'image/jpg'), 'delegationHeadIdCard.jpg')
  assert.equal(identityCardUploadName(DRIVER, 'image/png'), 'driverIdCard.png')
})

test('registerV4 places the planned identity paths in the registration row and uses the server-generated id for both', async () => {
  const store = createStore()
  const ids = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc']
  const identityCards = IDENTITY_CARD_SUBJECTS.map((subject, index) => ({
    subject, field: IDENTITY_CARD_FIELDS[index], buffer: IMAGES.png, mime: 'image/png', extension: 'png', size: IMAGES.png.length, sha256: sha256(IMAGES.png),
  }))
  const cards = [1, 2, 3].map((position) => ({ position, field: `studentCard_${position}`, buffer: IMAGES.png, mime: 'image/png', extension: 'png', size: IMAGES.png.length }))
  const outcome = await registerV4({ store, registration: validRegistration(), cards, identityCards, now: NOW, createId: () => ids.shift() })
  assert.equal(outcome.status, 201)
  const [row] = store.registrations
  assert.equal(row.id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assert.equal(row.delegation_head_id_card_path, 'edition-2/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/delegation-head/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png')
  assert.equal(row.driver_id_card_path, 'edition-2/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/driver/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png')
  assert.deepEqual([...store.identity.keys()], [row.delegation_head_id_card_path, row.driver_id_card_path])
  // Metadata only: the row carries no image, no URL, nothing read from the card.
  assert.deepEqual(Object.keys(row).filter((key) => key.includes('id_card')).sort(), [
    'delegation_head_id_card_mime', 'delegation_head_id_card_path', 'delegation_head_id_card_sha256', 'delegation_head_id_card_size',
    'driver_id_card_mime', 'driver_id_card_path', 'driver_id_card_sha256', 'driver_id_card_size',
  ])
  assert.doesNotMatch(JSON.stringify(row), /base64|data:image|iVBOR|nationalId|national_id|ocr/i)
})

test('registerV4 refuses to write a registration without both validated identity cards', async () => {
  const cards = [1, 2, 3].map((position) => ({ position, field: `studentCard_${position}`, buffer: IMAGES.png, mime: 'image/png', extension: 'png', size: IMAGES.png.length }))
  const good = (subject) => ({ subject, field: `${subject}IdCard`, buffer: IMAGES.png, mime: 'image/png', extension: 'png', size: IMAGES.png.length, sha256: sha256(IMAGES.png) })
  const attempts = [
    undefined, [], [good('delegationHead')], [good('driver')], [good('driver'), good('driver')],
    [good('delegationHead'), { ...good('driver'), sha256: 'NOT-A-HASH' }],
    [good('delegationHead'), { ...good('driver'), mime: 'image/webp' }],
    [good('delegationHead'), { ...good('driver'), size: 1 }],
  ]
  for (const identityCards of attempts) {
    const store = createStore()
    const logged = await captureLogs(async () => {
      const outcome = await registerV4({ store, registration: validRegistration(), cards, identityCards, now: NOW })
      assert.equal(outcome.status, 400)
    })
    assert.ok(store.empty() && logged.length === 1)
  }
})

test('registerV4 refuses a store that did not keep the registration id its identity paths name', async () => {
  const store = createStore()
  const insert = store.insertRegistration.bind(store)
  store.insertRegistration = async (row) => insert({ ...row, id: undefined }) // stores another id
  const cards = [1, 2, 3].map((position) => ({ position, field: `studentCard_${position}`, buffer: IMAGES.png, mime: 'image/png', extension: 'png', size: IMAGES.png.length }))
  const identityCards = ['delegationHead', 'driver'].map((subject) => ({
    subject, field: `${subject}IdCard`, buffer: IMAGES.png, mime: 'image/png', extension: 'png', size: IMAGES.png.length, sha256: sha256(IMAGES.png),
  }))
  await captureLogs(async () => {
    const outcome = await registerV4({ store, registration: validRegistration(), cards, identityCards, now: NOW })
    assert.equal(outcome.status, 500)
  })
  assert.ok(store.empty(), 'no file was uploaded under a path that names the wrong registration')
})

// =================================================================================
// 24-26. Nothing else moved: student cards, DOCX, Magic Link, statuses
// =================================================================================

test('24. the three student cards still work, in their own bucket, on their own paths', async () => {
  const { store, handler } = makeApi()
  const { status } = await submit(handler)
  assert.equal(status, 201)
  const [row] = store.registrations
  assert.deepEqual([...store.cards.keys()], [1, 2, 3].map((position) => `edition-2/${row.id}/student-${position}.png`))
  assert.equal(store.students.length, 3)
  assert.ok([...store.cards.keys()].every((path) => !path.includes('delegation-head') && !path.includes('/driver/')))
  assert.ok([...store.identity.keys()].every((path) => !path.includes('student-')))
  // A student card problem keeps its own message and field.
  const bad = await submit(makeApi().handler, { files: imageParts({ studentCard_2: { buffer: IMAGES.pdf, type: 'application/pdf', filename: 'studentCard_2.pdf' } }) })
  assert.equal(bad.status, 415)
  assert.equal(bad.body.field, 'studentCard_2')
  assert.match(bad.body.message, /Student 2: the student card must be a JPG, PNG or WEBP image/)
  const big = await submit(makeApi().handler, { files: imageParts({ studentCard_3: { buffer: Buffer.concat([IMAGES.png, Buffer.alloc(STUDENT_CARD_POLICY.maxBytes)]) } }) })
  assert.equal(big.status, 413)
  assert.equal(big.body.field, 'studentCard_3')
  assert.match(big.body.message, /Each student card must be 5 MB or smaller/)
})

test('25. the official DOCX never sees an identity document: no variable, no column, no placeholder', async () => {
  const described = JSON.stringify(WORD_VARIABLES_V4)
  assert.doesNotMatch(described, /id_card|idCard|identity/i)
  assert.equal(WORD_VARIABLES_V4.length, 29, 'the 29 official variables are unchanged')
  for (const excluded of ['idCard', ...['delegation_head', 'driver'].flatMap((subject) => ['path', 'mime', 'size', 'sha256'].map((suffix) => `${subject}_id_card_${suffix}`))]) {
    assert.ok(WORD_EXCLUDED_FIELDS_V4.includes(excluded), `${excluded} is excluded from the document`)
    assert.equal(described.includes(excluded), false)
  }
  // Even from a row that carries the metadata, the resolved document data has none of it.
  const data = resolveWordDataV4({
    settings: { edition_name: 'AIVEX 2' },
    registration: {
      reference: 'AIVEX2-7K3M9QXT', team_name: 'Infinity AI', delegation_head_name: 'Karim Haddad',
      delegation_head_id_card_path: 'edition-2/x/delegation-head/y.png', delegation_head_id_card_sha256: 'a'.repeat(64),
      driver_id_card_path: 'edition-2/x/driver/y.png', driver_id_card_size: 1234,
    },
    students: [1, 2, 3].map((position) => ({ position, full_name: `S${position}` })),
  })
  assert.equal(Object.keys(data).length, 29)
  assert.doesNotMatch(JSON.stringify(data), /edition-2\/x|delegation-head\/|a{64}|1234/)
  // The document generator only reads the columns its mapping names.
  const documentStore = await read('api/_lib/aivex-document-store.js')
  assert.doesNotMatch(documentStore, /id_card|idCard|identity/i)
  assert.doesNotMatch(documentStore, /select\(\s*['"`]\*/, 'no select * that could pull the identity columns in')
})

test('26. the Magic Link and the candidate status page never touch identity documents', async () => {
  const files = [
    ...(await listSource('api')).filter((file) => /magic-link|aivex\/document\.js|aivex-magic-link|aivex-signed|aivex-document/.test(file)),
    ...(await listSource('src/pages/aivex/status')),
  ]
  assert.ok(files.length >= 10, `sanity: ${files.length} files scanned`)
  for (const file of files) {
    assert.doesNotMatch(await read(file), /id_card|idCard|IdCard|IDENTITY_CARD|identityCard|identity_card|aivex-id-cards/, `${file} must not reach the identity documents`)
  }
  // Only the registration path (and the shared contract) know about them.
  const knowing = []
  for (const file of await listSource('api')) {
    if (/id_card|idCard|IdCard|IDENTITY_CARD|aivex-id-cards/.test(await read(file))) knowing.push(file)
  }
  assert.deepEqual(knowing.sort(), ['api/_lib/aivex-registration-v4.js', 'api/_lib/aivex-validation-v4.js', 'api/aivex/register.js'])
  // The candidate-facing statuses are unchanged: identity documents add none.
  const contract = await read('shared/aivex/contract-v4.js')
  assert.match(contract, /'signed_document_uploaded',\s+'under_review',\s+'changes_required',\s+'validated',/)
})

test('the existing security posture is untouched: no new column privilege, RLS or role in the migration', async () => {
  const raw = await read(MIGRATION)
  const sql = strip(raw)
  // Only what the header says it does: eight nullable columns, two checks, comments, one bucket.
  const columns = [...sql.matchAll(/add column if not exists (\w+) (\w+)([^,;]*)[,;]/g)]
  assert.deepEqual(columns.map(([, name]) => name), [
    'delegation_head_id_card_path', 'delegation_head_id_card_mime', 'delegation_head_id_card_size', 'delegation_head_id_card_sha256',
    'driver_id_card_path', 'driver_id_card_mime', 'driver_id_card_size', 'driver_id_card_sha256',
  ])
  assert.deepEqual(columns.map(([, , type]) => type), ['text', 'text', 'bigint', 'text', 'text', 'text', 'bigint', 'text'])
  for (const [, name, , rest] of columns) assert.equal(rest.trim(), '', `${name}: nullable, no default, no constraint inline`)
  for (const forbidden of [/\bdrop\b(?!\s+constraint if exists aivex_registrations_(delegation_head|driver)_id_card_check)/, /\bdelete\b/, /\btruncate\b/, /\bupdate\s+public\./, /\brename\b/,
    /set not null/, /\bset default\b/, /alter column/, /create table/, /create (unique )?index/, /create trigger/, /create function/]) {
    assert.doesNotMatch(sql, forbidden)
  }
  assert.match(raw, /^-- AIVEX registration — identity documents/)
  assert.match(MIGRATION, /^supabase\/migrations\/\d{14}_aivex_v4_identity_documents\.sql$/)
  const names = (await readdir(new URL('../supabase/migrations/', import.meta.url))).sort()
  assert.equal(names.at(-1), MIGRATION.split('/').at(-1), 'it is the latest migration, applied after every existing one')
  for (const rule of [/is not null/g]) assert.ok((sql.match(rule) || []).length >= 8, 'each branch of the rule spells out is not null (a check passes on NULL)')
  assert.match(sql, /size between 1 and 5242880/)
  assert.match(sql, /\[0-9a-f\]\{64\}/)
})

// =================================================================================
// The form: state, model, wording, and what it never keeps
// =================================================================================

const file = (name, bytes = IMAGES.png, type = 'image/png') => new File([bytes], name, { type })

test('form: the state carries an idCard per person, the payload only names its part, the files travel apart', () => {
  const state = createRegistrationStateV4({ submissionId: SUBMISSION_ID })
  assert.equal(state.delegationHead.idCard, null)
  assert.equal(state.driver.idCard, null)
  Object.assign(state.team, { name: 'Infinity AI', wilaya: '34', institution: 'univ-bba' })
  Object.assign(state.activityOfficial, { role: 'activities_officer', fullName: 'Amina Benali', email: 'a@univ-bba.dz', phone: '0555123456' })
  Object.assign(state.delegationHead, { fullName: 'Karim Haddad', phone: '0661234567', rfid: '0047', idCard: file('CNI karim haddad.png') })
  Object.assign(state.driver, { fullName: 'Nabil Saidi', phone: '0770112233', rfid: 'A1', idCard: file('nabil.jpg', IMAGES.jpeg, 'image/jpeg') })
  state.students.forEach((student) => Object.assign(student, { fullName: `Student ${['One', 'Two', 'Three'][student.position - 1]}`, phone: '0550000000', bacYear: '2022', rfid: `1234567${student.position}`, studentCard: file(`s${student.position}.png`) }))
  state.consent = true

  const payload = buildRegistrationPayloadV4(state)
  assert.equal(payload.delegationHead.idCard, HEAD)
  assert.equal(payload.driver.idCard, DRIVER)
  assert.equal(validateRegistrationV4(payload, { now: NOW }).ok, true)
  assert.doesNotMatch(JSON.stringify(payload), /CNI|nabil\.jpg|base64|data:/)

  const { files } = buildSubmission(state)
  assert.deepEqual(files.map(({ field }) => field), ['studentCard_1', 'studentCard_2', 'studentCard_3', HEAD, DRIVER])
  assert.equal(files.length, REGISTRATION_MAX_FILES)
  assert.equal(files.at(-2).file.name, 'CNI karim haddad.png', 'the File itself is untouched: only the multipart name is derived')

  assert.match(buildSummary(state), /Head of delegation: Karim Haddad[^\n]*\n\s+Identity card: attached/)
  state.driver.idCard = null
  assert.match(buildSummary(state), /Driver: Nabil Saidi[^\n]*\n\s+Identity card: missing/)
  assert.doesNotMatch(buildSummary(state), /CNI|\.png|\.jpg/, 'the copy-to-clipboard summary never carries a file name')
})

test('form: an identity card is required and checked like the API checks it', () => {
  assert.deepEqual(Object.keys(identityIssues({ delegationHead: null, driver: null })), ['delegationHead', 'driver'])
  assert.deepEqual(identityIssues({ delegationHead: file('a.png'), driver: file('b.jpg', IMAGES.jpeg, 'image/jpeg') }), {})
  assert.deepEqual(Object.keys(identityIssues({ delegationHead: file('a.png'), driver: null })), ['driver'])
  for (const [candidate, issue] of [
    [{ type: 'image/webp', size: 10 }, 'type'], [{ type: 'application/pdf', size: 10 }, 'type'], [{ type: 'image/svg+xml', size: 10 }, 'type'],
    [{ type: 'image/gif', size: 10 }, 'type'], [{ type: 'image/png', size: 0 }, 'empty'], [{ type: 'image/jpeg', size: IDENTITY_CARD_POLICY.maxBytes + 1 }, 'size'],
    [{ type: 'image/png', size: 10 }, ''], [{ type: 'image/jpg', size: 10 }, ''], [null, 'missing'],
  ]) {
    assert.equal(identityCardFileIssue(candidate), issue, JSON.stringify(candidate))
    assert.equal(Boolean(checkIdentityFile(candidate)), Boolean(issue), 'form message')
  }
  assert.equal(SECTIONS.identityDocuments.step, SECTIONS.delegationHead.step, 'asked on the delegation step')
  assert.deepEqual(SECTIONS.identityDocuments.fields, ['delegationHead', 'driver'])
})

test('form: FR, EN and AR all carry the identity document wording, without a legal claim or a retention period', () => {
  const keys = ['idKicker', 'idTitle', 'idIntro', 'idPrivacy', 'idHeadLabel', 'idDriverLabel', 'idSpec', 'idHint', 'idUploadTag', 'idDropDefault',
    'idDroppedReload', 'revIdCard', 'errIdRequired', 'errIdFileType']
  for (const lang of ['en', 'fr', 'ar']) {
    const t = getRegistrationStrings(lang)
    for (const key of keys) {
      assert.equal(typeof t[key], 'string', `${lang}.${key}`)
      assert.ok(t[key].trim().length > 3, `${lang}.${key}`)
    }
    assert.equal(typeof t.idProgress({ attached: 1, total: 2 }), 'string')
    assert.match(t.idProgress({ attached: 1, total: 2 }), /1/)
    for (const key of keys.filter((name) => lang !== 'en' && !(lang === 'fr' && name === 'idKicker'))) {
      assert.notEqual(t[key], registrationStrings.en[key], `${lang}.${key} is translated`)
    }
    // Nothing the application cannot guarantee, and no invented retention period.
    for (const key of ['idIntro', 'idPrivacy', 'idHint', 'idSpec']) {
      assert.doesNotMatch(t[key], /gdpr|rgpd|encrypt|chiffr|iso\s?27|compliant|conforme|guarantee|garanti|delete|supprim|retention|conservation|\b\d+\s?(days|jours|months|mois|years|ans)\b|أيام|شهر|سنة|تشفير/i, `${lang}.${key}`)
    }
  }
  const fr = registrationStrings.fr
  assert.equal(fr.idTitle, 'Documents d’identité')
  assert.equal(fr.idHeadLabel, 'Carte nationale d’identité — Chef de délégation')
  assert.equal(fr.idDriverLabel, 'Carte nationale d’identité — Chauffeur')
  assert.equal(fr.idIntro, 'Veuillez importer une image lisible de la carte nationale d’identité.')
  assert.equal(fr.idSpec, 'Image JPG, JPEG ou PNG. Taille maximale : 5 Mo.')
  assert.equal(fr.idPrivacy, 'Les documents d’identité sont collectés uniquement pour la vérification des membres de la délégation. Ils sont stockés dans un espace privé et ne sont pas publiquement accessibles.')
  const en = registrationStrings.en
  assert.equal(en.idHeadLabel, 'National identity card — Head of delegation')
  assert.equal(en.idPrivacy, 'Identity documents are collected only for delegation verification. They are stored in a private storage area and are not publicly accessible.')
  assert.match(registrationStrings.ar.idHeadLabel, /رئيس الوفد/)
  assert.match(registrationStrings.ar.idDriverLabel, /السائق/)
  assert.match(getRegistrationStrings('en').privacyIntro, /RFID/)
  for (const lang of ['en', 'fr', 'ar']) assert.match(getRegistrationStrings(lang).privacyIntro, /RFID/)
})

test('form: an identity card is never previewed, never written to a draft, and only its presence is remembered', async () => {
  const hook = await read('src/pages/aivex/register/useCompetitionRegistration.js')
  assert.match(hook, /delegationHead: personText\(delegationHead\)/)
  assert.match(hook, /driver: personText\(driver\)/)
  assert.match(hook, /const personText = \(person\) => \(\{ fullName: person\.fullName, phone: person\.phone, rfid: person\.rfid \}\)/)
  assert.doesNotMatch(hook, /idCard\??\.name/, 'the file name of an identity card is not kept')
  assert.match(hook, /droppedIdCards: \{\s+delegationHead: Boolean\(delegationHead\.idCard\)/)

  const review = await read('src/pages/aivex/register/ReviewStep.jsx')
  assert.doesNotMatch(review.slice(review.indexOf('function ReviewPerson'), review.indexOf('function ReviewStudent')), /useObjectUrl|<img|createObjectURL/, 'the review confirms the card, it does not draw it')

  const upload = await read('src/pages/aivex/register/IdentityCardUpload.jsx')
  assert.match(upload, /type="file"/)
  assert.match(upload, /<label htmlFor=\{inputId\}>/, 'a real <label> names the input')
  assert.match(upload, /aria-describedby=\{shownError \? errorId : hintId\}/)
  assert.match(upload, /aria-invalid=\{Boolean\(shownError\)\}/)
  assert.match(upload, /role="alert"/)
  assert.match(upload, /accept=\{IDENTITY_CARD_TYPES\.join\(','\)\}/)

  const submission = await read('src/lib/applicationSubmission.js')
  assert.doesNotMatch(submission, /console\./, 'nothing is logged around the upload')
})

test('the identity card is only ever sent to this site\'s own registration endpoint', async () => {
  const submission = (await read('src/lib/applicationSubmission.js')).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n')
  assert.match(submission, /aivex: pickEndpoint\([^)]*\) \|\| '\/api\/aivex\/register'/)
  const model = await read('src/pages/aivex/register/registrationModel.js')
  const hook = await read('src/pages/aivex/register/useCompetitionRegistration.js')
  for (const source of [model, hook]) assert.doesNotMatch(source, /https?:\/\/(?!www\.instagram)/i)
  // The registration request is the only place a File is put on the wire.
  assert.equal((hook.match(/submitAivexRegistrationV4\(/g) || []).length, 1)
})

test('toRegistrationRow without identity cards is still the plain v4 row (no id, no identity column)', () => {
  const row = toRegistrationRow(validRegistration(), { reference: 'AIVEX2-TEST0000', fingerprint: 'f'.repeat(64), source: null, now: NOW })
  assert.equal('id' in row, false)
  assert.equal(Object.keys(row).some((key) => key.includes('id_card')), false)
})

test('validateRegistrationFilesV4 checks the five parts in form order and reports the first problem', async () => {
  const students = validRegistration().students
  const parts = (overrides) => new Map(imageParts(overrides).map((entry) => [entry.field, { buffer: entry.buffer, mimeType: entry.type, filename: entry.filename }]))
  const ok = await validateRegistrationFilesV4(students, parts({}))
  assert.equal(ok.ok, true)
  assert.equal(ok.cards.length, 3)
  assert.equal(ok.identityCards.length, 2)
  assert.deepEqual(ok.identityCards.map((card) => card.subject), ['delegationHead', 'driver'])
  // Both an identity card and a student card are wrong: the delegation step comes first in the form.
  const both = await validateRegistrationFilesV4(students, parts({ studentCard_1: { buffer: IMAGES.pdf }, [DRIVER]: { buffer: IMAGES.pdf } }))
  assert.equal(both.field, DRIVER)
  const unexpected = parts({})
  unexpected.set('idCard', { buffer: IMAGES.png, mimeType: 'image/png', filename: 'idCard.png' })
  assert.equal((await validateRegistrationFilesV4(students, unexpected)).field, 'idCard')
})
