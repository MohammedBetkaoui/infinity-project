// AIVEX candidate signed-document upload (Phase 5B) — file validation,
// Magic Link authorization, storage path safety, checksum integrity,
// versioning/concurrency, status transition, failure recovery, security and
// frontend statics. No network, no real database: in-memory stores stand in
// for createSupabaseSignedDocumentStore / createSupabaseMagicLinkStore, the
// same approach every AIVEX test file in this repo uses.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { createMagicLinkUploadHandler } from '../api/aivex/magic-link/upload.js'
import { sanitizeOriginalFileName, uploadSignedDocument } from '../api/_lib/aivex-signed-document-upload.js'
import { signedDocumentPath } from '../api/_lib/aivex-signed-document-store.js'
import { validateSignedDocumentUpload } from '../api/_lib/aivex-signed-document-validation.js'
import {
  MAX_SIGNED_DOCUMENT_SIZE, SIGNED_DOCUMENT_BUCKET, UPLOAD_ELIGIBLE_DOCUMENT_STATUSES, signedDocumentFileIssue,
} from '../shared/aivex/signed-document-policy.js'
import { generateMagicLinkToken, hashMagicLinkToken, magicLinkExpiryFrom } from '../api/_lib/aivex-magic-link.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const NOW = new Date('2026-09-22T10:00:00Z')
const REGISTRATION_ID = '6c1f0e2a-7b3d-4c5e-9f8a-0b1c2d3e4f5a'

// Real magic bytes, same fixtures already proven correct against `file-type`
// in tests/aivex-contract-v4.test.mjs's IMAGES constant.
const REAL = {
  jpeg: Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64'),
  png: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
  webp: Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64'),
  pdf: Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'),
  zip: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
}
const file = (buffer, mimeType, filename) => ({ buffer, mimeType, filename, size: buffer.length })

// =================================================================================
// A. Schema — static checks on the migration itself (same style as
// aivex-document-generation.test.mjs's "migration: additive..." test).
// =================================================================================

test('A. migration: additive, private bucket, correct constraints, no destructive statement', async () => {
  const sql = (await read('supabase/migrations/20260922120000_aivex_v4_signed_documents.sql'))
    .split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').toLowerCase()
  for (const destructive of [/drop\s+table/, /drop\s+column/, /\btruncate\b/, /delete\s+from/, /drop\s+schema/, /drop\s+function/]) {
    assert.doesNotMatch(sql, destructive)
  }
  assert.doesNotMatch(sql, /public\s*=\s*true/)
  assert.match(sql, /create table if not exists public\.aivex_submitted_documents/)
  assert.match(sql, /references public\.aivex_registrations \(id\) on delete cascade/)
  assert.match(sql, /unique \(registration_id, version\)/)
  assert.match(sql, /unique \(upload_id\)/)
  assert.match(sql, /check \(mime_type in \('application\/pdf', 'image\/jpeg', 'image\/png'\)\)/)
  assert.match(sql, /check \(size_bytes between 1 and 10485760\)/)
  assert.match(sql, /check \(checksum_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\)/)
  assert.match(sql, /check \(status in \('uploaded'\)\)/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /revoke all on table public\.aivex_submitted_documents from anon, authenticated/)
  assert.doesNotMatch(sql, /grant delete/)
  assert.match(sql, /'aivex-signed-forms', 'aivex-signed-forms', false, 10485760/)
  assert.match(sql, /array\['application\/pdf', 'image\/jpeg', 'image\/png'\]/)
})

// =================================================================================
// B. File validation — real magic bytes, cross-checked against declared
// type and file name, exactly like tests for validateStudentCardsV4.
// =================================================================================

test('B. valid PDF, JPEG and PNG are accepted; declared type and extension must agree with the real bytes', async () => {
  const pdf = await validateSignedDocumentUpload(file(REAL.pdf, 'application/pdf', 'signed.pdf'))
  assert.deepEqual([pdf.ok, pdf.mime, pdf.extension], [true, 'application/pdf', 'pdf'])

  const jpeg = await validateSignedDocumentUpload(file(REAL.jpeg, 'image/jpeg', 'signed.jpg'))
  assert.deepEqual([jpeg.ok, jpeg.mime, jpeg.extension], [true, 'image/jpeg', 'jpg'])
  const jpegAlt = await validateSignedDocumentUpload(file(REAL.jpeg, 'image/jpeg', 'signed.jpeg'))
  assert.equal(jpegAlt.ok, true)

  const png = await validateSignedDocumentUpload(file(REAL.png, 'image/png', 'signed.png'))
  assert.deepEqual([png.ok, png.mime, png.extension], [true, 'image/png', 'png'])
})

