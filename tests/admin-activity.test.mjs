import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { createAdminActivityHandler } from '../api/admin-auth.js'
import { createAdminActivityService } from '../api/_lib/admin-activity.js'
import { createAdminActivityStore } from '../api/_lib/admin-activity-store.js'
import { parseActivityListOptions } from '../api/_lib/admin-activity-validation.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const SUPER_ADMIN = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'super_admin' }

const payload = {
  generatedAt: '2026-10-16T10:00:00.000Z',
  rows: [{
    id: '11111111-1111-4111-8111-111111111111', action: 'verify_document',
    subject: 'Nova · AIVEX2-7K9M2P4R', actor: 'Root Admin', objectType: 'aivex_document',
    sensitivity: 'confidential', createdAt: '2026-10-16T09:30:00.000Z', note: 'Identity checked.',
    objectId: 'private-database-id', metadata: { file_path: 'private/path.pdf', token_hash: 'secret' },
  }],
  pagination: { page: 1, limit: 12, total: 31 },
  summary: { recordedActions: 31, confidentialEvents: 4, administrators: 2 },
  facets: {
    actors: ['Root Admin'], actions: ['verify_document'], objectTypes: ['aivex_document'],
  },
  storagePath: 'private/path.pdf',
}

function request(method = 'GET', query = '') {
  const req = Readable.from([])
  req.method = method
  req.url = `/api/admin-auth?__admin_path=activity${query ? `&${query}` : ''}`
  req.headers = {}
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

test('activity filters are bounded, single-valued and use the database vocabulary', () => {
  const valid = parseActivityListOptions(new URLSearchParams(
    'page=2&limit=12&q=Nova&actor=Root%20Admin&objectType=aivex_document&action=verify_document&sensitivity=confidential&dateFrom=2026-10-01&dateTo=2026-10-16&sort=created_desc',
  ))
  assert.equal(valid.ok, true)
  assert.equal(valid.value.page, 2)
  for (const query of [
    'page=0', 'limit=51', 'objectType=password', 'action=Invalid Action',
    'sensitivity=private', 'dateFrom=2026-02-30', 'dateFrom=2026-10-17&dateTo=2026-10-16',
    'sort=metadata_desc', 'actor=A&actor=B',
  ]) assert.equal(parseActivityListOptions(new URLSearchParams(query)).ok, false, query)
})

test('activity store reads one bounded database projection', async () => {
  const calls = []
  const store = createAdminActivityStore({
    async rpc(name, parameters) {
      calls.push([name, parameters])
      return { data: payload, error: null }
    },
  })
  const options = {
    page: 1, limit: 12, q: 'Nova', actor: '', objectType: 'aivex_document',
    action: '', sensitivity: 'confidential', dateFrom: '', dateTo: '', sort: 'created_desc',
  }
  assert.equal((await store.list(options)).pagination.total, 31)
  assert.deepEqual(calls, [['admin_list_activity_log', {
    p_page: 1, p_limit: 12, p_query: 'Nova', p_actor: null,
    p_object_type: 'aivex_document', p_action: null, p_sensitivity: 'confidential',
    p_date_from: null, p_date_to: null, p_sort: 'created_desc',
  }]])
})

test('activity store falls back to the real audit tables while the projection migration is pending', async () => {
  const tables = {
    admin_audit_events: [{
      id: '11111111-1111-4111-8111-111111111111',
      admin_user_id: SUPER_ADMIN.id,
      object_type: 'join_application',
      object_id: '22222222-2222-4222-8222-222222222222',
      action: 'start_review', sensitivity: 'standard', metadata: {},
      created_at: '2026-10-16T09:30:00.000Z', administrator: { display_name: 'Root Admin' },
    }],
    membership_applications: [{
      id: '22222222-2222-4222-8222-222222222222', full_name: 'Amel Benali', reference: 'JOIN-26-TEST01',
    }],
    aivex_registrations: [], club_members: [], club_staff_profiles: [],
  }
  const client = {
    async rpc() { return { data: null, error: { code: 'PGRST202' } } },
    from(table) {
      const builder = {
        select: () => builder, order: () => builder, limit: () => builder, in: () => builder,
        then: (resolve, reject) => Promise.resolve({ data: tables[table] || [], error: null }).then(resolve, reject),
      }
      return builder
    },
  }
  const result = await createAdminActivityStore(client).list({
    page: 1, limit: 12, q: 'Amel', actor: '', objectType: '', action: '',
    sensitivity: '', dateFrom: '', dateTo: '', sort: 'created_desc',
  })
  assert.equal(result.rows[0].subject, 'Amel Benali · JOIN-26-TEST01')
  assert.equal(result.summary.recordedActions, 1)
  assert.equal(result.rows[0].objectId, undefined)
  assert.equal(result.rows[0].metadata, undefined)
})

test('activity service returns readable live rows without raw metadata or object identifiers', async () => {
  const service = createAdminActivityService({ store: { async list() { return payload } } })
  const result = await service.list({ page: 1, limit: 12 })
  assert.equal(result.data[0].action, 'AIVEX document verified')
  assert.equal(result.data[0].objectType, 'AIVEX document')
  assert.equal(result.data[0].entity, 'Nova · AIVEX2-7K9M2P4R')
  assert.equal(result.pagination.pages, 3)
  assert.deepEqual(result.summary, { recordedActions: 31, confidentialEvents: 4, administrators: 2 })
  assert.deepEqual(result.facets.actions, [{ key: 'verify_document', label: 'AIVEX document verified' }])
  assert.equal(result.data[0].objectId, undefined)
  assert.equal(result.data[0].metadata, undefined)
  assert.equal(result.storagePath, undefined)
  assert.doesNotMatch(JSON.stringify(result), /private\/path|token_hash|private-database-id/)
})

test('activity API is authenticated, super-admin-only, read-only and validates filters', async () => {
  for (const [session, status] of [[null, 401], [{ user: { ...SUPER_ADMIN, role: 'administrator' } }, 403]]) {
    let serviceCreated = false
    const handler = createAdminActivityHandler({
      enabled: () => true,
      requireSession: async () => session,
      createService: () => { serviceCreated = true; return { list: async () => payload } },
    })
    const res = response()
    await handler(request(), res)
    assert.equal(res.statusCode, status)
    assert.equal(serviceCreated, false)
  }

  const handler = createAdminActivityHandler({
    enabled: () => true,
    requireSession: async () => ({ user: SUPER_ADMIN }),
    createService: () => createAdminActivityService({ store: { async list() { return payload } } }),
  })
  const live = response()
  await handler(request('GET', 'page=1&limit=12&sensitivity=confidential'), live)
  assert.equal(live.statusCode, 200)
  assert.equal(live.body.data[0].actor, 'Root Admin')

  const invalid = response()
  await handler(request('GET', 'objectType=password'), invalid)
  assert.equal(invalid.statusCode, 400)

  const mutation = response()
  await handler(request('POST'), mutation)
  assert.equal(mutation.statusCode, 405)
  assert.equal(mutation.headers.allow, 'GET')
})

test('activity migration is bounded, service-role-only and exposes a safe projection', async () => {
  const migration = (await read('supabase/migrations/20261021120000_admin_activity_log_live_data.sql')).toLowerCase()
  assert.match(migration, /create or replace function public\.admin_list_activity_log/)
  assert.match(migration, /set statement_timeout = '5s'/)
  assert.match(migration, /from public\.admin_audit_events/)
  assert.match(migration, /left join public\.membership_applications/)
  assert.match(migration, /left join public\.aivex_registrations/)
  assert.match(migration, /left join public\.club_members/)
  assert.match(migration, /limit \(select page_size from runtime\)/)
  assert.match(migration, /revoke all on function public\.admin_list_activity_log[\s\S]+from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.admin_list_activity_log[\s\S]+to service_role/)
  assert.doesNotMatch(migration, /'objectid'|'metadata', page\.|'filepath'|'tokenhash'/)
})

test('Activity page uses the protected live API and no browser demonstration records', async () => {
  const [page, hook, router] = await Promise.all([
    read('src/admin/AdminUtilityPages.jsx'),
    read('src/admin/useAdminActivity.js'),
    read('api/admin-auth.js'),
  ])
  assert.match(page, /useAdminActivity\(/)
  assert.match(page, /Live audit trail/)
  assert.match(hook, /request\(`\/api\/admin\/activity\?\$\{query\}`/)
  assert.match(router, /path === 'activity'/)
  assert.doesNotMatch(`${page}\n${hook}`, /state\.activities|createDemoState|filterRecords|localStorage|sessionStorage/)
})
