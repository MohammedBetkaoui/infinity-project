import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { createAdminApplicationsHandler } from '../api/admin-auth.js'
import { createAdminApplicationsService } from '../api/_lib/admin-applications.js'
import { allowedApplicationActions, canManageApplication } from '../api/_lib/admin-applications-permissions.js'
import {
  parseApplicationListOptions, validateApplicationActionBody, validateApplicationBulkBody,
} from '../api/_lib/admin-applications-validation.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const APP_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = '2026-09-26T09:00:00.000Z'

const row = (changes = {}) => ({
  id: APP_ID,
  reference: 'JOIN-26-A1B2C3',
  full_name: 'Amel Benali',
  email: 'amel@example.dz',
  phone: '+213 555 00 00 00',
  study_year: 'L3',
  department: 'Computer science',
  join_type: 'member',
  staff_department: null,
  primary_field: 'AI Engineering',
  experience: 'building',
  availability: 'weekly',
  consent: true,
  source: '/join',
  form_version: 2,
  status: 'new',
  decision_reason: null,
  requested_information: null,
  accepted_as: null,
  assigned_staff_department: null,
  submitted_at: '2026-09-25T08:30:00.000Z',
  created_at: '2026-09-25T08:30:00.000Z',
  updated_at: '2026-09-25T08:30:00.000Z',
  reviewed_at: null,
  ...changes,
})

class MemoryApplicationStore {
  constructor() {
    this.record = row()
    this.calls = []
  }

  async list(options) { this.calls.push(['list', options]); return { rows: [this.record], count: 1 } }
  async statusCounts() { return { new: 1, in_review: 0, interview: 0, accepted: 0, declined: 0, archived: 0 } }
  async specialities() { return ['Computer science'] }
  async find(id) { return id === APP_ID ? this.record : null }
  async notes() { return [] }
  async interviews() { return [] }
  async audit() { return [] }
  async applyAction(input) {
    this.calls.push(['action', input])
    this.record = { ...this.record, status: input.action === 'accept_member' ? 'accepted' : 'in_review', updated_at: NOW }
    return NOW
  }
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
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(value) { this.body = value ? JSON.parse(value) : null },
  }
}

const administrator = { id: ADMIN_ID, username: 'ali_admin', displayName: 'Ali Admin', role: 'administrator' }
const sameOrigin = { host: 'www.infinty-bba.com', origin: 'https://www.infinty-bba.com', 'content-type': 'application/json' }

test('Join list validation accepts bounded server filters and rejects ambiguous or excessive input', () => {
  const valid = parseApplicationListOptions(new URLSearchParams('page=2&limit=25&status=new&type=member&studyYear=L3&sort=name_asc'))
  assert.equal(valid.ok, true)
  assert.deepEqual(
    { page: valid.value.page, limit: valid.value.limit, status: valid.value.status, sort: valid.value.sort },
    { page: 2, limit: 25, status: 'new', sort: 'name_asc' },
  )
  for (const query of ['page=0', 'limit=51', 'status=pending', 'type=owner', 'sort=password_desc', 'status=new&status=accepted']) {
    assert.equal(parseApplicationListOptions(new URLSearchParams(query)).ok, false, query)
  }
})

test('Join mutation validation requires optimistic concurrency and bounds bulk operations', () => {
  assert.equal(validateApplicationActionBody({ action: 'start_review', expectedUpdatedAt: NOW, reason: 'Initial review', payload: {} }).ok, true)
  assert.equal(validateApplicationActionBody({ action: 'start_review', reason: 'Missing version' }).ok, false)
  assert.equal(validateApplicationBulkBody({
    action: 'archive', reason: 'Campaign closed', records: [{ id: APP_ID, expectedUpdatedAt: NOW }],
  }).ok, true)
  assert.equal(validateApplicationBulkBody({ action: 'accept_member', reason: 'Unsafe bulk', records: [{ id: APP_ID, expectedUpdatedAt: NOW }] }).ok, false)
  assert.equal(validateApplicationBulkBody({ action: 'archive', reason: '', records: [{ id: APP_ID, expectedUpdatedAt: NOW }] }).ok, true)
})

test('reviewers can review but cannot decide; administrator actions use the authenticated actor', async () => {
  assert.equal(canManageApplication('reviewer', 'start_review'), true)
  assert.equal(canManageApplication('reviewer', 'accept_member'), false)
  assert(!allowedApplicationActions('reviewer', row()).includes('decline'))

  const store = new MemoryApplicationStore()
  const service = createAdminApplicationsService({ store, now: () => new Date(NOW) })
  const refused = await service.act(APP_ID, {
    action: 'accept_member', expectedUpdatedAt: store.record.updated_at, reason: 'Accepted', payload: {},
  }, { ...administrator, role: 'reviewer' })
  assert.deepEqual({ ok: refused.ok, status: refused.status }, { ok: false, status: 403 })
  assert.equal(store.calls.length, 0)

  const accepted = await service.act(APP_ID, {
    action: 'accept_member', expectedUpdatedAt: store.record.updated_at, reason: 'Profile approved', payload: {},
  }, administrator)
  assert.equal(accepted.ok, true)
  const call = store.calls.find(([kind]) => kind === 'action')[1]
  assert.equal(call.adminUserId, ADMIN_ID)
  assert.equal(call.action, 'accept_member')
  assert.equal(call.expectedUpdatedAt, '2026-09-25T08:30:00.000Z')

  store.record = row()
  store.calls = []
  await service.act(APP_ID, {
    action: 'start_review', expectedUpdatedAt: store.record.updated_at, reason: '', payload: {},
  }, administrator)
  assert.equal(store.calls.find(([kind]) => kind === 'action')[1].reason, 'Application moved to review')

  store.record = row()
  store.calls = []
  await service.act(APP_ID, {
    action: 'request_information', expectedUpdatedAt: store.record.updated_at, reason: '', payload: {},
  }, administrator)
  assert.equal(
    store.calls.find(([kind]) => kind === 'action')[1].payload.message,
    'Please review your application details. Infinity Club administration will contact you if further information is needed.',
  )
})

