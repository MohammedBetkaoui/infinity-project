import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import {
  buildRegistrationUploadManifest, buildSignedDocumentUploadManifest, sessionIsUsable,
  verifyRegistrationStaging, verifySignedDocumentStaging,
} from '../api/_lib/aivex-direct-upload.js'
import { canRegister, canUploadSignedDocument, normalizeOperationalSettings } from '../api/_lib/aivex-operational-settings.js'
import { createRegistrationUploadInitHandler } from '../api/aivex/register/init.js'
import { createRegistrationUploadFinalizeHandler } from '../api/aivex/register/finalize.js'
import { createSignedUploadInitHandler } from '../api/aivex/magic-link/upload/init.js'
import { createSignedUploadFinalizeHandler } from '../api/aivex/magic-link/upload/finalize.js'
import { REGISTRATION_FILE_FIELDS } from '../shared/aivex/contract-v4.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SUBMISSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const UPLOAD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const NOW = new Date('2026-10-10T12:00:00+01:00')
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n')

const validPayload = () => ({
  submissionId: SUBMISSION_ID, edition: 2, formVersion: 4,
  team: {
    name: 'Atlas Logic', wilaya: { code: '34', name: 'Bordj Bou Arréridj' },
    institution: { id: 'univ-bba', name: 'Université Mohamed El Bachir El Ibrahimi', custom: false },
  },
  activityOfficial: { role: 'activities_officer', fullName: 'Amina Benali', email: 'activities@univ-bba.dz', phone: '0555123456' },
  delegationHead: { fullName: 'Karim Haddad', phone: '0661234567', rfid: '00471236', idCard: 'delegationHeadIdCard' },
  driver: { fullName: 'Nabil Saidi', phone: '0770112233', rfid: 'A1B2C3D4', idCard: 'driverIdCard' },
  students: [1, 2, 3].map((position) => ({
    position, fullName: ['Sara Meziane', 'Yacine Amrane', 'Lina Khelifi'][position - 1], phone: `055000000${position}`,
    bacYear: 2021 + position, rfid: `0000000${position}`, studentCard: `studentCard_${position}`,
  })),
  consent: true,
})

const hints = () => REGISTRATION_FILE_FIELDS.map((field) => ({ field, mime: 'image/png', size: PNG.length }))
const openSettings = () => normalizeOperationalSettings({
  edition: 2, registration_enabled: true, registration_open_at: '2026-09-21T00:00:00+01:00',
  registration_close_at: '2026-10-25T23:59:59+01:00', document_upload_enabled: true,
  signed_document_deadline: '2026-10-25T23:59:59+01:00',
})

function jsonRequest(body) {
  const request = Readable.from([Buffer.from(JSON.stringify(body))])
  request.method = 'POST'
  request.headers = {}
  request.socket = { remoteAddress: '127.0.0.20' }
  return request
}

function response() {
  return {
    headers: {}, statusCode: 0, body: null,
    setHeader(name, value) { this.headers[name] = value },
    end(value) { this.body = JSON.parse(value) },
  }
}

test('campaign boundaries use exact Algeria-offset instants and fail closed', () => {
  const settings = openSettings()
  assert.deepEqual(canRegister(settings, new Date('2026-09-30T23:59:59+01:00')), { ok: false, status: 'registration_not_open' })
  assert.deepEqual(canRegister(settings, new Date('2026-09-21T00:00:00+01:00')), { ok: true })
  assert.deepEqual(canRegister(settings, new Date('2026-10-25T23:59:59+01:00')), { ok: true })
  assert.deepEqual(canRegister(settings, new Date('2026-10-26T00:00:00+01:00')), { ok: false, status: 'registration_closed' })
  assert.deepEqual(canRegister({ ...settings, registrationEnabled: false }, NOW), { ok: false, status: 'registration_disabled' })
  assert.deepEqual(canUploadSignedDocument(settings, new Date('2026-10-25T23:59:59+01:00')), { ok: true })
  assert.deepEqual(canUploadSignedDocument(settings, new Date('2026-10-26T00:00:00+01:00')), { ok: false, status: 'document_upload_closed' })
  assert.deepEqual(canUploadSignedDocument({ ...settings, documentUploadEnabled: false }, NOW), { ok: false, status: 'document_upload_disabled' })
})

