import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { createAdminPeopleHandler } from '../api/admin-auth.js'
import { createAdminPeopleService } from '../api/_lib/admin-people.js'
import { canAccessPeople, canManagePeople } from '../api/_lib/admin-people-permissions.js'
import { parsePeopleListOptions, validatePeopleActionBody, validatePeopleBulkBody, validatePeopleCreateBody } from '../api/_lib/admin-people-validation.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const PROFILE_ID = '11111111-1111-4111-8111-111111111111'
const MEMBER_ID = '22222222-2222-4222-8222-222222222222'
const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = '2026-09-29T09:00:00.000Z'
const user = { id: ADMIN_ID, username: 'root_admin', displayName: 'Root Admin', role: 'super_admin' }

const directoryRow = (changes = {}) => ({
  kind: 'members', profile_id: PROFILE_ID, member_id: PROFILE_ID, source_application_id: null,
  full_name: 'Amel Benali', email: 'amel@example.dz', phone: '0555000000', study_year: 'L3',
  speciality: 'Computer science', availability: 'weekly', structure: 'AI Engineering',
  requested_department: null, internal_role: null, cohort: '2026/27', status: 'active',
  joined_at: '2026-09-20', last_activity_at: null, activity_count: 0, has_staff_profile: false,
  created_at: '2026-09-20T08:00:00.000Z', updated_at: '2026-09-20T08:00:00.000Z', ...changes,
})

class MemoryPeopleStore {
  constructor(row = directoryRow()) { this.record = row; this.calls = [] }
  async list() { return { rows: [this.record], count: 1 } }
  async statusCounts() { return { active: 1, on_pause: 0, inactive: 0, alumni: 0, archived: 0 } }
  async facets() { return { specialities: ['Computer science'], structures: ['AI Engineering'] } }
  async find(kind, id) { return this.record.kind === kind && this.record.profile_id === id ? this.record : null }
  async notes() { return [] }
  async activities() { return [] }
  async audit() { return [] }
  async createProfile(input) { this.calls.push(['create', input]); return this.record.profile_id }
  async applyAction(input) { this.calls.push(['action', input]); this.record = { ...this.record, status: input.payload.status || this.record.status, updated_at: NOW }; return NOW }
}

function request(method, url, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method; req.url = url; req.headers = headers
  return req
}
function response() {
  return { statusCode: 0, headers: {}, body: null, setHeader(name, value) { this.headers[name.toLowerCase()] = value }, end(value) { this.body = value ? JSON.parse(value) : null } }
}

test('people directory validates bounded filters, creates and optimistic mutations', () => {
  assert.equal(parsePeopleListOptions(new URLSearchParams('page=2&limit=12&status=active&studyYear=L3&sort=name_asc'), 'members').ok, true)
  for (const query of ['page=0', 'limit=51', 'status=new', 'sort=password_desc', 'dateFrom=2026-02-30', 'status=active&status=archived']) {
    assert.equal(parsePeopleListOptions(new URLSearchParams(query), 'members').ok, false, query)
  }
  assert.equal(validatePeopleCreateBody({ fullName: 'Amel Benali', email: 'amel@example.dz', phone: '0555000000', studyYear: 'L3', speciality: 'Computer science', availability: 'weekly', pole: 'AI Engineering' }, 'members').ok, true)
  assert.equal(validatePeopleCreateBody({ fullName: 'Amel Benali', email: 'not-an-email', studyYear: 'L3', speciality: 'CS', availability: 'weekly', pole: 'AI' }, 'members').ok, false)
  assert.equal(validatePeopleCreateBody({ fullName: 'Amel Benali', email: 'amel@example.dz', studyYear: 'L3', speciality: 'Computer science', availability: 'weekly', pole: 'AI Engineering', joinedAt: '2026-02-30' }, 'members').ok, false)
  assert.equal(validatePeopleActionBody({ action: 'set_status', expectedUpdatedAt: NOW, reason: 'Semester pause', payload: { status: 'on_pause' } }, 'members').ok, true)
  assert.equal(validatePeopleActionBody({ action: 'set_status', payload: { status: 'active' } }, 'members').ok, false)
  assert.equal(validatePeopleActionBody({ action: 'move_department', expectedUpdatedAt: NOW, payload: { department: 'dev-tech' } }, 'staff').ok, true)
  assert.equal(validatePeopleBulkBody({ action: 'set_status', payload: { status: 'archived' }, records: [{ id: PROFILE_ID, expectedUpdatedAt: NOW }] }, 'members').ok, true)
})

test('people directory permissions fail closed outside super administrators', () => {
  assert.equal(canAccessPeople('super_admin'), true)
  assert.equal(canAccessPeople('administrator'), false)
  assert.equal(canManagePeople('reviewer', 'members', 'set_status'), false)
  assert.equal(canManagePeople('super_admin', 'staff', 'move_department'), true)
  assert.equal(canManagePeople('super_admin', 'staff', 'delete_profile'), false)
})