test('applications API fails closed without session and never calls the data service', async () => {
  let called = false
  const handler = createAdminApplicationsHandler({
    enabled: () => true,
    requireSession: async () => null,
    createService: () => { called = true; return {} },
  })
  const res = response()
  await handler(request('GET', '/api/admin-auth?__admin_path=applications'), res)
  assert.equal(res.statusCode, 401)
  assert.equal(called, false)
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('applications API returns authenticated paginated records and no database-only fields', async () => {
  const store = new MemoryApplicationStore()
  const service = createAdminApplicationsService({ store, now: () => new Date(NOW) })
  const handler = createAdminApplicationsHandler({
    enabled: () => true,
    requireSession: async () => ({ user: administrator, sessionId: 'session-id' }),
    createService: () => service,
  })
  const res = response()
  await handler(request('GET', '/api/admin-auth?__admin_path=applications&page=1&limit=12&status=new'), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.length, 1)
  assert.equal(res.body.data[0].name, 'Amel Benali')
  assert.equal(res.body.data[0].ref, 'JOIN-26-A1B2C3')
  assert.equal(res.body.data[0].password_hash, undefined)
  assert.equal(res.body.data[0].reviewed_by_admin_user_id, undefined)
  assert.deepEqual(res.body.pagination, { page: 1, limit: 12, total: 1, pages: 1 })
})

test('cross-origin Join mutations are rejected before parsing or writing', async () => {
  let called = false
  const handler = createAdminApplicationsHandler({
    enabled: () => true,
    requireSession: async () => ({ user: administrator, sessionId: 'session-id' }),
    trustedOrigin: () => false,
    createService: () => ({ act: async () => { called = true } }),
  })
  const res = response()
  await handler(request('POST', `/api/admin-auth?__admin_path=applications/${APP_ID}/actions`, {
    action: 'start_review', expectedUpdatedAt: NOW, reason: 'Review', payload: {},
  }, { ...sameOrigin, origin: 'https://evil.example' }), res)
  assert.equal(res.statusCode, 403)
  assert.equal(called, false)
})

test('authenticated mutation passes only the session identity to the workflow service', async () => {
  let received
  const handler = createAdminApplicationsHandler({
    enabled: () => true,
    requireSession: async () => ({ user: administrator, sessionId: 'session-id' }),
    trustedOrigin: () => true,
    createService: () => ({
      act: async (id, input, user) => {
        received = { id, input, user }
        return { ok: true, application: { id, status: 'In review' } }
      },
    }),
  })
  const res = response()
  await handler(request('POST', `/api/admin-auth?__admin_path=applications/${APP_ID}/actions`, {
    action: 'start_review', expectedUpdatedAt: NOW, reason: 'Initial assessment', payload: {},
    adminUserId: 'client-forged-id',
  }, sameOrigin), res)
  assert.equal(res.statusCode, 200)
  assert.equal(received.user.id, ADMIN_ID)
  assert.equal(received.input.adminUserId, undefined)
})

test('Join workflow migration is service-role only, audited, and contains no credential', async () => {
  const migration = (await read('supabase/migrations/20260926120000_admin_join_applications.sql')).toLowerCase()
  for (const table of ['membership_applications', 'membership_application_notes', 'membership_interviews', 'admin_audit_events']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`))
  }
  assert.match(migration, /admin_apply_membership_application_action/)
  assert.match(migration, /grant execute on function public\.admin_apply_membership_application_action[\s\S]+to service_role/)
  assert.doesNotMatch(migration, /insert\s+into\s+public\.admin_users/)
  assert.doesNotMatch(migration, /password_hash|session token|raw token/)
})

test('the real Applications page does not persist Join records in browser storage', async () => {
  const source = `${await read('src/admin/ApplicationsPage.jsx')}\n${await read('src/admin/useAdminApplications.js')}`
  assert.match(source, /\/api\/admin\/applications/)
  assert.doesNotMatch(source, /localStorage|sessionStorage|SUPABASE_SECRET_KEY|createClient\(/)
  assert.doesNotMatch(source, /Internal reason|Message to the candidate|requestMessage|values\.reason/)
  assert.match(source, /reason:\s*false/)
  assert.match(await read('src/admin/AdminApp.jsx'), /<ApplicationsPage/)
})