test('registration manifest is exactly five server-derived, session-owned staging paths', () => {
  const manifest = buildRegistrationUploadManifest(SESSION_ID, hints())
  assert.equal(manifest.length, 5)
  assert.deepEqual(manifest.map((item) => item.field), REGISTRATION_FILE_FIELDS)
  for (const item of manifest) {
    assert.match(item.path, new RegExp(`^staging/registration/${SESSION_ID}/`))
    assert.doesNotMatch(item.path, /Amina|Karim|0555|00471236|@/)
  }
  assert.equal(buildRegistrationUploadManifest(SESSION_ID, hints().slice(1)), null)
  assert.equal(buildRegistrationUploadManifest(SESSION_ID, [...hints(), { field: 'unexpected', mime: 'image/png', size: 2 }]), null)
  assert.equal(buildRegistrationUploadManifest(SESSION_ID, hints().map((entry, index) => index ? entry : { ...entry, size: 6 * 1024 * 1024 })), null)
})

test('signed manifest accepts PDF/JPG/PNG policy, rejects wrong extension, and never trusts a client path', () => {
  const manifest = buildSignedDocumentUploadManifest(SESSION_ID, { name: 'signed.pdf', mime: 'application/pdf', size: PDF.length })
  assert.equal(manifest[0].path, `staging/signed/${SESSION_ID}/document.pdf`)
  assert.equal(buildSignedDocumentUploadManifest(SESSION_ID, { name: 'signed.jpg', mime: 'application/pdf', size: PDF.length }), null)
  assert.equal(buildSignedDocumentUploadManifest(SESSION_ID, { name: 'signed.pdf', mime: 'application/pdf', size: 10 * 1024 * 1024 + 1 }), null)
})

