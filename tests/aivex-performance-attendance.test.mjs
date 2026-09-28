import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import test from 'node:test'
import { createAdminAivexService } from '../api/_lib/admin-aivex.js'
import { canManageAivexAttendance } from '../api/_lib/admin-aivex-permissions.js'
import { parseAivexAttendanceEdition, validateAivexAttendanceBody } from '../api/_lib/admin-aivex-validation.js'
import { createMagicLinkVerifyHandler } from '../api/aivex/magic-link/verify.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const REFERENCE = 'AIVEX2-7K9M2P4R'
const UPDATED_AT = '2026-09-28T10:00:00.000Z'
const ADMIN = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'administrator' }
const REVIEWER = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'reviewer' }

const overview = {
  reference: REFERENCE,
  edition: 2,
  form_version: 4,
  team_name: 'Nova Circuit',
  wilaya_code: '34',
  wilaya_name: 'Bordj Bou Arreridj',
  institution_name: 'University of Bordj Bou Arreridj',
  institution_custom: false,
  activity_official_name: 'Activities Manager',
  activity_official_role: 'activities_officer',
  registration_status: 'approved',
  document_status: 'validated',
  submitted_at: UPDATED_AT,
  created_at: UPDATED_AT,
  updated_at: UPDATED_AT,
  team_information_complete: true,
  activity_official_verified: true,
  delegation_head_verified: true,
  driver_verified: true,
  exact_student_count: true,
  student_cards_present: true,
  identity_documents_present: true,
  official_form_generated: true,
  signed_document_received: true,
  signed_document_verified: true,
  student_cards_verified: true,
  completeness: 100,
  attention_rank: 8,
}

test('AIVEX queue and detail reads use one bundled database call', async () => {
  let listCalls = 0
  let detailCalls = 0
  const store = {
    async listPage() {
      listCalls += 1
      return {
        rows: [overview], total: 1,
        summary: { accepted: 1, validated: 1, documentCounts: { validated: 1 } },
        facets: { wilayas: ['34 · Bordj Bou Arreridj'], institutions: ['University of Bordj Bou Arreridj'] },
      }
    },
    async list() { throw new Error('legacy list should not run') },
    async summaryRows() { throw new Error('legacy summary should not run') },
    async detailBundle() {
      detailCalls += 1
      return {
        registration: {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', ...overview,
          activity_official_email: 'activities@example.dz', activity_official_phone: '0550000000',
          delegation_head_name: 'Delegation Leader', delegation_head_phone: '0550000001', delegation_head_rfid: '00000001',
          delegation_head_id_card_path: true, delegation_head_id_card_mime: 'image/jpeg', delegation_head_id_card_size: 100,
          driver_name: 'Driver', driver_phone: '0550000002', driver_rfid: '00000002',
          driver_id_card_path: true, driver_id_card_mime: 'image/jpeg', driver_id_card_size: 100,
          current_form_revision: 1,
        },
        overview,
        students: [1, 2, 3].map((position) => ({
          position, full_name: `Student ${position}`, phone: `055000000${position + 2}`,
          bac_year: 2024, rfid_number: `0000000${position}`, student_card_path: true,
          student_card_mime: 'image/jpeg', student_card_size_bytes: 100, created_at: UPDATED_AT,
        })),
        generatedDocuments: [{ document_type: 'docx', generation_status: 'generated', updated_at: UPDATED_AT }],
        submittedDocuments: [{ version: 1, original_file_name: 'signed.pdf', mime_type: 'application/pdf', size_bytes: 100, uploaded_at: UPDATED_AT }],
        documentReviews: ['delegation-leader', 'driver', 'student-1', 'student-2', 'student-3', 'signed-v1']
          .map((document_key) => ({ document_key, review_status: 'verified', reviewed_at: UPDATED_AT })),
        corrections: [], correctionItems: [], audit: [],
      }
    },
    async findByReference() { throw new Error('legacy registration query should not run') },
  }
  const service = createAdminAivexService({ store })
  const list = await service.list({ edition: 2, page: 1, limit: 12, sort: 'attention_asc' }, ADMIN)
  const detail = await service.detail(REFERENCE, ADMIN)
  assert.equal(listCalls, 1)
  assert.equal(detailCalls, 1)
  assert.equal(list.data[0].ref, REFERENCE)
  assert.equal(detail.ref, REFERENCE)
  assert.equal(detail.docs.length, 7)
})

test('read-amplification migration is service-role-only and throttles Magic Link writes', async () => {
  const migration = (await read('supabase/migrations/20261006120000_reduce_aivex_read_amplification.sql')).toLowerCase()
  assert.match(migration, /create or replace function public\.admin_list_aivex_cases/)
  assert.match(migration, /with edition_rows as materialized/)
  assert.match(migration, /create or replace function public\.admin_get_aivex_detail/)
  assert.match(migration, /create or replace function public\.server_get_aivex_magic_link_status/)
  assert.match(migration, /last_used_at <= p_now - interval '6 hours'/)
  assert.match(migration, /grant execute on function public\.admin_list_aivex_cases[\s\S]+to service_role/)
  assert.match(migration, /grant execute on function public\.admin_get_aivex_detail[\s\S]+to service_role/)
  assert.match(migration, /grant execute on function public\.server_get_aivex_magic_link_status[\s\S]+to service_role/)
  assert.match(migration, /revoke all on function public\.server_get_aivex_magic_link_status[\s\S]+from public, anon, authenticated/)
  assert.doesNotMatch(migration, /raw_token|signed_url|supabase_secret_key/)
})

