import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import test from 'node:test'
import { createAdminAivexService } from '../api/_lib/admin-aivex.js'
import { canAccessAivexDocuments, canManageAivex } from '../api/_lib/admin-aivex-permissions.js'
import {
  isAivexDocumentKey, isAivexReference, parseAivexListOptions, validateAivexActionBody,
} from '../api/_lib/admin-aivex-validation.js'
import { createAdminAivexHandler } from '../api/admin-auth.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const NOW = new Date('2026-09-25T14:00:00.000Z')
const REFERENCE = 'AIVEX2-7K9M2P4R'
const REGISTRATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ADMIN = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'administrator', displayName: 'AIVEX Administrator' }

const overview = {
  reference: REFERENCE, edition: 2, form_version: 4, team_name: 'Nova Circuit',
  wilaya_code: '34', wilaya_name: 'Bordj Bou Arreridj', institution_name: 'University of Bordj Bou Arreridj',
  institution_custom: false, activity_official_name: 'Samir Ait Ouali', activity_official_role: 'activities_officer',
  registration_status: 'approved', document_status: 'under_review', submitted_at: '2026-09-20T09:00:00.000Z',
  created_at: '2026-09-20T09:00:00.000Z', updated_at: '2026-09-25T12:00:00.000Z',
  team_information_complete: true, activity_official_verified: true, delegation_head_verified: true,
  driver_verified: true, exact_student_count: true, student_cards_present: true,
  identity_documents_present: true, official_form_generated: true, signed_document_received: true,
  signed_document_verified: true, student_cards_verified: true, completeness: 100, attention_rank: 3,
}

const registration = {
  id: REGISTRATION_ID, ...overview, institution_id: 'univ-bba', activity_official_email: 'activities@example.dz',
  activity_official_phone: '+213555111222', delegation_head_name: 'Mounir Saidi', delegation_head_phone: '+213555111223',
  delegation_head_rfid: '01234567', delegation_head_id_card_path: `${REGISTRATION_ID}/private-leader.png`,
  delegation_head_id_card_mime: 'image/png', delegation_head_id_card_size: 1000, delegation_head_id_card_purged_at: null,
  driver_name: 'Hakim Larbi', driver_phone: '+213555111224', driver_rfid: '07654321',
  driver_id_card_path: `${REGISTRATION_ID}/private-driver.jpg`, driver_id_card_mime: 'image/jpeg',
  driver_id_card_size: 1200, driver_id_card_purged_at: null, current_form_revision: 1,
  template_version: 'AIVEX-2.4', source: '/aivex/register',
}

const students = [1, 2, 3].map((position) => ({
  position, full_name: `Student ${position}`, phone: `+21355511122${position}`,
  bac_year: 2023, rfid_number: `0000000${position}`,
  student_card_path: `${REGISTRATION_ID}/student-${position}.jpg`, student_card_mime: 'image/jpeg',
  student_card_size_bytes: 2048, created_at: '2026-09-20T09:00:00.000Z', updated_at: '2026-09-20T09:00:00.000Z',
}))