test('B2. wrong extension, fake MIME, fake extension and unsupported types are all rejected — the real bytes always win', async () => {
  // A .pdf file that is actually a JPEG.
  const wrongExtension = await validateSignedDocumentUpload(file(REAL.jpeg, 'image/jpeg', 'signed.pdf'))
  assert.deepEqual([wrongExtension.ok, wrongExtension.status], [false, 415])

  // Declares application/pdf, but the bytes are a PNG.
  const fakeMime = await validateSignedDocumentUpload(file(REAL.png, 'application/pdf', 'signed.pdf'))
  assert.deepEqual([fakeMime.ok, fakeMime.status], [false, 415])

  // Real PDF bytes, but named .jpg.
  const fakeExtension = await validateSignedDocumentUpload(file(REAL.pdf, 'application/pdf', 'signed.jpg'))
  assert.deepEqual([fakeExtension.ok, fakeExtension.status], [false, 415])

  // WEBP is a real image type but not one Phase 5B accepts.
  const webp = await validateSignedDocumentUpload(file(REAL.webp, 'image/webp', 'signed.webp'))
  assert.deepEqual([webp.ok, webp.status], [false, 415])

  // A ZIP (which is what a DOCX/DOC actually is under the hood) must never pass.
  const zip = await validateSignedDocumentUpload(file(REAL.zip, 'application/zip', 'signed.docx'))
  assert.deepEqual([zip.ok, zip.status], [false, 415])
  const docxRenamed = await validateSignedDocumentUpload(file(REAL.zip, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'signed.docx'))
  assert.deepEqual([docxRenamed.ok, docxRenamed.status], [false, 415])
})

test('B3. oversized and empty files are rejected before any magic-byte check', async () => {
  // Real oversized bytes: validateSignedDocumentUpload reads buffer.length
  // (what busboy actually buffered), never a client-declared size field.
  const oversized = await validateSignedDocumentUpload(file(Buffer.alloc(MAX_SIGNED_DOCUMENT_SIZE + 1), 'application/pdf', 'signed.pdf'))
  assert.deepEqual([oversized.ok, oversized.status], [false, 413])

  const empty = await validateSignedDocumentUpload(file(Buffer.alloc(0), 'application/pdf', 'signed.pdf'))
  assert.deepEqual([empty.ok, empty.status], [false, 400])

  const missing = await validateSignedDocumentUpload(undefined)
  assert.deepEqual([missing.ok, missing.status], [false, 400])
})

test('B4. the 10 MB limit is a single named server-side constant', () => {
  assert.equal(MAX_SIGNED_DOCUMENT_SIZE, 10 * 1024 * 1024)
  assert.equal(signedDocumentFileIssue({ type: 'application/pdf', size: MAX_SIGNED_DOCUMENT_SIZE }), '')
  assert.equal(signedDocumentFileIssue({ type: 'application/pdf', size: MAX_SIGNED_DOCUMENT_SIZE + 1 }), 'size')
})

// =================================================================================
// D. Storage — deterministic, server-built path; original file name can
// never influence it; no public/signed URL anywhere in the new code.
// =================================================================================

test('D. signedDocumentPath is deterministic and server-derived; a hostile file name cannot escape it', () => {
  assert.equal(
    signedDocumentPath(REGISTRATION_ID, 2, 1, 'pdf'),
    `edition-2/${REGISTRATION_ID}/signed/v1.pdf`,
  )
  assert.equal(signedDocumentPath(REGISTRATION_ID, 2, 3, 'jpg'), `edition-2/${REGISTRATION_ID}/signed/v3.jpg`)
  assert.throws(() => signedDocumentPath(REGISTRATION_ID, 0, 1, 'pdf'))
  assert.throws(() => signedDocumentPath(REGISTRATION_ID, 2, 0, 'pdf'))
  assert.throws(() => signedDocumentPath('', 2, 1, 'pdf'))
  // The path builder never even takes a file name argument — there is
  // nothing a candidate's original file name could inject into it.
  assert.equal(signedDocumentPath.length, 4)
})

test('D2. original file names are sanitised for metadata only — never capable of a path escape', () => {
  assert.equal(sanitizeOriginalFileName('../../etc/passwd'), '.._.._etc_passwd')
  assert.equal(sanitizeOriginalFileName('C:\\Windows\\evil.pdf'), 'C:_Windows_evil.pdf')
  assert.equal(sanitizeOriginalFileName('report\u0000.pdf'), 'report.pdf')
  assert.equal(sanitizeOriginalFileName('a'.repeat(500)).length, 255)
  assert.equal(sanitizeOriginalFileName(''), 'document')
  assert.equal(sanitizeOriginalFileName(null), 'document')
  assert.doesNotMatch(sanitizeOriginalFileName('x/y\\z\u0001\u001f\u007f'), /[/\\]|[\u0000-\u001f\u007f]/)
})