test('people service maps safe directory records and always uses the authenticated actor', async () => {
  const store = new MemoryPeopleStore()
  const service = createAdminPeopleService({ store, now: () => new Date(NOW) })
  const listed = await service.list('members', { page: 1, limit: 12 }, user)
  assert.equal(listed.data[0].name, 'Amel Benali')
  assert.equal(listed.data[0].updated_by_admin_user_id, undefined)
  const result = await service.act('members', PROFILE_ID, { action: 'set_status', expectedUpdatedAt: store.record.updated_at, reason: 'Pause', payload: { status: 'on_pause' } }, user)
  assert.equal(result.ok, true)
  const call = store.calls.find(([type]) => type === 'action')[1]
  assert.equal(call.adminUserId, ADMIN_ID)
  assert.equal(call.profileId, PROFILE_ID)
})

test('people API requires a session and rejects lower roles before opening the store', async () => {
  for (const session of [null, { user: { ...user, role: 'administrator' } }]) {
    let called = false
    const handler = createAdminPeopleHandler({ enabled: () => true, requireSession: async () => session, createService: () => { called = true; return {} } })
    const res = response()
    await handler(request('GET', '/api/admin-auth?__admin_path=members'), res)
    assert.equal(res.statusCode, session ? 403 : 401)
    assert.equal(called, false)
  }
})

test('people API returns pagination and guards mutations by strict origin', async () => {
  const store = new MemoryPeopleStore()
  const service = createAdminPeopleService({ store, now: () => new Date(NOW) })
  const handler = createAdminPeopleHandler({ enabled: () => true, requireSession: async () => ({ user }), trustedOrigin: () => false, createService: () => service })
  const listResponse = response()
  await handler(request('GET', '/api/admin-auth?__admin_path=members&page=1&limit=12'), listResponse)
  assert.equal(listResponse.statusCode, 200)
  assert.deepEqual(listResponse.body.pagination, { page: 1, limit: 12, total: 1, pages: 1 })
  const mutationResponse = response()
  await handler(request('POST', `/api/admin-auth?__admin_path=members/${PROFILE_ID}/actions`, { action: 'set_status', expectedUpdatedAt: NOW, payload: { status: 'inactive' } }, { 'content-type': 'application/json' }), mutationResponse)
  assert.equal(mutationResponse.statusCode, 403)
  assert.equal(store.calls.length, 0)
})

test('staff detail retains its member link without exposing database actor fields', async () => {
  const store = new MemoryPeopleStore(directoryRow({ kind: 'staff', member_id: MEMBER_ID, structure: 'dev-tech', requested_department: 'design-content', internal_role: 'Technical lead', has_staff_profile: true }))
  const service = createAdminPeopleService({ store })
  const profile = await service.detail('staff', PROFILE_ID, user)
  assert.equal(profile.memberId, MEMBER_ID)
  assert.equal(profile.department, 'Dev / Tech')
  assert.equal(profile.requested, 'Design / Content Creation')
  assert.equal(profile.created_by_admin_user_id, undefined)
})

test('people migration is private, audited and synchronizes accepted applications', async () => {
  const migration = (await read('supabase/migrations/20260929120000_admin_members_staff_directory.sql')).toLowerCase()
  for (const table of ['club_members', 'club_staff_profiles', 'club_staff_project_assignments', 'club_member_event_participation', 'club_member_notes']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
  }
  assert.match(migration, /create trigger club_sync_accepted_application/)
  assert.match(migration, /new\.status <> 'accepted'/)
  assert.match(migration, /on conflict \(source_application_id\) do update/)
  assert.match(migration, /revoke all on function public\.admin_apply_club_profile_action[\s\S]+from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.admin_apply_club_profile_action[\s\S]+to service_role/)
  assert.doesNotMatch(migration, /club_sync_accepted_application_row|password_hash|insert\s+into\s+public\.admin_users/)
})

test('Members and Staff pages use the protected API instead of browser demo records', async () => {
  const app = await read('src/admin/AdminApp.jsx')
  const page = await read('src/admin/DirectoryPage.jsx')
  const hook = await read('src/admin/useAdminPeople.js')
  assert.match(app, /<DirectoryPage[^>]+kind="members"/)
  assert.match(app, /<DirectoryPage[^>]+kind="staff"/)
  assert.match(hook, /\/api\/admin\/\$\{kind\}/)
  assert.doesNotMatch(`${page}\n${hook}`, /localStorage|sessionStorage|state\[kind\]|state\.members|state\.staff|createClient\(/)
  assert.match(page, /Promote member to staff/)
  assert.match(page, /Assign internal role/)
})