class MemoryAivexStore {
  constructor() {
    this.audits = []
    this.actions = []
  }
  async list() { return { rows: [overview], count: 1 } }
  async summaryRows() { return [overview] }
  async findByReference(value) { return value === REFERENCE ? { ...registration } : null }
  async overview() { return { ...overview } }
  async students() { return students.map((student) => ({ ...student })) }
  async generatedDocuments() { return [{ document_type: 'docx', generation_status: 'generated', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', file_size_bytes: 8192, template_version: 'AIVEX-2.4', error_code: null, created_at: '2026-09-20T09:02:00.000Z', updated_at: '2026-09-20T09:02:00.000Z' }] }
  async submittedDocuments() { return [{ version: 1, original_file_name: 'signed-form.pdf', mime_type: 'application/pdf', size_bytes: 4096, status: 'uploaded', uploaded_at: '2026-09-21T09:00:00.000Z', created_at: '2026-09-21T09:00:00.000Z', updated_at: '2026-09-21T09:00:00.000Z' }] }
  async documentReviews() {
    return [...['delegation-leader', 'driver', 'signed-v1', 'student-1', 'student-2', 'student-3']].map((key) => ({ document_key: key, review_status: 'verified', note: 'Visual match confirmed.', reviewed_at: '2026-09-24T10:00:00.000Z', reviewer: { display_name: 'AIVEX Administrator' } }))
  }
  async corrections() { return [] }
  async audit() { return [...this.audits] }
  async applyAction(input) { this.actions.push(input); return NOW.toISOString() }
  async auditEvent(input) { this.audits.push({ action: input.action, sensitivity: input.sensitivity, metadata: input.metadata, created_at: input.now.toISOString(), administrator: { display_name: 'AIVEX Administrator' } }) }
  async resolveDocument(_registration, key) {
    if (key !== 'student-1') return null
    return { bucket: 'aivex-student-cards', path: 'private/path-never-returned.jpg', mimeType: 'image/jpeg', size: 4, name: 'student-card-01.jpg', confidential: true }
  }
  async downloadDocument() { return Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }
}

function request(method, url, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  req.headers = headers
  return req
}

function response() {
  return {
    statusCode: 0, headers: {}, rawBody: null, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(value) {
      this.rawBody = value
      if (Buffer.isBuffer(value)) return
      this.body = value ? JSON.parse(value) : null
    },
  }
}

test('AIVEX query and mutation validation accept only the production contract', () => {
  const parsed = parseAivexListOptions(new URLSearchParams('page=2&limit=12&edition=2&registration=under_review&document=signed_document_uploaded&sort=attention_asc'))
  assert.equal(parsed.ok, true)
  assert.equal(parsed.value.page, 2)
  assert.equal(parsed.value.edition, 2)
  assert.equal(parseAivexListOptions(new URLSearchParams('document=unknown')).ok, false)
  assert.equal(parseAivexListOptions(new URLSearchParams('limit=500')).ok, false)
  assert.equal(isAivexReference(REFERENCE), true)
  assert.equal(isAivexReference('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), false)
  assert.equal(isAivexDocumentKey('signed-v12'), true)
  assert.equal(isAivexDocumentKey('../private/path'), false)

  const correction = validateAivexActionBody({
    action: 'request_corrections', expectedUpdatedAt: NOW.toISOString(),
    payload: { items: ['Signed and stamped form'], deadline: '2026-10-02' },
  })
  assert.equal(correction.ok, true)
  assert.equal(validateAivexActionBody({ ...correction.value, payload: { ...correction.value.payload, items: ['Unknown'] } }).ok, false)
})

test('AIVEX permissions keep critical decisions away from reviewers', () => {
  assert.equal(canManageAivex('reviewer', 'verify_document'), true)
  assert.equal(canManageAivex('reviewer', 'validate_file'), false)
  assert.equal(canManageAivex('administrator', 'validate_file'), true)
  assert.equal(canManageAivex('super_admin', 'cancel_registration'), true)
  assert.equal(canAccessAivexDocuments('reviewer'), true)
  assert.equal(canAccessAivexDocuments('unknown'), false)
})

test('list and detail expose public references and metadata, never database ids or private paths', async () => {
  const store = new MemoryAivexStore()
  const service = createAdminAivexService({ store, now: () => NOW })
  const list = await service.list({ page: 1, limit: 12, edition: 2 }, ADMIN)
  assert.equal(list.data[0].id, REFERENCE)
  assert.equal(list.summary.registered, 1)
  const detail = await service.detail(REFERENCE, ADMIN)
  assert.equal(detail.ref, REFERENCE)
  assert.equal(detail.students.length, 3)
  assert.equal(detail.canValidate, true)
  assert.deepEqual(detail.reviewSummary.groups.map(({ key, ready }) => ({ key, ready })), [
    { key: 'team', ready: true },
    { key: 'people', ready: true },
    { key: 'documents', ready: true },
  ])
  assert.deepEqual(detail.reviewSummary.blockers, [])
  assert.deepEqual(detail.reviewSummary.documents, { verified: 6, total: 6 })
  assert.equal(detail.reviewSummary.nextAction.key, 'validate_file')
  const serialized = JSON.stringify({ list, detail })
  assert.doesNotMatch(serialized, new RegExp(REGISTRATION_ID))
  assert.doesNotMatch(serialized, /private-leader|private-driver|student_card_path|checksum|sha256/i)
  assert(detail.docs.every((document) => !('path' in document)))
})

test('AIVEX review summary turns technical checks into clear administrative blockers', async () => {
  class IncompleteAivexStore extends MemoryAivexStore {
    async overview() {
      return {
        ...overview,
        registration_status: 'under_review',
        activity_official_verified: false,
        official_form_generated: false,
        signed_document_verified: false,
        completeness: 70,
      }
    }
    async generatedDocuments() { return [] }
    async documentReviews() {
      return [{ document_key: 'student-1', review_status: 'verified', reviewed_at: NOW.toISOString(), reviewer: { display_name: 'AIVEX Administrator' } }]
    }
  }
  const service = createAdminAivexService({ store: new IncompleteAivexStore(), now: () => NOW })
  const detail = await service.detail(REFERENCE, ADMIN)
  assert.equal(detail.canValidate, false)
  assert.equal(detail.reviewSummary.nextAction.key, 'review_required')
  assert.deepEqual(detail.reviewSummary.groups.map(({ key, ready }) => ({ key, ready })), [
    { key: 'team', ready: true },
    { key: 'people', ready: false },
    { key: 'documents', ready: false },
  ])
  assert.deepEqual(detail.reviewSummary.blockers.map((blocker) => blocker.key), [
    'activities_manager', 'official_form', 'confidential_documents', 'signed_form_review',
  ])
  assert.equal(detail.reviewSummary.documents.verified, 1)
})

test('a fully reviewed team is ready for one final acceptance without a separate approval step', async () => {
  class ReadyForAcceptanceStore extends MemoryAivexStore {
    async overview() { return { ...overview, registration_status: 'under_review' } }
  }
  const service = createAdminAivexService({ store: new ReadyForAcceptanceStore(), now: () => NOW })
  const detail = await service.detail(REFERENCE, ADMIN)
  assert.equal(detail.registration, 'Under review')
  assert.equal(detail.canValidate, true)
  assert.deepEqual(detail.reviewSummary.blockers, [])
  assert.equal(detail.reviewSummary.nextAction.key, 'validate_file')
})

test('confidential document access is proxied and audited without returning its Storage path', async () => {
  const store = new MemoryAivexStore()
  const service = createAdminAivexService({ store, now: () => NOW })
  const result = await service.document(REFERENCE, 'student-1', ADMIN)
  assert.equal(result.ok, true)
  assert.equal(result.mimeType, 'image/jpeg')
  assert.deepEqual(result.buffer, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
  assert(store.audits.some((event) => event.action === 'confidential_document_opened'))
  assert.doesNotMatch(JSON.stringify(store.audits), /private\/path/)
})

test('AIVEX actions enforce role permissions before reaching the store', async () => {
  const store = new MemoryAivexStore()
  const service = createAdminAivexService({ store, now: () => NOW })
  const reviewer = { ...ADMIN, role: 'reviewer' }
  const denied = await service.act(REFERENCE, { action: 'validate_file', expectedUpdatedAt: registration.updated_at, payload: {} }, reviewer)
  assert.equal(denied.status, 403)
  assert.equal(store.actions.length, 0)
  const allowed = await service.act(REFERENCE, { action: 'verify_document', expectedUpdatedAt: registration.updated_at, payload: { documentKey: 'student-1' } }, reviewer)
  assert.equal(allowed.ok, true)
  assert.equal(store.actions.length, 1)
  assert.equal(store.actions[0].adminUserId, ADMIN.id)
  assert.equal(store.actions[0].reason, 'Document verified in the confidential viewer')
})

test('AIVEX handler fails closed behind its feature flag, session and strict mutation origin', async () => {
  const service = createAdminAivexService({ store: new MemoryAivexStore(), now: () => NOW })
  const base = { ADMIN_AIVEX_API_ENABLED: 'true', NODE_ENV: 'production' }

  const disabled = createAdminAivexHandler({ createService: () => service, requireSession: async () => ({ user: ADMIN }), env: { ...base, ADMIN_AIVEX_API_ENABLED: 'false' } })
  const disabledRes = response()
  await disabled(request('GET', `/api/admin-auth?__admin_path=aivex`), disabledRes)
  assert.equal(disabledRes.statusCode, 503)

  const unauthenticated = createAdminAivexHandler({ createService: () => service, requireSession: async () => null, env: base })
  const unauthenticatedRes = response()
  await unauthenticated(request('GET', `/api/admin-auth?__admin_path=aivex`), unauthenticatedRes)
  assert.equal(unauthenticatedRes.statusCode, 401)

  let called = false
  const mutation = createAdminAivexHandler({
    createService: () => ({ act: async () => { called = true } }),
    requireSession: async () => ({ user: ADMIN }), env: base,
  })
  const mutationRes = response()
  await mutation(request('POST', `/api/admin-auth?__admin_path=aivex/${REFERENCE}/actions`, {
    action: 'start_review', expectedUpdatedAt: registration.updated_at, payload: {},
  }, { host: 'www.infinty-bba.com', origin: 'https://evil.example', 'content-type': 'application/json' }), mutationRes)
  assert.equal(mutationRes.statusCode, 403)
  assert.equal(called, false)

  const failedAction = createAdminAivexHandler({
    createService: () => ({ act: async () => { throw Object.assign(new Error('database failure'), { code: '42702' }) } }),
    requireSession: async () => ({ user: ADMIN }), env: base,
  })
  const failedActionRes = response()
  await failedAction(request('POST', `/api/admin-auth?__admin_path=aivex/${REFERENCE}/actions`, {
    action: 'verify_document', expectedUpdatedAt: registration.updated_at, payload: { documentKey: 'student-1' },
  }, { host: 'www.infinty-bba.com', origin: 'https://www.infinty-bba.com', 'content-type': 'application/json' }), failedActionRes)
  assert.equal(failedActionRes.statusCode, 503)
  assert.equal(failedActionRes.body.message, 'Unable to save this AIVEX action right now.')
})

test('AIVEX handler streams secure bytes with no-store headers', async () => {
  const service = createAdminAivexService({ store: new MemoryAivexStore(), now: () => NOW })
  const handler = createAdminAivexHandler({
    createService: () => service, requireSession: async () => ({ user: ADMIN }),
    env: { ADMIN_AIVEX_API_ENABLED: 'true', NODE_ENV: 'production' },
  })
  const res = response()
  await handler(request('GET', `/api/admin-auth?__admin_path=aivex/${REFERENCE}/documents/student-1/content`), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'image/jpeg')
  assert.match(res.headers['cache-control'], /no-store/)
  assert.match(res.headers['content-disposition'], /^inline;/)
  assert(Buffer.isBuffer(res.rawBody))
})

test('AIVEX admin migration is service-role-only and audits real administrators', async () => {
  const migration = (await read('supabase/migrations/20260927120000_admin_aivex_operations.sql')).toLowerCase()
  for (const table of ['aivex_admin_case_reviews', 'aivex_admin_document_reviews', 'aivex_correction_requests']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`))
  }
  assert.match(migration, /with \(security_invoker = true\)/)
  assert.match(migration, /grant select on table public\.admin_aivex_case_overview to service_role/)
  assert.doesNotMatch(migration, /create\s+policy/)
  assert.doesNotMatch(migration, /signedurl|public url/i)
  assert.match(migration, /p_admin_user_id/)
  assert.match(migration, /insert into public\.admin_audit_events/)
})

test('AIVEX document-action fix removes the PL/pgSQL document_key ambiguity', async () => {
  const migration = (await read('supabase/migrations/20260927130000_fix_admin_aivex_document_actions.sql')).toLowerCase()
  assert.match(migration, /create or replace function public\.admin_apply_aivex_action/)
  assert.match(migration, /v_document_key text/)
  assert.match(migration, /on conflict on constraint aivex_admin_document_reviews_registration_key/)
  assert.doesNotMatch(migration, /\bdocument_key text;/)
  assert.doesNotMatch(migration, /on conflict\s*\(registration_id,\s*document_key\)/)
  assert.match(migration, /revoke all on function public\.admin_apply_aivex_action/)
  assert.match(migration, /grant execute on function public\.admin_apply_aivex_action[\s\S]*to service_role/)
})

test('AIVEX final acceptance approves registration and validates the file atomically', async () => {
  const migration = (await read('supabase/migrations/20260927140000_admin_aivex_final_team_acceptance.sql')).toLowerCase()
  const store = await read('api/_lib/admin-aivex-store.js')
  assert.match(migration, /create or replace function public\.admin_accept_aivex_team/)
  assert.match(migration, /overview\.completeness = 100/)
  assert.match(migration, /overview\.student_cards_verified = true/)
  assert.match(migration, /set registration_status = 'approved',[\s\S]*document_status = 'validated'/)
  assert.match(migration, /insert into public\.admin_audit_events/)
  assert.match(migration, /grant execute on function public\.admin_accept_aivex_team[\s\S]*to service_role/)
  assert.match(store, /action === 'validate_file'/)
  assert.match(store, /admin_accept_aivex_team/)
})

test('AIVEX React workspace uses the protected API and contains no demo document workflow', async () => {
  const page = await read('src/admin/AivexPages.jsx')
  const hook = await read('src/admin/useAdminAivex.js')
  const auth = await read('src/admin/AdminAuth.jsx')
  assert.match(page, /useAdminAivex\(/)
  assert.match(page, /loadDocument/)
  assert.doesNotMatch(page, /state\.teams|Add demo version|JSZip|DEMO ONLY|Fictional upload simulation/)
  assert.match(hook, /\/api\/admin\/aivex/)
  assert.match(auth, /requestRaw/)
  assert.doesNotMatch(`${page}\n${hook}\n${auth}`, /localStorage.*token|sessionStorage.*token|SUPABASE_SECRET_KEY/)
  assert.doesNotMatch(page, /Verification note|Message for the team|name="reason"|name="message"|Each decision requires an internal reason/)
  assert.match(page, /reason: false, description: false/)
  assert.match(page, /Administrative review/)
  assert.match(page, /Document is correct/)
  assert.match(page, /Needs replacement/)
  assert.match(page, /window\.setInterval\(syncVerification, 12000\)/)
  assert.match(page, /Final team decision/)
  assert.match(page, /Accept team/)
  assert.doesNotMatch(page, /'approve_registration'|'start_review'|'reject_registration'|'cancel_registration'/)
  assert.doesNotMatch(page, /CHECKLIST\.map/)
})