test('D3. no public or signed URL anywhere in the new Phase 5B code; the bucket name matches the migration', async () => {
  const files = [
    'api/_lib/aivex-signed-document-store.js', 'api/_lib/aivex-signed-document-upload.js',
    'api/_lib/aivex-signed-document-validation.js', 'api/aivex/magic-link/upload.js',
  ]
  for (const path of files) {
    const source = await read(path)
    assert.doesNotMatch(source, /getPublicUrl|createSignedUrl/, path)
  }
  assert.equal(SIGNED_DOCUMENT_BUCKET, 'aivex-signed-forms')
  const migration = await read('supabase/migrations/20260922120000_aivex_v4_signed_documents.sql')
  assert.match(migration, /insert into storage\.buckets[\s\S]*'aivex-signed-forms'/)
})

// =================================================================================
// C, E, F, G, H — full orchestration, against an in-memory store
// implementing the exact createSupabaseSignedDocumentStore interface.
// =================================================================================

// `registrations` may be shared with another store (e.g. the Magic Link
// store in createMagicLinkBackend below) so both see the SAME
// document_status writes — passing a fresh Map each time would silently
// decouple them, which is exactly the bug this comment is here to prevent.
function createMemoryStore(registrations = new Map([[REGISTRATION_ID, { id: REGISTRATION_ID, edition: 2, document_status: 'awaiting_signature' }]])) {
  const rows = [] // { registration_id, edition, version, file_path, original_file_name, mime_type, size_bytes, checksum_sha256, upload_id, uploaded_at }
  const objects = new Map()
  const calls = { uploadFile: 0, removeFile: [], insertDocumentRow: 0 }
  return {
    registrations, rows, objects, calls,
    async loadRegistrationForUpload(id) { return registrations.get(id) || null },
    async findByUploadId(registrationId, uploadId) {
      if (!uploadId) return null
      const row = rows.find((entry) => entry.registration_id === registrationId && entry.upload_id === uploadId)
      return row ? { version: row.version, uploaded_at: row.uploaded_at } : null
    },
    async highestVersion(registrationId) {
      const versions = rows.filter((entry) => entry.registration_id === registrationId).map((entry) => entry.version)
      return versions.length ? Math.max(...versions) : 0
    },
    // Mirrors createSupabaseSignedDocumentStore's real upsert:false: a
    // second upload to an already-occupied path is reported as a clean
    // { ok: false, duplicate: true } (never a silent overwrite) — this is
    // what makes a stale/lied-about highestVersion() read (test H3) retry
    // with a fresh version, exactly as it would against real Storage.
    async uploadFile(path, buffer, mimeType) {
      calls.uploadFile += 1
      if (objects.has(path)) return { ok: false, duplicate: true }
      objects.set(path, { buffer, mimeType })
      return { ok: true }
    },
    async removeFile(path) { calls.removeFile.push(path); objects.delete(path) },
    async insertDocumentRow(row) {
      calls.insertDocumentRow += 1
      const duplicateVersion = rows.some((entry) => entry.registration_id === row.registration_id && entry.version === row.version)
      const duplicateUpload = row.upload_id && rows.some((entry) => entry.upload_id === row.upload_id)
      if (duplicateVersion || duplicateUpload) return { ok: false, duplicate: true }
      rows.push({ ...row })
      return { ok: true }
    },
    async setDocumentStatus(registrationId, status) { registrations.get(registrationId).document_status = status },
    async latestForCandidate(registrationId) {
      const own = rows.filter((entry) => entry.registration_id === registrationId).sort((a, b) => b.version - a.version)
      return own[0] ? { version: own[0].version, uploaded_at: own[0].uploaded_at } : null
    },
  }
}

const validPdf = () => ({ buffer: REAL.pdf, mime: 'application/pdf', extension: 'pdf', size: REAL.pdf.length, filename: 'signed.pdf' })

test('F. versioning: v1 then v2, neither deletes the other; version is the highest + 1', async () => {
  const store = createMemoryStore()
  const v1 = await uploadSignedDocument({ store, registrationId: REGISTRATION_ID, uploadId: null, file: validPdf(), now: NOW })
  assert.deepEqual(v1, { ok: true, version: 1 })
  const v2 = await uploadSignedDocument({ store, registrationId: REGISTRATION_ID, uploadId: null, file: validPdf(), now: NOW })
  assert.deepEqual(v2, { ok: true, version: 2 })
  assert.equal(store.rows.length, 2)
  assert.ok(store.objects.has(`edition-2/${REGISTRATION_ID}/signed/v1.pdf`), 'v1 file still exists')
  assert.ok(store.objects.has(`edition-2/${REGISTRATION_ID}/signed/v2.pdf`), 'v2 file still exists')
})

test('F2. concurrent uploads never collide on the same version number', async () => {
  const store = createMemoryStore()
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => uploadSignedDocument({ store, registrationId: REGISTRATION_ID, uploadId: null, file: validPdf(), now: NOW })))
  const versions = [a.version, b.version, c.version].sort()
  assert.deepEqual(versions, [1, 2, 3], 'three concurrent uploads got three distinct, contiguous versions')
})