test('Magic Link status uses the bundled read and never falls through to legacy queries', async () => {
  const token = 'A'.repeat(43)
  let bundleCalls = 0
  const handler = createMagicLinkVerifyHandler({
    now: () => new Date(UPDATED_AT),
    createMagicLinkStore: () => ({
      async loadCandidateStatus(tokenHash) {
        bundleCalls += 1
        assert.match(tokenHash, /^[0-9a-f]{64}$/)
        assert.notEqual(tokenHash, token)
        return {
          status: 'valid',
          registration: {
            reference: REFERENCE, team_name: 'Nova Circuit', institution_name: 'University of Bordj Bou Arreridj',
            wilaya_name: 'Bordj Bou Arreridj', student_count: 3,
            registration_status: 'approved', document_status: 'validated',
          },
          signedDocument: { version: 1, uploadedAt: UPDATED_AT },
          correctionRequest: null,
        }
      },
      async findByTokenHash() { throw new Error('legacy token query should not run') },
      async loadCandidateRegistration() { throw new Error('legacy registration query should not run') },
    }),
    createSignedDocumentStore: () => { throw new Error('legacy document query should not run') },
  })
  const request = Readable.from([Buffer.from(JSON.stringify({ token }))])
  request.method = 'POST'
  request.url = '/api/aivex/magic-link/verify'
  request.headers = { 'content-type': 'application/json' }
  const response = {
    statusCode: 0, headers: {}, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(value) { this.body = JSON.parse(value) },
  }
  await handler(request, response)
  assert.equal(response.statusCode, 200)
  assert.equal(response.body.reference, REFERENCE)
  assert.equal(bundleCalls, 1)
  assert.equal(JSON.stringify(response.body).includes(token), false)
})

test('attendance accepts only bounded editions, references, statuses, and timestamps', () => {
  assert.deepEqual(parseAivexAttendanceEdition(new URLSearchParams('edition=2')), { ok: true, value: 2 })
  assert.equal(parseAivexAttendanceEdition(new URLSearchParams('edition=0')).ok, false)
  assert.equal(parseAivexAttendanceEdition(new URLSearchParams('edition=2&edition=3')).ok, false)
  assert.equal(validateAivexAttendanceBody({ reference: REFERENCE, status: 'present', expectedUpdatedAt: UPDATED_AT }).ok, true)
  assert.equal(validateAivexAttendanceBody({ reference: REFERENCE, status: 'approved', expectedUpdatedAt: UPDATED_AT }).ok, false)
  assert.equal(validateAivexAttendanceBody({ reference: REFERENCE, status: 'present', expectedUpdatedAt: 'now' }).ok, false)
})

test('attendance mutations are administrator-only while reviewers retain read access', async () => {
  let writes = 0
  const store = {
    async attendance() {
      return { teams: [{ reference: REFERENCE, status: 'expected', updatedAt: UPDATED_AT }], summary: { accepted: 1, present: 0, absent: 0, expected: 1 } }
    },
    async setAttendance(input) {
      writes += 1
      return { reference: input.reference, status: input.status, updatedAt: UPDATED_AT }
    },
  }
  const service = createAdminAivexService({ store })
  const reviewerList = await service.attendance(2, REVIEWER)
  assert.equal(reviewerList.canManage, false)
  assert.equal((await service.setAttendance({ reference: REFERENCE, status: 'present', expectedUpdatedAt: UPDATED_AT }, REVIEWER)).status, 403)
  assert.equal(writes, 0)
  assert.equal(canManageAivexAttendance('reviewer'), false)
  assert.equal(canManageAivexAttendance('administrator'), true)
  assert.equal(canManageAivexAttendance('super_admin'), true)
  assert.equal((await service.setAttendance({ reference: REFERENCE, status: 'present', expectedUpdatedAt: UPDATED_AT }, ADMIN)).ok, true)
  assert.equal(writes, 1)
})

test('attendance state is separate, final-team-only, optimistic, and audited', async () => {
  const migration = (await read('supabase/migrations/20261006130000_aivex_team_attendance.sql')).toLowerCase()
  assert.match(migration, /create table if not exists public\.aivex_team_attendance/)
  assert.match(migration, /registration_status = 'approved'/)
  assert.match(migration, /document_status = 'validated'/)
  assert.match(migration, /v_role is null or v_role not in \('super_admin', 'administrator'\)/)
  assert.match(migration, /v_current_updated_at is distinct from p_expected_updated_at/)
  assert.match(migration, /aivex_attendance_conflict/)
  assert.match(migration, /aivex_team_arrival_confirmed/)
  assert.match(migration, /aivex_team_marked_absent/)
  assert.match(migration, /aivex_team_attendance_reset/)
  assert.match(migration, /alter table public\.aivex_team_attendance enable row level security/)
  assert.match(migration, /revoke all on table public\.aivex_team_attendance from public, anon, authenticated/)
  assert.doesNotMatch(migration, /update public\.aivex_registrations[\s\S]+set registration_status/)
})

test('the participation workspace has quick statistics and no background polling', async () => {
  const [page, hook] = await Promise.all([
    read('src/admin/AivexPages.jsx'),
    read('src/admin/useAdminAivex.js'),
  ])
  assert.match(page, /Accepted-team participation/)
  assert.match(page, /Accepted teams/)
  assert.match(page, /Teams present/)
  assert.match(page, /Teams absent/)
  assert.match(page, /Confirm presence/)
  assert.match(page, /Mark absent/)
  assert.match(page, /Attendance is read-only for reviewer accounts/)
  assert.match(hook, /\/api\/admin\/aivex\/attendance/)
  assert.match(page, /enabled: workspace === 'files'/)
  assert.match(hook, /loadedRequestKey\.current === requestKey/)
  assert.doesNotMatch(`${page}\n${hook}`, /setInterval\([^)]*attendance/i)
})
