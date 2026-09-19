// AIVEX candidate Magic Link (Phase 5A) — token design, storage, resolution,
// isolation, rotation, document access and the three new endpoints. No
// network, no real database: an in-memory store stands in for
// createSupabaseMagicLinkStore, same approach every other AIVEX test file
// in this repo uses (tests/aivex-contract-v4.test.mjs's createMemoryStore,
// tests/aivex-document-generation.test.mjs's createSharedMemoryStores).
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import JSZip from 'jszip'
import { createRegisterHandler } from '../api/aivex/register.js'
import { createMagicLinkHandler } from '../api/aivex/magic-link.js'
import { createMagicLinkVerifyHandler } from '../api/aivex/magic-link/verify.js'
import { createMagicLinkDocumentHandler } from '../api/aivex/magic-link/document.js'
import {
  AIVEX_MAGIC_LINK_TTL_DAYS, buildMagicLinkUrl, generateMagicLinkToken, hashClientSignal, hashMagicLinkToken,
  isPlausibleMagicLinkToken, issueMagicLink, magicLinkExpiryFrom, resolveMagicLink,
} from '../api/_lib/aivex-magic-link.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const NOW = new Date('2026-09-21T10:00:00Z')

// =================================================================================
// A. Token generation — high entropy, URL-safe, unique
// =================================================================================

test('A. tokens are 256 bits, URL-safe, and never collide across a large sample', () => {
  const tokens = new Set(Array.from({ length: 2000 }, () => generateMagicLinkToken()))
  assert.equal(tokens.size, 2000, 'no collision in 2000 draws')
  for (const token of tokens) {
    assert.match(token, /^[A-Za-z0-9_-]+$/, 'URL-safe alphabet only (base64url)')
    assert.doesNotMatch(token, /[+/=]/, 'never a raw-base64 character')
    assert.ok(isPlausibleMagicLinkToken(token))
    // 32 random bytes, base64url, no padding.
    const decoded = Buffer.from(token, 'base64url')
    assert.equal(decoded.length, 32)
  }
})

test('A2. isPlausibleMagicLinkToken rejects garbage, short, or non-string input before any lookup', () => {
  for (const bad of ['', 'short', 'has spaces in it 12345678901234567890123456789012345', null, undefined, 42, {}, 'a'.repeat(200)]) {
    assert.equal(isPlausibleMagicLinkToken(bad), false, JSON.stringify(bad))
  }
})

test('A3. TTL is a single named constant, 30 days, and drives expiresAt', () => {
  assert.equal(AIVEX_MAGIC_LINK_TTL_DAYS, 30)
  const expires = magicLinkExpiryFrom(NOW)
  assert.equal(expires.getTime() - NOW.getTime(), 30 * 24 * 60 * 60 * 1000)
})

test('A4. buildMagicLinkUrl uses the request Host, points at /aivex/status, and URL-encodes the token', () => {
  // http in dev (no process.env.VERCEL); https is used on Vercel deployments
  // (production and previews both set it) — see api/_lib/aivex-magic-link.js.
  const url = buildMagicLinkUrl({ headers: { host: 'www.infinty-bba.com' } }, 'abc+def')
  assert.equal(url, 'http://www.infinty-bba.com/aivex/status?token=abc%2Bdef')

  process.env.VERCEL = '1'
  try {
    assert.equal(buildMagicLinkUrl({ headers: { host: 'www.infinty-bba.com' } }, 'abc+def'), 'https://www.infinty-bba.com/aivex/status?token=abc%2Bdef')
  } finally {
    delete process.env.VERCEL
  }
  assert.equal(buildMagicLinkUrl({ headers: {} }, 'x'), null)
})

// =================================================================================
// B. Database storage — raw token never stored, only its hash
// =================================================================================