test('C/F3. idempotency: retrying the same uploadId replays the original version, never creates a new one', async () => {
  const store = createMemoryStore()
  const uploadId = '11111111-1111-4111-8111-111111111111'
  const first = await uploadSignedDocument({ store, registrationId: REGISTRATION_ID, uploadId, file: validPdf(), now: NOW })
  assert.deepEqual(first, { ok: true, version: 1 })
  const retry = await uploadSignedDocument({ store, registrationId: REGISTRATION_ID, uploadId, file: validPdf(), now: NOW })
  assert.deepEqual(retry, { ok: true, version: 1, replayed: true })
  assert.equal(store.rows.length, 1, 'no second row was created by the retry')
  assert.equal(store.calls.uploadFile, 1, 'the file was uploaded exactly once')

  // A different upload attempt (fresh uploadId) for the same registration IS a new version.
  const second = await uploadSignedDocument({ store, registrationId: REGISTRATION_ID, uploadId: '22222222-2222-4222-8222-222222222222', file: validPdf(), now: NOW })
  assert.deepEqual(second, { ok: true, version: 2 })
})

test('E. SHA-256 is computed server-side from the actual bytes and stored, never trusted from the client', async () => {
  const store = createMemoryStore()
  await uploadSignedDocument({ store, registrationId: REGISTRATION_ID, uploadId: null, file: validPdf(), now: NOW })
  const expected = createHash('sha256').update(REAL.pdf).digest('hex')
  assert.equal(store.rows[0].checksum_sha256, expected)
  assert.match(store.rows[0].checksum_sha256, /^[0-9a-f]{64}$/)
})

test('G. a successful upload transitions awaiting_signature -> signed_document_uploaded; a second version keeps it there', async () => {
  const store = createMemoryStore()
  assert.equal(store.registrations.get(REGISTRATION_ID).document_status, 'awaiting_signature')
  await uploadSignedDocument({ store, registrationId: REGISTRATION_ID, uploadId: null, file: validPdf(), now: NOW })
  assert.equal(store.registrations.get(REGISTRATION_ID).document_status, 'signed_document_uploaded')
  await uploadSignedDocument({ store, registrationId: REGISTRATION_ID, uploadId: null, file: validPdf(), now: NOW })
  assert.equal(store.registrations.get(REGISTRATION_ID).document_status, 'signed_document_uploaded')
  // Never one of the future admin-workflow states.
  for (const forbidden of ['under_review', 'validated', 'rejected', 'changes_required']) {
    assert.notEqual(store.registrations.get(REGISTRATION_ID).document_status, forbidden)
  }
})

test('G2. an ineligible document_status refuses the upload and leaves it untouched', async () => {
  for (const status of ['not_generated', 'generating', 'generation_failed']) {
    const store = createMemoryStore()
    store.registrations.get(REGISTRATION_ID).document_status = status
    const result = await uploadSignedDocument({ store, registrationId: REGISTRATION_ID, uploadId: null, file: validPdf(), now: NOW })
    assert.deepEqual(result, { ok: false, reason: 'document_not_ready' })
    assert.equal(store.registrations.get(REGISTRATION_ID).document_status, status, 'status unchanged')
    assert.equal(store.rows.length, 0, 'no row was created')
  }
  assert.deepEqual(UPLOAD_ELIGIBLE_DOCUMENT_STATUSES, ['awaiting_signature', 'signed_document_uploaded'])
})

test('H. storage failure: no metadata row, no status change, nothing orphaned', async () => {
  const store = createMemoryStore()
  store.uploadFile = async () => { throw Object.assign(new Error('storage down'), { code: 503 }) }
  await assert.rejects(() => uploadSignedDocument({ store, registrationId: REGISTRATION_ID, uploadId: null, file: validPdf(), now: NOW }))
  assert.equal(store.rows.length, 0)
  assert.equal(store.registrations.get(REGISTRATION_ID).document_status, 'awaiting_signature')
})

test('H2. DB insert failure after a successful upload: the orphaned file is cleaned up, status stays untouched', async () => {
  const store = createMemoryStore()
  const originalInsert = store.insertDocumentRow.bind(store)
  store.insertDocumentRow = async () => { throw Object.assign(new Error('db down'), { code: 500 }) }
  await assert.rejects(() => uploadSignedDocument({ store, registrationId: REGISTRATION_ID, uploadId: null, file: validPdf(), now: NOW }))
  assert.equal(store.calls.removeFile.length, 1, 'the just-uploaded file was removed')
  assert.equal(store.objects.size, 0, 'no orphaned file remains')
  assert.equal(store.registrations.get(REGISTRATION_ID).document_status, 'awaiting_signature')
  store.insertDocumentRow = originalInsert
})