test('authoritative registration finalization validates all five real objects and attaches only server paths', async () => {
  const manifest = buildRegistrationUploadManifest(SESSION_ID, hints())
  const files = new Map(manifest.map((item) => [item.field, { buffer: PNG, size: PNG.length, mimeType: 'image/png', filename: item.path.split('/').at(-1) }]))
  const result = await verifyRegistrationStaging({ inspectManifest: async () => ({ ok: true, files }) }, { expected_files: manifest }, validPayload().students)
  assert.equal(result.ok, true)
  assert.equal(result.cards.length, 3)
  assert.equal(result.identityCards.length, 2)
  for (const item of [...result.cards, ...result.identityCards]) assert.match(item.sourcePath, /^staging\/registration\//)
})

test('missing, unexpected, invalid magic bytes and MIME mismatch all refuse finalization', async () => {
  const manifest = buildRegistrationUploadManifest(SESSION_ID, hints())
  for (const reason of ['missing_file', 'unexpected_file']) {
    const result = await verifyRegistrationStaging({ inspectManifest: async () => ({ ok: false, status: 400, reason }) }, { expected_files: manifest }, validPayload().students)
    assert.equal(result.reason, reason)
  }
  const bad = new Map(manifest.map((item) => [item.field, { buffer: PNG, size: PNG.length, mimeType: 'image/png', filename: item.path.split('/').at(-1) }]))
  bad.set('studentCard_1', { buffer: Buffer.from('not-an-image'), size: 12, mimeType: 'image/png', filename: 'studentCard_1.png' })
  assert.equal((await verifyRegistrationStaging({ inspectManifest: async () => ({ ok: true, files: bad }) }, { expected_files: manifest }, validPayload().students)).ok, false)
  const mismatch = new Map(manifest.map((item) => [item.field, { buffer: PNG, size: PNG.length, mimeType: 'image/jpeg', filename: item.path.split('/').at(-1) }]))
  assert.equal((await verifyRegistrationStaging({ inspectManifest: async () => ({ ok: true, files: mismatch }) }, { expected_files: manifest }, validPayload().students)).ok, false)
})

test('signed staging validation uses real PDF bytes and the session-owned original name', async () => {
  const manifest = buildSignedDocumentUploadManifest(SESSION_ID, { name: 'signed.pdf', mime: 'application/pdf', size: PDF.length })
  const files = new Map([['file', { buffer: PDF, size: PDF.length, mimeType: 'application/pdf', filename: 'document.pdf' }]])
  const result = await verifySignedDocumentStaging({ inspectManifest: async () => ({ ok: true, files }) }, { expected_files: manifest })
  assert.equal(result.ok, true)
  assert.equal(result.file.filename, 'signed.pdf')
  assert.equal(result.file.sourcePath, `staging/signed/${SESSION_ID}/document.pdf`)
})

test('registration init accepts valid JSON in-campaign and returns only five object-scoped capabilities', async () => {
  const created = []
  const sessions = {
    findRegistrationSession: async () => null,
    createSession: async (row) => { created.push(row); return row },
    signedCapabilities: async (manifest) => manifest.map((item) => ({ field: item.field, signedUrl: `https://storage.invalid/object/${item.field}`, alreadyUploaded: false })),
  }
  const handler = createRegistrationUploadInitHandler({
    createSupabase: () => ({}), now: () => NOW, createId: () => SESSION_ID,
    loadSettings: async () => openSettings(), makeRegistrationStore: () => ({ findBySubmissionId: async () => null }),
    makeSessionStore: () => sessions,
  })
  const res = response()
  await handler(jsonRequest({ payload: validPayload(), files: hints() }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.uploads.length, 5)
  assert.equal(created.length, 1)
  assert.doesNotMatch(JSON.stringify(res.body), /SUPABASE_SECRET_KEY|service_role|submission_id|expected_files/)
})

test('registration init refuses before opening and when administratively disabled without creating a session', async () => {
  for (const [clock, settings, status] of [
    [new Date('2026-09-30T22:00:00Z'), openSettings(), 'registration_not_open'],
    [NOW, { ...openSettings(), registrationEnabled: false }, 'registration_disabled'],
  ]) {
    let writes = 0
    const handler = createRegistrationUploadInitHandler({
      createSupabase: () => ({}), now: () => clock, loadSettings: async () => settings,
      makeRegistrationStore: () => ({ findBySubmissionId: async () => null }),
      makeSessionStore: () => ({ createSession: async () => { writes += 1 } }),
    })
    const res = response()
    await handler(jsonRequest({ payload: validPayload(), files: hints() }), res)
    assert.equal(res.body.status, status)
    assert.equal(writes, 0)
  }
})

test('registration finalize independently refuses after cutoff before reading staged objects', async () => {
  let sessionReads = 0
  const handler = createRegistrationUploadFinalizeHandler({
    createSupabase: () => ({}), now: () => new Date('2026-10-26T00:00:00+01:00'),
    loadSettings: async () => openSettings(), makeRegistrationStore: () => ({}),
    makeSessionStore: () => ({ loadSession: async () => { sessionReads += 1 } }),
  })
  const res = response()
  await handler(jsonRequest({ uploadSessionId: SESSION_ID, payload: validPayload() }), res)
  assert.equal(res.body.status, 'registration_closed')
  assert.equal(sessionReads, 0)
})

test('signed init resolves authorization server-side, enforces deadline/status, and returns one capability', async () => {
  const sessions = {
    findSignedSession: async () => null,
    createSession: async (row) => row,
    signedCapabilities: async () => [{ field: 'file', signedUrl: 'https://storage.invalid/one-object', alreadyUploaded: false }],
  }
  const handler = createSignedUploadInitHandler({
    createSupabase: () => ({}), now: () => NOW, createId: () => SESSION_ID,
    resolveLink: async () => ({ ok: true, registrationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', magicLinkId: 'link' }),
    makeMagicLinkStore: () => ({ touchLastUsed: async () => {} }), loadSettings: async () => openSettings(),
    makeDocumentStore: () => ({ loadRegistrationForUpload: async () => ({ edition: 2, document_status: 'changes_required' }), findByUploadId: async () => null }),
    makeSessionStore: () => sessions,
  })
  const res = response()
  await handler(jsonRequest({ token: 'opaque', uploadId: UPLOAD_ID, file: { name: 'signed.pdf', mime: 'application/pdf', size: PDF.length } }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.upload.field, 'file')
  assert.equal('registrationId' in res.body, false)
})

test('signed init refuses invalid, expired and revoked Magic Links before any upload session write', async () => {
  for (const status of ['invalid', 'expired', 'revoked']) {
    let writes = 0
    const handler = createSignedUploadInitHandler({
      createSupabase: () => ({}), now: () => NOW, resolveLink: async () => ({ ok: false, status }),
      makeMagicLinkStore: () => ({}), makeDocumentStore: () => ({}), loadSettings: async () => openSettings(),
      makeSessionStore: () => ({ createSession: async () => { writes += 1 } }),
    })
    const res = response()
    await handler(jsonRequest({ token: 'opaque', uploadId: UPLOAD_ID, file: { name: 'signed.pdf', mime: 'application/pdf', size: PDF.length } }), res)
    assert.equal(res.statusCode, 401)
    assert.equal(res.body.status, status)
    assert.equal(writes, 0)
  }
})

test('signed finalize independently enforces disabled flag and deadline before staged-byte inspection', async () => {
  for (const [settings, status] of [
    [{ ...openSettings(), documentUploadEnabled: false }, 'document_upload_disabled'],
    [openSettings(), 'document_upload_closed'],
  ]) {
    let claims = 0
    const clock = status === 'document_upload_closed' ? new Date('2026-10-26T00:00:00+01:00') : NOW
    const handler = createSignedUploadFinalizeHandler({
      createSupabase: () => ({}), now: () => clock, resolveLink: async () => ({ ok: true, registrationId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }),
      makeMagicLinkStore: () => ({}), loadSettings: async () => settings,
      makeDocumentStore: () => ({ loadRegistrationForUpload: async () => ({ edition: 2, document_status: 'changes_required' }) }),
      makeSessionStore: () => ({
        loadSession: async () => ({ id: SESSION_ID, kind: 'signed_document', registration_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', expires_at: '2026-10-30T00:00:00+01:00' }),
        markFinalizing: async () => { claims += 1 },
      }),
    })
    const res = response()
    await handler(jsonRequest({ token: 'opaque', uploadSessionId: SESSION_ID }), res)
    assert.equal(res.body.status, status)
    assert.equal(claims, 0)
  }
})

test('upload sessions expire, and source code checks gates at both init and finalize', async () => {
  assert.equal(sessionIsUsable({ kind: 'registration', expires_at: '2026-10-10T13:00:00+01:00' }, 'registration', NOW), true)
  assert.equal(sessionIsUsable({ kind: 'registration', expires_at: '2026-10-10T11:00:00+01:00' }, 'registration', NOW), false)
  for (const path of ['api/aivex/register/init.js', 'api/aivex/register/finalize.js']) assert.match(await read(path), /canRegister\(settings, clock\)/)
  for (const path of ['api/aivex/magic-link/upload/init.js', 'api/aivex/magic-link/upload/finalize.js']) assert.match(await read(path), /canUploadSignedDocument\(settings, clock\)/)
})

test('security statics: browser has no Supabase client/secret, legacy routes reject bytes, buckets stay private', async () => {
  const frontend = `${await read('src/lib/applicationSubmission.js')}\n${await read('src/lib/directStorageUpload.js')}`
  assert.doesNotMatch(frontend, /import\.meta\.env\.SUPABASE|createClient\(|@supabase\/supabase-js/)
  assert.match(await read('api/aivex/register.js'), /410/)
  assert.match(await read('api/aivex/magic-link/upload.js'), /410/)
  const migration = (await read('supabase/migrations/20260924120000_aivex_direct_upload_sessions_and_retention.sql')).toLowerCase()
  assert.doesNotMatch(migration, /public\s*=\s*true/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /identity_document_purge_enabled boolean not null default false/)
})

test('retention and staging cleanup are dry-run, explicit-execute and unscheduled', async () => {
  const purge = await read('scripts/aivex-purge-expired-identity-documents.mjs')
  const staging = await read('scripts/aivex-cleanup-staging-uploads.mjs')
  for (const source of [purge, staging]) {
    assert.match(source, /--execute/)
    assert.match(source, /Dry run/)
    assert.doesNotMatch(source, /console\.log\([^\n]*(path|phone|email|rfid|token)/i)
  }
  const vercel = JSON.parse(await read('vercel.json'))
  assert.equal(vercel.crons, undefined)
})