test('B. issueMagicLink hands the store only a SHA-256 hash, never the raw token', async () => {
  const calls = []
  const magicLinkStore = { async createOrRotate(registrationId, args) { calls.push({ registrationId, ...args }); return 'link-id' } }
  const { magicLink } = await issueMagicLink({
    magicLinkStore, registrationId: 'reg-1', now: NOW, ip: '203.0.113.9', userAgent: 'TestAgent/1.0',
    req: { headers: { host: 'example.test' } },
  })
  assert.equal(calls.length, 1)
  const rawToken = new URL(magicLink).searchParams.get('token')
  assert.equal(calls[0].tokenHash, hashMagicLinkToken(rawToken))
  assert.doesNotMatch(JSON.stringify(calls[0]), new RegExp(rawToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the raw token never appears in what the store receives')
  assert.equal(calls[0].tokenHash.length, 64)
  assert.match(calls[0].tokenHash, /^[0-9a-f]{64}$/)
  // IP/User-Agent are hashed too, never raw.
  assert.equal(calls[0].createdIpHash, hashClientSignal('203.0.113.9'))
  assert.notEqual(calls[0].createdIpHash, '203.0.113.9')
  assert.equal(calls[0].userAgentHash, hashClientSignal('TestAgent/1.0'))
})

test('B2. the Supabase-backed store source never writes a plain "token" column, only "token_hash", and never selects the token back', async () => {
  const source = await read('api/_lib/aivex-magic-link-store.js')
  assert.doesNotMatch(source, /(?<!_)\btoken\s*:/i, 'no bare "token:" column write')
  assert.doesNotMatch(source, /select\(['"][^'"]*\btoken\b(?!_hash)/i, 'select() never names a bare token column')
})

test('B3. the migration stores only a hash (fixed-length hex), never a raw-token-shaped column', async () => {
  const sql = (await read('supabase/migrations/20260921120000_aivex_v4_magic_links.sql'))
    .split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').toLowerCase()
  assert.match(sql, /token_hash text not null/)
  assert.match(sql, /check \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/)
  assert.doesNotMatch(sql, /\btoken\s+text\b/, 'no separate raw "token" column exists')
  for (const destructive of [/drop\s+table/, /drop\s+column/, /\btruncate\b/, /delete\s+from/, /drop\s+schema/, /drop\s+function/]) {
    assert.doesNotMatch(sql, destructive)
  }
  assert.match(sql, /references public\.aivex_registrations \(id\) on delete cascade/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /revoke all on table public\.aivex_magic_links from anon, authenticated/)
})

// =================================================================================
// C. Verification — valid / invalid / expired / revoked, via resolveMagicLink
// =================================================================================

function createMemoryMagicLinkStore() {
  const links = new Map() // id -> row
  const registrations = new Map() // registrationId -> candidate-safe row
  let nextId = 0
  return {
    links, registrations,
    async createOrRotate(registrationId, { tokenHash, expiresAt, createdIpHash, userAgentHash, now }) {
      for (const row of links.values()) if (row.registration_id === registrationId && !row.revoked_at) row.revoked_at = now.toISOString()
      const id = `link-${++nextId}`
      links.set(id, {
        id, registration_id: registrationId, token_hash: tokenHash, expires_at: expiresAt.toISOString(),
        last_used_at: null, revoked_at: null, created_ip_hash: createdIpHash, user_agent_hash: userAgentHash,
      })
      return id
    },
    async findByTokenHash(tokenHash) {
      for (const row of links.values()) if (row.token_hash === tokenHash) return { ...row }
      return null
    },
    async touchLastUsed(id, now) {
      const row = links.get(id)
      if (row) row.last_used_at = now.toISOString()
    },
    async loadCandidateRegistration(registrationId) {
      return registrations.get(registrationId) || null
    },
  }
}

test('C. resolveMagicLink: valid, invalid (unknown), expired, and revoked tokens each resolve distinctly', async () => {
  const magicLinkStore = createMemoryMagicLinkStore()
  const raw = generateMagicLinkToken()
  await magicLinkStore.createOrRotate('reg-1', { tokenHash: hashMagicLinkToken(raw), expiresAt: magicLinkExpiryFrom(NOW), now: NOW })

  assert.deepEqual(await resolveMagicLink({ magicLinkStore, rawToken: raw, now: NOW }), { ok: true, magicLinkId: 'link-1', registrationId: 'reg-1' })
  assert.deepEqual(await resolveMagicLink({ magicLinkStore, rawToken: generateMagicLinkToken(), now: NOW }), { ok: false, status: 'invalid' })
  assert.deepEqual(await resolveMagicLink({ magicLinkStore, rawToken: 'not even token shaped', now: NOW }), { ok: false, status: 'invalid' })

  const later = new Date(NOW.getTime() + AIVEX_MAGIC_LINK_TTL_DAYS * 24 * 60 * 60 * 1000 + 1000)
  assert.deepEqual(await resolveMagicLink({ magicLinkStore, rawToken: raw, now: later }), { ok: false, status: 'expired' })

  const raw2 = generateMagicLinkToken()
  await magicLinkStore.createOrRotate('reg-2', { tokenHash: hashMagicLinkToken(raw2), expiresAt: magicLinkExpiryFrom(NOW), now: NOW })
  magicLinkStore.links.get('link-2').revoked_at = NOW.toISOString()
  assert.deepEqual(await resolveMagicLink({ magicLinkStore, rawToken: raw2, now: NOW }), { ok: false, status: 'revoked' })
})

// =================================================================================
// End to end: real requests -> real handlers, one shared in-memory backend
// =================================================================================

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const E2E_SETTINGS = {
  edition_name: 'الطبعة الثانية', event_start_date: '2026-12-10', event_end_date: '2026-12-12',
  submission_deadline: '2026-11-30', submission_email: 'aivex@univ-bba.dz',
}

const syntheticPayload = (submissionId, teamName) => ({
  submissionId,
  edition: 2,
  formVersion: 4,
  team: { name: teamName, wilaya: { code: '34', name: 'x' }, institution: { id: 'univ-bba', name: 'x', custom: false } },
  activityOfficial: { role: 'activities_officer', fullName: 'Phase5A Test Official', email: 'phase5a-test@example.invalid', phone: '0555000000' },
  delegationHead: { fullName: 'Phase5A Test Head', phone: '0555000001', rfid: 'TEST-HEAD-0001' },
  driver: { fullName: 'Phase5A Test Driver', phone: '0555000002', rfid: 'TEST-DRIVER-0001' },
  students: [1, 2, 3].map((position) => ({
    position, fullName: `Phase5A Test Student ${position}`, phone: `055500000${position + 2}`,
    bacYear: 2021, rfid: `TEST-STUDENT-000${position}`, studentCard: `studentCard_${position}`,
  })),
  consent: true,
})

// One shared backend behind all four handlers (register, magic-link,
// verify, document) — exactly the shape a single Supabase project gives
// each of them in production, just kept in memory here.
function createSharedBackend() {
  const db = { registrations: [], students: [], cards: new Map(), documents: new Map(), files: new Map(), magicLinks: new Map() }
  let nextRegId = 0
  let nextLinkId = 0
  const find = (id) => db.registrations.find((entry) => entry.id === id)

  const registrationStore = {
    async findBySubmissionId(submissionId) {
      const row = db.registrations.find((entry) => entry.submission_id === submissionId)
      if (!row) return null
      return {
        id: row.id, reference: row.reference, fingerprint: row.submission_fingerprint, createdAt: row.created_at,
        studentCount: db.students.filter((entry) => entry.registration_id === row.id).length,
      }
    },
    async insertRegistration(row) {
      if (db.registrations.some((entry) => entry.submission_id === row.submission_id || entry.reference === row.reference)) {
        return { ok: false, duplicate: true, code: '23505' }
      }
      const id = `00000000-0000-4000-8000-${String(++nextRegId).padStart(12, '0')}`
      db.registrations.push({ ...row, id, created_at: row.submitted_at })
      return { ok: true, id, reference: row.reference }
    },
    async uploadCard(path, buffer, mime) { db.cards.set(path, { size: buffer.length, mime }) },
    async insertStudents(rows) { db.students.push(...rows) },
    async removeCards(paths) { paths.forEach((path) => db.cards.delete(path)) },
    async deleteRegistration(id) {
      db.registrations.splice(db.registrations.findIndex((entry) => entry.id === id), 1)
      db.students = db.students.filter((entry) => entry.registration_id !== id)
    },
  }

  const documentStore = {
    async claimGeneration(registrationId, { staleBefore }) {
      const row = find(registrationId)
      const claimable = row && (['not_generated', 'generation_failed'].includes(row.document_status)
        || (row.document_status === 'generating' && new Date(row.updated_at) < staleBefore))
      if (!claimable) return false
      row.document_status = 'generating'
      row.updated_at = NOW.toISOString()
      return true
    },
    async loadRegistrationData(registrationId) {
      return {
        registration: find(registrationId),
        students: db.students.filter((entry) => entry.registration_id === registrationId).sort((a, b) => a.position - b.position),
        settings: E2E_SETTINGS,
      }
    },
    async uploadDocument(path, buffer, mimeType) { db.files.set(path, { buffer, mimeType }) },
    async upsertDocumentRow(row) { db.documents.set(`${row.registration_id}:${row.document_type}`, row) },
    async removeDocumentFile(path) { db.files.delete(path) },
    async setDocumentStatus(registrationId, status) { find(registrationId).document_status = status },
    async findRegistrationForDownload({ reference, submissionId }) {
      const row = db.registrations.find((entry) => entry.submission_id === submissionId && entry.reference === reference)
      return row ? { id: row.id, edition: row.edition, reference: row.reference } : null
    },
    async loadDocumentRow(registrationId, documentType) { return db.documents.get(`${registrationId}:${documentType}`) || null },
    async downloadDocument(path) {
      if (!db.files.has(path)) throw Object.assign(new Error('missing'), { stage: 'download', code: 404 })
      return db.files.get(path).buffer
    },
  }

  const magicLinkStore = {
    async createOrRotate(registrationId, { tokenHash, expiresAt, createdIpHash, userAgentHash, now }) {
      for (const row of db.magicLinks.values()) if (row.registration_id === registrationId && !row.revoked_at) row.revoked_at = now.toISOString()
      const id = `link-${++nextLinkId}`
      db.magicLinks.set(id, {
        id, registration_id: registrationId, token_hash: tokenHash, expires_at: expiresAt.toISOString(),
        last_used_at: null, revoked_at: null, created_ip_hash: createdIpHash, user_agent_hash: userAgentHash,
      })
      return id
    },
    async findByTokenHash(tokenHash) {
      for (const row of db.magicLinks.values()) if (row.token_hash === tokenHash) return { ...row }
      return null
    },
    async touchLastUsed(id, now) {
      const row = db.magicLinks.get(id)
      if (row) row.last_used_at = now.toISOString()
    },
    async loadCandidateRegistration(registrationId) {
      const row = find(registrationId)
      if (!row) return null
      return {
        reference: row.reference, team_name: row.team_name, institution_name: row.institution_name, wilaya_name: row.wilaya_name,
        student_count: row.student_count, registration_status: row.registration_status, document_status: row.document_status,
      }
    },
  }

  return { db, registrationStore, documentStore, magicLinkStore }
}

let e2eIp = 0
async function postMultipart(handler, payload) {
  const form = new FormData()
  form.append('payload', JSON.stringify(payload))
  for (const position of [1, 2, 3]) form.append(`studentCard_${position}`, new Blob([PNG], { type: 'image/png' }), `studentCard_${position}.png`)
  const response = new Response(form)
  const req = Readable.from([Buffer.from(await response.arrayBuffer())])
  e2eIp += 1
  Object.assign(req, {
    method: 'POST',
    headers: {
      'content-type': response.headers.get('content-type'), 'x-forwarded-for': `198.51.100.${e2eIp}`, 'user-agent': 'test-agent',
      host: 'aivex.example.test',
    },
    socket: {},
  })
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(name, value) { this.headers[name] = value },
      end(body) { resolve({ status: this.statusCode, body: JSON.parse(body) }) },
    }
    handler(req, res)
  })
}

let jsonIp = 0
function postJson(handler, body, { raw, method = 'POST', headers = {} } = {}) {
  const req = Readable.from([Buffer.from(raw ?? JSON.stringify(body ?? {}))])
  jsonIp += 1
  Object.assign(req, {
    method, socket: {},
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `203.0.113.${jsonIp % 250}`, host: 'aivex.example.test', ...headers },
  })
  return new Promise((resolve) => {
    const res = {
      headers: {},
      setHeader(name, value) { this.headers[name.toLowerCase()] = value },
      end(payload) {
        const isJson = String(this.headers['content-type']).startsWith('application/json')
        resolve({ status: this.statusCode, headers: this.headers, body: isJson ? JSON.parse(payload) : payload })
      },
    }
    handler(req, res)
  })
}

function handlers(backend) {
  delete process.env.VERCEL
  return {
    register: createRegisterHandler({
      createStore: () => backend.registrationStore, createDocumentStore: () => backend.documentStore,
      createMagicLinkStore: () => backend.magicLinkStore, now: () => NOW,
    }),
    magicLink: createMagicLinkHandler({
      createMagicLinkStore: () => backend.magicLinkStore, createRegistrationLookupStore: () => backend.documentStore, now: () => NOW,
    }),
    verify: createMagicLinkVerifyHandler({ createMagicLinkStore: () => backend.magicLinkStore, now: () => NOW }),
    document: createMagicLinkDocumentHandler({
      createMagicLinkStore: () => backend.magicLinkStore, createDocumentStore: () => backend.documentStore, now: () => NOW,
    }),
  }
}

async function registerCandidate(h, submissionId, teamName) {
  const { body } = await postMultipart(h.register, syntheticPayload(submissionId, teamName))
  return body
}

test('e2e: a successful registration response includes a Magic Link (URL-shaped, points at /aivex/status)', async () => {
  const backend = createSharedBackend()
  const h = handlers(backend)
  const body = await registerCandidate(h, '11111111-1111-4111-8111-111111111111', 'PHASE5A TEST ONE')
  assert.deepEqual(Object.keys(body).sort(), ['magicLink', 'reference', 'success'])
  assert.match(body.magicLink, /^http:\/\/[^/]+\/aivex\/status\?token=[A-Za-z0-9_%-]+$/)
  assert.equal(backend.db.magicLinks.size, 1)
})

test('e2e: replaying the same submissionId rotates the Magic Link (a lost first response gets a working new one)', async () => {
  const backend = createSharedBackend()
  const h = handlers(backend)
  const first = await registerCandidate(h, '22222222-2222-4222-8222-222222222222', 'PHASE5A TEST TWO')
  const replay = await postMultipart(h.register, syntheticPayload('22222222-2222-4222-8222-222222222222', 'PHASE5A TEST TWO'))
  assert.equal(replay.status, 200)
  assert.equal(replay.body.alreadyProcessed, true)
  assert.ok(replay.body.magicLink)
  assert.notEqual(replay.body.magicLink, first.magicLink, 'a fresh token, not the same one repeated')

  const oldToken = new URL(first.magicLink).searchParams.get('token')
  const newToken = new URL(replay.body.magicLink).searchParams.get('token')
  const oldVerify = await postJson(h.verify, { token: oldToken })
  const newVerify = await postJson(h.verify, { token: newToken })
  assert.deepEqual(oldVerify.body, { success: false, status: 'revoked' })
  assert.equal(newVerify.body.success, true)
  assert.equal(backend.db.magicLinks.size, 2, 'the old row is kept, revoked — not deleted')
})

test('e2e: verify returns only candidate-safe fields, no internal id, no student rows, no storage path', async () => {
  const backend = createSharedBackend()
  const h = handlers(backend)
  const body = await registerCandidate(h, '33333333-3333-4333-8333-333333333333', 'PHASE5A TEST THREE')
  const token = new URL(body.magicLink).searchParams.get('token')
  const verified = await postJson(h.verify, { token })
  assert.equal(verified.status, 200)
  assert.deepEqual(Object.keys(verified.body).sort(), [
    'documentStatus', 'institutionName', 'reference', 'registrationStatus', 'status', 'studentCount', 'success', 'teamName', 'wilayaName',
  ])
  assert.equal(verified.body.reference, body.reference)
  assert.equal(verified.body.documentStatus, 'awaiting_signature')
  assert.equal(verified.body.studentCount, 3)
  const flat = JSON.stringify(verified.body)
  assert.doesNotMatch(flat, /00000000-0000-4000-8000-|edition-\d+\/|\.docx|Phase5A Test Student|TEST-STUDENT-|TEST-HEAD-|TEST-DRIVER-|phase5a-test@/, 'no internal id, card path, student detail, RFID or email leaks')
})

test('D. isolation: a Magic Link for registration A can never resolve, verify or download registration B, even if B is named explicitly', async () => {
  const backend = createSharedBackend()
  const h = handlers(backend)
  const a = await registerCandidate(h, '44444444-4444-4444-8444-444444444444', 'PHASE5A TEST FOUR A')
  const b = await registerCandidate(h, '55555555-5555-4555-8555-555555555555', 'PHASE5A TEST FOUR B')
  const tokenA = new URL(a.magicLink).searchParams.get('token')

  const verified = await postJson(h.verify, { token: tokenA })
  assert.equal(verified.body.reference, a.reference)
  assert.notEqual(verified.body.reference, b.reference)

  // "token + arbitrary reference" must never override which registration is used.
  const downloaded = await postJson(h.document, { token: tokenA, reference: b.reference, registrationId: 'anything' })
  assert.equal(downloaded.status, 200)
  const text = (await (await JSZip.loadAsync(downloaded.body)).file('word/document.xml').async('string')).replace(/<[^>]+>/g, '')
  assert.ok(text.includes(a.reference), 'the file belongs to A')
  assert.ok(!text.includes(b.reference), 'never B, despite B being named in the body')
})

test('E. rotation: a new link fully replaces the old one, which stops working; the new one works end to end', async () => {
  const backend = createSharedBackend()
  const h = handlers(backend)
  const body = await registerCandidate(h, '66666666-6666-4666-8666-666666666666', 'PHASE5A TEST FIVE')
  const oldToken = new URL(body.magicLink).searchParams.get('token')

  // Recovery-path rotation via the standalone endpoint (reference + submissionId).
  const rotated = await postJson(h.magicLink, { reference: body.reference, submissionId: '66666666-6666-4666-8666-666666666666' })
  assert.equal(rotated.status, 200)
  const newToken = new URL(rotated.body.magicLink).searchParams.get('token')
  assert.notEqual(newToken, oldToken)

  assert.deepEqual((await postJson(h.verify, { token: oldToken })).body, { success: false, status: 'revoked' })
  const newVerify = await postJson(h.verify, { token: newToken })
  assert.equal(newVerify.body.success, true)
  const newDownload = await postJson(h.document, { token: newToken })
  assert.equal(newDownload.status, 200)
})

test('F. document access: invalid and expired tokens cannot download; a valid one gets exactly its own DOCX', async () => {
  const backend = createSharedBackend()
  const h = handlers(backend)
  const body = await registerCandidate(h, '77777777-7777-4777-8777-777777777777', 'PHASE5A TEST SIX')
  const token = new URL(body.magicLink).searchParams.get('token')

  assert.deepEqual((await postJson(h.document, { token: generateMagicLinkToken() })).body, { success: false, status: 'invalid' })

  const future = new Date(NOW.getTime() + 31 * 24 * 60 * 60 * 1000)
  const expiredDocumentHandler = createMagicLinkDocumentHandler({
    createMagicLinkStore: () => backend.magicLinkStore, createDocumentStore: () => backend.documentStore, now: () => future,
  })
  const expired = await postJson(expiredDocumentHandler, { token })
  assert.equal(expired.status, 401)
  assert.deepEqual(expired.body, { success: false, status: 'expired' })

  const good = await postJson(h.document, { token })
  assert.equal(good.status, 200)
  assert.equal(good.headers['content-disposition'], `attachment; filename="fiche-officielle-${body.reference}.docx"`)
  assert.equal(good.headers['cache-control'], 'no-store')
})

test('e2e: a Magic Link still resolves and downloads after a generation failure, retrying on demand like the base download endpoint', async () => {
  const backend = createSharedBackend()
  const upload = backend.documentStore.uploadDocument
  backend.documentStore.uploadDocument = async () => { throw Object.assign(new Error('storage down'), { statusCode: 503 }) }
  const h = handlers(backend)
  const logged = console.error
  console.error = () => {}
  let body
  try {
    body = await registerCandidate(h, '88888888-8888-4888-8888-888888888888', 'PHASE5A TEST SEVEN')
  } finally {
    console.error = logged
  }
  const token = new URL(body.magicLink).searchParams.get('token')
  const stillFailing = await postJson(h.document, { token })
  assert.equal(stillFailing.status, 409)
  assert.deepEqual(stillFailing.body, { success: false, status: 'document_not_ready' })

  backend.documentStore.uploadDocument = upload
  const recovered = await postJson(h.document, { token })
  assert.equal(recovered.status, 200)
})

test('malformed / wrong-method requests are refused on all three new endpoints, with no internal detail', async () => {
  const backend = createSharedBackend()
  const h = handlers(backend)
  for (const handler of [h.magicLink, h.verify, h.document]) {
    const getResponse = await postJson(handler, null, { raw: '', method: 'GET' })
    assert.equal(getResponse.status, 405)
    assert.equal(getResponse.headers.allow, 'POST')
  }
  // magic-link.js: malformed JSON, or an invalid reference/submissionId shape,
  // is a 400 (it validates its two fields before ever touching a store).
  for (const raw of [{}, { reference: 'x', submissionId: '66666666-6666-4666-8666-666666666666' }, { reference: 'AIVEX2-ZZZZZZZZ', submissionId: 'not-a-uuid' }]) {
    assert.equal((await postJson(h.magicLink, raw)).status, 400)
  }
  assert.equal((await postJson(h.magicLink, null, { raw: '{not json' })).status, 400)

  // verify / document: the token is the only field, so a missing/malformed
  // one is just an implausible token — 401 'invalid', not a 400.
  for (const handler of [h.verify, h.document]) {
    assert.equal((await postJson(handler, {})).status, 401)
    assert.equal((await postJson(handler, null, { raw: '{not json' })).status, 401)
  }
})

test('security: origin-checked and rate-limited like the rest of the AIVEX API', async () => {
  const backend = createSharedBackend()
  const h = handlers(backend)
  const body = await registerCandidate(h, '99999999-9999-4999-8999-999999999999', 'PHASE5A TEST EIGHT')
  const token = new URL(body.magicLink).searchParams.get('token')

  process.env.VERCEL = '1'
  try {
    const foreign = await postJson(h.verify, { token }, { headers: { host: 'www.infinty-bba.com', origin: 'https://evil.example' } })
    assert.equal(foreign.status, 403)
  } finally {
    delete process.env.VERCEL
  }

  const statuses = []
  for (let i = 0; i < 31; i += 1) {
    statuses.push((await postJson(h.verify, { token }, { headers: { 'x-forwarded-for': '192.0.2.55' } })).status)
  }
  assert.ok(statuses.slice(0, 30).every((status) => status === 200))
  assert.equal(statuses[30], 429)
})

test('security: the raw token is never logged, on any success or failure path across the new endpoints', async () => {
  const backend = createSharedBackend()
  const h = handlers(backend)
  const body = await registerCandidate(h, 'aaaaaaaa-1111-4111-8111-111111111111', 'PHASE5A TEST NINE')
  const token = new URL(body.magicLink).searchParams.get('token')

  const logs = []
  const logged = console.error
  console.error = (...args) => logs.push(args)
  try {
    await postJson(h.verify, { token })
    await postJson(h.verify, { token: generateMagicLinkToken() })
    await postJson(h.document, { token })
    backend.documentStore.downloadDocument = async () => { throw Object.assign(new Error(`leak ${token}`), { stage: 'download', code: 503 }) }
    await postJson(h.document, { token })
  } finally {
    console.error = logged
  }
  const flat = JSON.stringify(logs)
  assert.doesNotMatch(flat, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('storage/PII discipline: no public URL, no signed URL, and logs carry a stage + code only, across every new file', async () => {
  const files = [
    'api/_lib/aivex-magic-link.js', 'api/_lib/aivex-magic-link-store.js', 'api/aivex/magic-link.js',
    'api/aivex/magic-link/verify.js', 'api/aivex/magic-link/document.js', 'api/aivex/register.js',
  ]
  for (const file of files) {
    const source = await read(file)
    assert.doesNotMatch(source, /getPublicUrl|createSignedUrl/, file)
    for (const [, args] of source.matchAll(/console\.(?:error|log|warn)\(([^)]*)\)/g)) {
      const logged = args.replace(/'[^']*'/g, "''")
      assert.doesNotMatch(logged, /\btoken\b(?!Hash)|path|payload|body\b|registration\b|email|rfid|phone|magicLink/i, `${file} logs ${args}`)
    }
  }
  for (const dir of await readdir(new URL('../src/', import.meta.url), { recursive: true })) {
    if (!dir.endsWith('.js') && !dir.endsWith('.jsx')) continue
    const source = await read(`src/${dir}`)
    assert.doesNotMatch(source, /aivex_magic_links|SUPABASE_SECRET_KEY|@supabase\/supabase-js/, `src/${dir}`)
  }
})

// =================================================================================
// G. Frontend — static checks (no jsdom in this project's toolchain): the
// token is read from the URL, never persisted, and every required state has
// a French/English/Arabic string.
// =================================================================================

test('frontend: the status page reads the token from the URL query string and never persists it', async () => {
  const source = await read('src/pages/aivex/status/useAivexStatus.js')
  assert.match(source, /new URLSearchParams\(window\.location\.search\)\.get\('token'\)/)
  // No storage write of any kind in this file (a comment above may legitimately
  // *say* "never localStorage/sessionStorage" — what matters is no .setItem call).
  assert.doesNotMatch(source, /\.setItem\(/)
  assert.match(source, /\/api\/aivex\/magic-link\/verify/)
  assert.match(source, /\/api\/aivex\/magic-link\/document/)
})

test('frontend: /aivex/status is routed, and every required state has FR/EN/AR strings with correct RTL for Arabic', async () => {
  const app = await read('src/App.jsx')
  assert.match(app, /path="\/aivex\/status"/)

  const { getStatusStrings } = await import('../src/pages/aivex/status/statusI18n.js')
  const requiredKeys = [
    'loadingTitle', 'loadingText', 'invalidTitle', 'invalidText', 'expiredTitle', 'expiredText',
    'revokedTitle', 'revokedText', 'notFoundTitle', 'notFoundText', 'serverErrorTitle', 'serverErrorText',
    'validTitle', 'documentReadyNote', 'downloadButton',
  ]
  for (const lang of ['en', 'fr', 'ar']) {
    const strings = getStatusStrings(lang)
    for (const key of requiredKeys) assert.equal(typeof strings[key], 'string', `${lang}.${key}`)
  }
  assert.equal(getStatusStrings('ar').dir, 'rtl')
  assert.equal(getStatusStrings('fr').dir, 'ltr')
  assert.equal(getStatusStrings('en').dir, 'ltr')
  assert.equal(getStatusStrings('fr').downloadButton, '📄 Télécharger la fiche officielle')
})

// =================================================================================
// Success-screen access card — the Magic Link handed to the candidate.
// =================================================================================

// Comments legitimately *describe* what the card must never do ("never
// written to localStorage..."), so these checks read the code only.
const withoutComments = (source) => source
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n')

test('access card: uses the backend link verbatim, and never stores, logs or transmits it', async () => {
  const card = withoutComments(await read('src/pages/aivex/register/MagicLinkAccessCard.jsx'))
  // Used exactly as the API returned it: never rebuilt from parts, never
  // parsed, never re-fetched just to open it.
  assert.match(card, /href=\{magicLink\}/, 'the CTA opens the link itself')
  assert.match(card, /value=\{magicLink\}/, 'the QR encodes the same link')
  assert.match(card, /navigator\.clipboard\.writeText\(magicLink\)/, 'copy copies the same link')
  assert.doesNotMatch(card, /new URL\(|\.replace\(|\.split\(|searchParams/, 'the link is never taken apart')

  // A bearer credential: no persistence anywhere, no logging, no telemetry.
  assert.doesNotMatch(card, /localStorage|sessionStorage|indexedDB|document\.cookie|\.setItem\(/)
  assert.doesNotMatch(card, /console\.(log|error|warn|info|debug)/)
  assert.doesNotMatch(card, /fetch\(|XMLHttpRequest|navigator\.sendBeacon|analytics|gtag|dataLayer/)
})

test('access card: the QR code is generated in the browser — no third-party QR service anywhere in the frontend', async () => {
  const card = await read('src/pages/aivex/register/MagicLinkAccessCard.jsx')
  assert.match(card, /from 'qrcode\.react'/, 'client-side encoder, bundled with the app')
  assert.match(card, /marginSize=\{QR_QUIET_ZONE_MODULES\}/, 'the QR keeps its quiet zone (qrcode.react defaults it to 0)')
  assert.match(card, /const QR_QUIET_ZONE_MODULES = 4\b/)
  assert.doesNotMatch(card, /https?:\/\//, 'the card references no remote URL at all')

  // No remote QR generator may ever appear anywhere in the frontend: doing
  // so would hand a bearer credential to a third party as a query string.
  for (const entry of await readdir(new URL('../src/', import.meta.url), { recursive: true })) {
    if (!entry.endsWith('.js') && !entry.endsWith('.jsx')) continue
    const source = await read(`src/${entry}`)
    assert.doesNotMatch(source, /qrserver|chart\.googleapis|goqr|qrickit|quickchart|qr-code-generator|qrcode\.show/i, `src/${entry}`)
  }
})

test('access card: rendered only when the backend actually returned a link, with the reference kept separate from it', async () => {
  const success = await read('src/pages/aivex/register/RegistrationSuccess.jsx')
  assert.match(success, /\{magicLink && <MagicLinkAccessCard magicLink=\{magicLink\} t=\{t\} \/>\}/)
  // The reference is an identifier, not a credential: it is shown in its
  // own block, outside the access card, and that block carries only the
  // reference — never the link.
  const referenceBlock = /<p className="axr-success-reference">([\s\S]*?)<\/p>/.exec(success)
  assert.ok(referenceBlock, 'the reference has its own block')
  assert.match(referenceBlock[1], /\{reference\}/)
  assert.doesNotMatch(referenceBlock[1], /magicLink/, 'the reference block never carries the link')
})

test('access card: FR/EN/AR strings exist for every action, and no warning text leaks a link or token', async () => {
  const { getRegistrationStrings } = await import('../src/pages/aivex/register/registrationI18n.js')
  const keys = ['accessTitle', 'accessLead', 'accessOpen', 'accessCopy', 'accessCopied', 'accessCopyFailed',
    'accessQrHint', 'accessQrAlt', 'accessReference', 'accessWarning']
  for (const lang of ['en', 'fr', 'ar']) {
    const strings = getRegistrationStrings(lang)
    for (const key of keys) assert.equal(typeof strings[key], 'string', `${lang}.${key}`)
    // Nothing user-visible may contain a URL or the word "token".
    for (const key of keys) assert.doesNotMatch(strings[key], /https?:\/\/|token/i, `${lang}.${key}`)
  }
  assert.equal(getRegistrationStrings('fr').accessOpen, 'Accéder à mon dossier')
  assert.equal(getRegistrationStrings('en').accessOpen, 'Access my application')
  assert.equal(getRegistrationStrings('ar').accessOpen, 'الوصول إلى ملفي')
  assert.equal(getRegistrationStrings('fr').accessCopy, 'Copier le lien')
  assert.equal(getRegistrationStrings('fr').accessCopied, '✓ Lien copié')
  assert.equal(getRegistrationStrings('fr').accessQrHint, 'Scannez ce QR code avec votre téléphone pour retrouver votre dossier.')
  assert.equal(getRegistrationStrings('fr').accessReference, 'Référence AIVEX')
  for (const lang of ['en', 'fr', 'ar']) assert.match(getRegistrationStrings(lang).accessWarning, /🔒/)
})

// Phase 5B (signed-document upload) is now implemented — see
// tests/aivex-signed-document.test.mjs, including its own guard for what
// Phase 5B itself must NOT contain (admin review, OCR, payment, etc.). The
// test that used to assert "no upload exists yet" was removed here because
// that premise is no longer true, not because the check was weakened.