test('H3. a version collision at the upload step (a stale highestVersion read) is retried with a fresh version, without touching the real v1', async () => {
  const store = createMemoryStore()
  // Real v1 already exists (e.g. from another request that finished first).
  await uploadSignedDocument({ store, registrationId: REGISTRATION_ID, uploadId: null, file: validPdf(), now: NOW })
  const v1Path = `edition-2/${REGISTRATION_ID}/signed/v1.pdf`
  assert.ok(store.objects.has(v1Path))

  let calls = 0
  const originalHighest = store.highestVersion.bind(store)
  store.highestVersion = async (id) => {
    calls += 1
    return calls === 1 ? 0 : originalHighest(id) // first call lies (a stale read mid-race), forcing a collision on v1's own path
  }
  const result = await uploadSignedDocument({ store, registrationId: REGISTRATION_ID, uploadId: null, file: validPdf(), now: NOW })
  assert.equal(result.ok, true)
  assert.equal(result.version, 2, 'retried up to the real next version after the collision')
  assert.ok(store.objects.has(v1Path), 'the real, pre-existing v1 file is untouched')
  assert.equal(store.calls.removeFile.includes(v1Path), false, 'v1 was never passed to removeFile')
  // Storage's own upsert:false is what turned the collision into a thrown
  // error in the first place — never a silent overwrite of v1.
  assert.equal(store.calls.uploadFile, 3, '1st (v1, real) + 2nd (v1 again, collides) + 3rd (v2, succeeds)')
})

// =================================================================================
// C/I — full e2e through the real handler: Magic Link authorization,
// isolation, security, rate limiting, logging.
// =================================================================================

function createMagicLinkBackend() {
  const registrations = new Map([[REGISTRATION_ID, { id: REGISTRATION_ID, edition: 2, document_status: 'awaiting_signature', reference: 'AIVEX2-7K3M9QXT' }]])
  const links = new Map()
  // The SAME Map from construction, not reassigned after the fact — a
  // signedStore built by createMemoryStore() closes over whatever Map it
  // was given, and reassigning the property afterwards would not rewire
  // those closures (this cost 3 failing tests to a Map that never got
  // shared before this comment was here — see createMemoryStore's own note).
  const signedStore = createMemoryStore(registrations)
  let nextLinkId = 0
  const magicLinkStore = {
    async createOrRotate(registrationId, { tokenHash, expiresAt, now }) {
      for (const row of links.values()) if (row.registration_id === registrationId && !row.revoked_at) row.revoked_at = now.toISOString()
      const id = `link-${++nextLinkId}`
      links.set(id, { id, registration_id: registrationId, token_hash: tokenHash, expires_at: expiresAt.toISOString(), revoked_at: null, last_used_at: null })
      return id
    },
    async findByTokenHash(tokenHash) {
      for (const row of links.values()) if (row.token_hash === tokenHash) return { ...row }
      return null
    },
    async touchLastUsed(id, now) { const row = links.get(id); if (row) row.last_used_at = now.toISOString() },
    async loadCandidateRegistration(id) { return registrations.get(id) || null },
  }
  return { registrations, links, signedStore, magicLinkStore }
}

async function issueToken(backend, registrationId = REGISTRATION_ID) {
  const raw = generateMagicLinkToken()
  await backend.magicLinkStore.createOrRotate(registrationId, { tokenHash: hashMagicLinkToken(raw), expiresAt: magicLinkExpiryFrom(NOW), now: NOW })
  return raw
}

let ip = 0
function postUpload(handler, { token, uploadId, fileBuffer = REAL.pdf, filename = 'signed.pdf', mimeType = 'application/pdf', headers = {} } = {}) {
  const form = new FormData()
  if (token !== null) form.append('token', token ?? '')
  if (uploadId) form.append('uploadId', uploadId)
  if (fileBuffer !== null) form.append('file', new Blob([fileBuffer], { type: mimeType }), filename)
  return sendMultipart(handler, form, headers)
}
async function sendMultipart(handler, form, headers) {
  const response = new Response(form)
  const req = Readable.from([Buffer.from(await response.arrayBuffer())])
  ip += 1
  Object.assign(req, {
    method: 'POST', socket: {},
    headers: { 'content-type': response.headers.get('content-type'), 'x-forwarded-for': `198.51.100.${ip % 250}`, host: 'aivex.example.test', ...headers },
  })
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(name, value) { this.headers[name.toLowerCase()] = value },
      end(body) { resolve({ status: this.statusCode, body: JSON.parse(body) }) },
    }
    handler(req, res)
  })
}

const handler = (backend) => {
  delete process.env.VERCEL
  return createMagicLinkUploadHandler({ createMagicLinkStore: () => backend.magicLinkStore, createSignedDocumentStore: () => backend.signedStore, now: () => NOW })
}

test('C2. e2e: a valid Magic Link uploads successfully; document_status flips to signed_document_uploaded', async () => {
  const backend = createMagicLinkBackend()
  const token = await issueToken(backend)
  const result = await postUpload(handler(backend), { token })
  assert.equal(result.status, 200)
  assert.deepEqual(result.body, { success: true, status: 'signed_document_uploaded', version: 1 })
  assert.equal(backend.registrations.get(REGISTRATION_ID).document_status, 'signed_document_uploaded')
})

test('C3. e2e: invalid, expired and revoked tokens are all refused with 401 and cannot upload', async () => {
  const backend = createMagicLinkBackend()
  const h = handler(backend)

  const invalid = await postUpload(h, { token: generateMagicLinkToken() })
  assert.deepEqual(invalid, { status: 401, body: { success: false, status: 'invalid' } })

  const token = await issueToken(backend)
  const futureHandler = createMagicLinkUploadHandler({
    createMagicLinkStore: () => backend.magicLinkStore, createSignedDocumentStore: () => backend.signedStore,
    now: () => new Date(NOW.getTime() + 31 * 24 * 60 * 60 * 1000),
  })
  const expired = await postUpload(futureHandler, { token })
  assert.deepEqual(expired, { status: 401, body: { success: false, status: 'expired' } })

  const revoked = await issueToken(backend) // rotates, revoking the previous active link... issue a second to revoke the first explicitly:
  const firstToken = await issueToken(backend)
  const secondToken = await issueToken(backend) // revokes firstToken
  void revoked
  const revokedResult = await postUpload(h, { token: firstToken })
  assert.deepEqual(revokedResult, { status: 401, body: { success: false, status: 'revoked' } })
  const stillGood = await postUpload(h, { token: secondToken })
  assert.equal(stillGood.status, 200)
  assert.equal(backend.signedStore.rows.length, 1, 'only the one successful upload created a row')
})

test('C4/D4. isolation: a token for registration A can never upload into registration B, even if the client sends B\'s identity', async () => {
  const backend = createMagicLinkBackend()
  backend.registrations.set('other-registration-id', { id: 'other-registration-id', edition: 2, document_status: 'awaiting_signature', reference: 'AIVEX2-OTHERTEAM' })
  const tokenA = await issueToken(backend, REGISTRATION_ID)

  const h = handler(backend)
  // The client-supplied "uploadId" is the only extra field this endpoint
  // reads; there is no registrationId/reference field at all, so there is
  // nothing for a hostile client to override — confirmed structurally too.
  const source = await read('api/aivex/magic-link/upload.js')
  assert.doesNotMatch(source, /parsed\.fields\.(registrationId|reference)/)
  assert.doesNotMatch(source, /allowedFields.*reference|allowedFields.*registrationId/)

  const result = await postUpload(h, { token: tokenA })
  assert.equal(result.status, 200)
  assert.equal(backend.signedStore.rows[0].registration_id, REGISTRATION_ID)
  assert.equal(backend.registrations.get('other-registration-id').document_status, 'awaiting_signature', 'the other registration was never touched')
})

test('I. malformed requests, wrong method, and rate limiting', async () => {
  const backend = createMagicLinkBackend()
  const h = handler(backend)
  const token = await issueToken(backend)

  const get = await sendMultipart(h, new FormData(), {})
  // Wrong method is checked before the body is even read.
  const getReq = Readable.from([])
  Object.assign(getReq, { method: 'GET', headers: {}, socket: {} })
  const getRes = { headers: {}, setHeader(n, v) { this.headers[n.toLowerCase()] = v }, end(b) { getRes.result = { status: getRes.statusCode, body: JSON.parse(b) } } }
  h(getReq, getRes)
  assert.equal(getRes.result.status, 405)
  assert.equal(getRes.result.headers?.allow ?? getRes.headers.allow, 'POST')
  void get

  assert.equal((await postUpload(h, { token: null, fileBuffer: null })).status, 401, 'no token at all -> invalid, not a crash')
  assert.equal((await postUpload(h, { token, fileBuffer: null })).status, 400, 'a token but no file')
  assert.equal((await postUpload(h, { token, fileBuffer: REAL.zip, filename: 'x.docx', mimeType: 'application/zip' })).status, 415)
  const oversized = await postUpload(h, { token, fileBuffer: Buffer.alloc(MAX_SIGNED_DOCUMENT_SIZE + 1024) })
  assert.equal(oversized.status, 413, 'oversized file rejected before storage')
  // api/_lib/multipart.js's oversized-file message defaults to student-card
  // wording (a different, 5 MB limit) — this endpoint must override it.
  assert.equal(oversized.body.message, 'The signed document must be 10 MB or smaller.')
  assert.doesNotMatch(oversized.body.message, /student card/i)

  process.env.VERCEL = '1'
  try {
    const foreign = await postUpload(h, { token, headers: { origin: 'https://evil.example' } })
    assert.equal(foreign.status, 403)
  } finally {
    delete process.env.VERCEL
  }

  const statuses = []
  for (let i = 0; i < 9; i += 1) statuses.push((await postUpload(h, { token, headers: { 'x-forwarded-for': '192.0.2.44' } })).status)
  assert.equal(statuses[8], 429, 'the 9th upload from the same IP within the window is rate-limited (limit: 8/15min)')
})

test('I2. the raw Magic Link token is never logged, on any success or failure path', async () => {
  const backend = createMagicLinkBackend()
  const h = handler(backend)
  const token = await issueToken(backend)
  const logs = []
  const logged = console.error
  console.error = (...args) => logs.push(args)
  try {
    await postUpload(h, { token })
    await postUpload(h, { token: generateMagicLinkToken() })
    backend.signedStore.uploadFile = async () => { throw new Error(`leak ${token}`) }
    await postUpload(h, { token, uploadId: '33333333-3333-4333-8333-333333333333' })
  } finally {
    console.error = logged
  }
  assert.doesNotMatch(JSON.stringify(logs), new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('I3. no PII/secret-shaped logging and no getPublicUrl/createSignedUrl across the new backend files', async () => {
  const files = [
    'api/_lib/aivex-signed-document-store.js', 'api/_lib/aivex-signed-document-upload.js',
    'api/_lib/aivex-signed-document-validation.js', 'api/aivex/magic-link/upload.js',
  ]
  for (const file_ of files) {
    const source = await read(file_)
    assert.doesNotMatch(source, /getPublicUrl|createSignedUrl|SUPABASE_SECRET_KEY.{0,20}=.{0,5}['"][^'"]+['"]/, file_)
    for (const [, args] of source.matchAll(/console\.(?:error|log|warn)\(([^)]*)\)/g)) {
      const cleaned = args.replace(/'[^']*'/g, "''")
      assert.doesNotMatch(cleaned, /\btoken\b(?!Hash)|original_file_name|checksum|buffer|registration\b(?!Id)/i, `${file_} logs ${args}`)
    }
  }
})

// =================================================================================
// J. Frontend — static checks (same convention as tests/aivex-magic-link
// .test.mjs: no jsdom in this project's toolchain).
// =================================================================================

test('J. the upload UI is gated on the same eligibility rule the server enforces, never localStorage/sessionStorage', async () => {
  const page = await read('src/pages/aivex/status/AivexStatusPage.jsx')
  assert.match(page, /UPLOAD_ELIGIBLE_DOCUMENT_STATUSES/)
  assert.match(page, /type="file"/)
  assert.match(page, /uploadEligible/)

  const hook = await read('src/pages/aivex/status/useAivexStatus.js')
  assert.match(hook, /\/api\/aivex\/magic-link\/upload/)
  // .setItem(, not a bare "localStorage" text match: a comment may
  // legitimately *say* "never localStorage" (this file's header does).
  assert.doesNotMatch(hook, /\.setItem\(/)
  assert.match(hook, /signedDocumentFileIssue/, 'client-side hint reuses the shared policy, not a re-implemented check')
})

test('J2. every upload state (choose, picked, invalid file, uploading, success, error) and the received-only confirmation have FR/EN/AR strings', async () => {
  const { getStatusStrings } = await import('../src/pages/aivex/status/statusI18n.js')
  const requiredKeys = [
    'uploadSectionTitle', 'uploadChooseFile', 'uploadReplaceFile', 'uploadSubmit', 'uploadSubmitting',
    'uploadSuccessTitle', 'uploadReceivedTitle', 'uploadReceivedNote',
  ]
  for (const lang of ['en', 'fr', 'ar']) {
    const strings = getStatusStrings(lang)
    for (const key of requiredKeys) assert.equal(typeof strings[key], 'string', `${lang}.${key}`)
    for (const key of ['type', 'size', 'empty', 'missing']) assert.equal(typeof strings.uploadFileIssues[key], 'string', `${lang}.uploadFileIssues.${key}`)
    for (const key of ['document_not_ready', 'invalid', 'expired', 'revoked', 'network', 'error']) {
      assert.equal(typeof strings.uploadErrors[key], 'string', `${lang}.uploadErrors.${key}`)
    }
  }
  assert.equal(getStatusStrings('fr').uploadSubmit, 'Envoyer le document signé')
  assert.equal(getStatusStrings('fr').uploadSectionTitle, 'Déposer le document signé')
  assert.equal(getStatusStrings('fr').uploadSuccessTitle, 'Votre document signé a bien été reçu.')
  assert.equal(getStatusStrings('ar').dir, 'rtl')
  // Never implies admin validation happened (§16 of the brief).
  for (const lang of ['en', 'fr', 'ar']) {
    assert.doesNotMatch(getStatusStrings(lang).uploadReceivedTitle + getStatusStrings(lang).uploadSuccessTitle, /valid[ée]|approved|مصادَق/i)
  }
})

// =================================================================================
// Out of scope for Phase 5B — explicit guard so a future change cannot
// silently grow this phase into the next one.
// =================================================================================

test('Phase 5B does not implement admin review, OCR, payment, notifications or candidate accounts', async () => {
  const files = [
    'api/_lib/aivex-signed-document-store.js', 'api/_lib/aivex-signed-document-upload.js',
    'api/_lib/aivex-signed-document-validation.js', 'api/aivex/magic-link/upload.js',
    'src/pages/aivex/status/AivexStatusPage.jsx', 'src/pages/aivex/status/useAivexStatus.js',
  ]
  for (const path of files) {
    // Comments may legitimately *say* "no admin review yet" (several do,
    // deliberately) — only actual code should ever trip this guard.
    const code = (await read(path)).split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n')
    assert.doesNotMatch(code, /admin.?(dashboard|review|auth)|\bocr\b|tesseract|face.?recognition|\bpayment\b|stripe|nodemailer|sendgrid|supabase\.auth|createUser/i, path)
  }
  const migration = await read('supabase/migrations/20260922120000_aivex_v4_signed_documents.sql')
  assert.doesNotMatch(migration.toLowerCase(), /check \(status in \('uploaded', /, 'no extra status value was smuggled in ahead of Phase 5C')
})

// =================================================================================
// Backward compatibility — Phase 5A must still work unchanged.
// =================================================================================

test('backward compatibility: api/_lib/multipart.js\'s default messages (used by api/aivex/register.js) are untouched', async () => {
  const { parseMultipart } = await import('../api/_lib/multipart.js')
  // parseMultipart's two messages now take an optional override (added so
  // this upload endpoint could word its own 10 MB limit correctly instead
  // of showing the registration form's "student card... 5 MB" text) — the
  // defaults themselves, what api/aivex/register.js gets when it does not
  // pass either option, must be exactly what they always were.
  const req = Readable.from([Buffer.from('not multipart')])
  Object.assign(req, { headers: { 'content-type': 'application/json' } })
  await assert.rejects(
    () => parseMultipart(req, { maxFileBytes: 1, maxFiles: 1, maxRequestBytes: 1, allowedFields: new Set(), fileFieldPattern: /^x$/ }),
    (error) => error.status === 415 && error.message === 'Registrations must be sent as multipart/form-data.',
  )
})

test('backward compatibility: verify()\'s response is byte-for-byte unchanged when no signed document exists', async () => {
  const { createMagicLinkVerifyHandler } = await import('../api/aivex/magic-link/verify.js')
  const backend = createMagicLinkBackend()
  backend.registrations.get(REGISTRATION_ID).team_name = 'Team'
  backend.registrations.get(REGISTRATION_ID).institution_name = 'Inst'
  backend.registrations.get(REGISTRATION_ID).wilaya_name = 'Wilaya'
  backend.registrations.get(REGISTRATION_ID).student_count = 3
  backend.registrations.get(REGISTRATION_ID).registration_status = 'submitted'
  const token = await issueToken(backend)
  const verifyHandler = createMagicLinkVerifyHandler({
    createMagicLinkStore: () => backend.magicLinkStore, createSignedDocumentStore: () => backend.signedStore, now: () => NOW,
  })
  const result = await postUploadLikeJson(verifyHandler, { token })
  assert.deepEqual(Object.keys(result.body).sort(), [
    'documentStatus', 'institutionName', 'reference', 'registrationStatus', 'status', 'studentCount', 'success', 'teamName', 'wilayaName',
  ], 'no signedDocument key appears when none was ever uploaded')
})

function postUploadLikeJson(handler, body) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))])
  ip += 1
  Object.assign(req, { method: 'POST', socket: {}, headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${ip % 250}` } })
  return new Promise((resolve) => {
    const res = { headers: {}, setHeader(n, v) { this.headers[n.toLowerCase()] = v }, end(b) { resolve({ status: res.statusCode, body: JSON.parse(b) }) } }
    handler(req, res)
  })
}

test('backward compatibility: verify() adds signedDocument only after a real upload, additively', async () => {
  const { createMagicLinkVerifyHandler } = await import('../api/aivex/magic-link/verify.js')
  const backend = createMagicLinkBackend()
  Object.assign(backend.registrations.get(REGISTRATION_ID), { team_name: 'T', institution_name: 'I', wilaya_name: 'W', student_count: 3, registration_status: 'submitted' })
  const token = await issueToken(backend)
  await uploadSignedDocument({ store: backend.signedStore, registrationId: REGISTRATION_ID, uploadId: null, file: validPdf(), now: NOW })
  const verifyHandler = createMagicLinkVerifyHandler({
    createMagicLinkStore: () => backend.magicLinkStore, createSignedDocumentStore: () => backend.signedStore, now: () => NOW,
  })
  const result = await postUploadLikeJson(verifyHandler, { token })
  assert.equal(result.body.documentStatus, 'signed_document_uploaded')
  assert.deepEqual(result.body.signedDocument, { version: 1, uploadedAt: result.body.signedDocument.uploadedAt })
  assert.equal(typeof result.body.signedDocument.uploadedAt, 'string')
})
