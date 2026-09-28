import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import test from 'node:test'
import { createAdminAivexService } from '../api/_lib/admin-aivex.js'
import { canPurgeAllAivex } from '../api/_lib/admin-aivex-permissions.js'
import { AIVEX_PRIVATE_BUCKETS } from '../api/_lib/admin-aivex-store.js'
import { validateAivexPurgeBody } from '../api/_lib/admin-aivex-validation.js'
import { createAdminAivexHandler } from '../api/admin-auth.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const NOW = new Date('2026-09-28T12:00:00.000Z')
const SUPER_ADMIN = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', username: 'root.admin', displayName: 'Root Admin', role: 'super_admin' }
const ADMINISTRATOR = { ...SUPER_ADMIN, role: 'administrator' }
const PASSWORD = 'Current password 2026!'

class PurgeStore {
  constructor({ storageOk = true } = {}) {
    this.storageOk = storageOk
    this.calls = []
  }
  async purgeAll(input) {
    this.calls.push(['database', input])
    return { operation_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', deleted_registrations: 7, deleted_upload_sessions: 3 }
  }
  async emptyPrivateBuckets() {
    this.calls.push(['storage'])
    return { ok: this.storageOk, failedCount: this.storageOk ? 0 : 1 }
  }
  async auditPurgeStorage(input) { this.calls.push(['audit', input]) }
}

function request(method, url, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  req.headers = headers
  req.socket = { remoteAddress: '192.0.2.50' }
  return req
}

function response() {
  return {
    statusCode: 0, headers: {}, body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(value) { this.body = value ? JSON.parse(value) : null },
  }
}

const mutationHeaders = {
  host: 'www.infinty-bba.com',
  origin: 'https://www.infinty-bba.com',
  'content-type': 'application/json',
  cookie: 'infinity_admin_session=test-session-token',
}

test('purge confirmation is bounded and requires the explicit destructive intent marker', () => {
  assert.equal(validateAivexPurgeBody({ password: PASSWORD, confirmation: 'delete_all_aivex_files' }).ok, true)
  assert.equal(validateAivexPurgeBody({ password: PASSWORD, confirmation: 'delete_one' }).ok, false)
  assert.equal(validateAivexPurgeBody({ password: '', confirmation: 'delete_all_aivex_files' }).ok, false)
  assert.equal(validateAivexPurgeBody({ password: 'x'.repeat(129), confirmation: 'delete_all_aivex_files' }).ok, false)
})

test('only a super administrator can purge AIVEX data and all private buckets are in scope', async () => {
  assert.equal(canPurgeAllAivex('super_admin'), true)
  assert.equal(canPurgeAllAivex('administrator'), false)
  assert.equal(canPurgeAllAivex('reviewer'), false)
  assert.deepEqual([...AIVEX_PRIVATE_BUCKETS].sort(), [
    'aivex-generated-forms', 'aivex-id-cards', 'aivex-signed-forms', 'aivex-student-cards',
  ])

  const deniedStore = new PurgeStore()
  const denied = await createAdminAivexService({ store: deniedStore, now: () => NOW }).purgeAll(ADMINISTRATOR)
  assert.equal(denied.status, 403)
  assert.equal(deniedStore.calls.length, 0)

  const store = new PurgeStore()
  const result = await createAdminAivexService({ store, now: () => NOW }).purgeAll(SUPER_ADMIN)
  assert.deepEqual(result, { ok: true, deletedRegistrations: 7, deletedUploadSessions: 3 })
  assert.deepEqual(store.calls.map(([stage]) => stage), ['database', 'storage', 'audit'])
  assert.doesNotMatch(JSON.stringify(result), /bucket|path|password|token/i)
})

test('storage cleanup failure is controlled and can be retried without exposing object paths', async () => {
  const store = new PurgeStore({ storageOk: false })
  const result = await createAdminAivexService({ store, now: () => NOW }).purgeAll(SUPER_ADMIN)
  assert.equal(result.ok, false)
  assert.equal(result.status, 502)
  assert.equal(result.code, 'aivex_storage_cleanup_incomplete')
  assert.doesNotMatch(JSON.stringify(result), /aivex-(student|id|signed|generated)|path/i)
  assert.equal(store.calls.find(([stage]) => stage === 'audit')[1].completed, false)
})

test('purge endpoint requires trusted origin, super-admin session, and correct current password', async () => {
  const env = { ADMIN_AIVEX_API_ENABLED: 'true', NODE_ENV: 'production', ADMIN_SESSION_COOKIE_NAME: 'infinity_admin_session' }
  let purges = 0
  let confirmations = 0
  const service = { purgeAll: async () => { purges += 1; return { ok: true, deletedRegistrations: 4 } } }
  const auth = { confirmPassword: async ({ password, requiredRole }) => {
    confirmations += 1
    assert.equal(requiredRole, 'super_admin')
    return password === PASSWORD ? { ok: true } : { ok: false, status: 400, message: 'The current password is incorrect.' }
  } }

  const administratorHandler = createAdminAivexHandler({
    createService: () => service, createAuthService: () => auth,
    requireSession: async () => ({ user: ADMINISTRATOR }), env,
  })
  const administratorRes = response()
  await administratorHandler(request('POST', '/api/admin-auth?__admin_path=aivex/purge', {
    password: PASSWORD, confirmation: 'delete_all_aivex_files',
  }, mutationHeaders), administratorRes)
  assert.equal(administratorRes.statusCode, 403)
  assert.equal(confirmations, 0)
  assert.equal(purges, 0)

  const handler = createAdminAivexHandler({
    createService: () => service, createAuthService: () => auth,
    requireSession: async () => ({ user: SUPER_ADMIN }), env,
  })
  const rejectedRes = response()
  await handler(request('POST', '/api/admin-auth?__admin_path=aivex/purge', {
    password: 'Wrong password', confirmation: 'delete_all_aivex_files',
  }, mutationHeaders), rejectedRes)
  assert.equal(rejectedRes.statusCode, 400)
  assert.equal(purges, 0)

  const hostileRes = response()
  await handler(request('POST', '/api/admin-auth?__admin_path=aivex/purge', {
    password: PASSWORD, confirmation: 'delete_all_aivex_files',
  }, { ...mutationHeaders, origin: 'https://evil.example' }), hostileRes)
  assert.equal(hostileRes.statusCode, 403)
  assert.equal(purges, 0)

  const acceptedRes = response()
  await handler(request('POST', '/api/admin-auth?__admin_path=aivex/purge', {
    password: PASSWORD, confirmation: 'delete_all_aivex_files',
  }, mutationHeaders), acceptedRes)
  assert.equal(acceptedRes.statusCode, 200)
  assert.deepEqual(acceptedRes.body, { success: true, deletedRegistrations: 4 })
  assert.equal(purges, 1)
})

test('forward migration keeps purge service-role-only, transactional and audited', async () => {
  const migration = (await read('supabase/migrations/20261003120000_admin_aivex_purge_all.sql')).toLowerCase()
  assert.match(migration, /create or replace function public\.admin_purge_all_aivex_data/)
  assert.match(migration, /v_role is distinct from 'super_admin'/)
  assert.match(migration, /delete from public\.aivex_upload_sessions/)
  assert.match(migration, /delete from public\.aivex_members/)
  assert.match(migration, /delete from public\.aivex_registrations/)
  assert.match(migration, /insert into public\.admin_audit_events/)
  assert.match(migration, /revoke all on function public\.admin_purge_all_aivex_data[\s\S]+from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.admin_purge_all_aivex_data[\s\S]+to service_role/)
  assert.doesNotMatch(migration, /storage\.objects|p_password|password_hash|token_hash|file_path/)
})

test('purge repair migration owns one explicit, bounded deletion graph', async () => {
  const migration = (await read('supabase/migrations/20261004120000_fix_admin_aivex_purge_execution.sql')).toLowerCase()
  assert.match(migration, /create or replace function public\.admin_purge_all_aivex_data/)
  assert.match(migration, /security definer/)
  assert.match(migration, /set lock_timeout = '5s'/)
  assert.match(migration, /v_role is distinct from 'super_admin'/)
  assert.match(migration, /lock table[\s\S]+in access exclusive mode/)
  for (const table of [
    'aivex_correction_items', 'aivex_correction_requests', 'aivex_admin_document_reviews',
    'aivex_admin_case_reviews', 'aivex_magic_links', 'aivex_submitted_documents',
    'aivex_generated_documents', 'aivex_students', 'aivex_members',
    'aivex_upload_sessions', 'aivex_registrations',
  ]) {
    assert.match(migration, new RegExp(`delete from public\\.${table}`))
  }
  assert.match(migration, /insert into public\.admin_audit_events/)
  assert.match(migration, /revoke all on function public\.admin_purge_all_aivex_data[\s\S]+from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.admin_purge_all_aivex_data[\s\S]+to service_role/)
  assert.doesNotMatch(migration, /storage\.objects|p_password|password_hash|token_hash|file_path/)
})

test('purge lock repair blocks competing writes without blocking admin reads', async () => {
  const migration = (await read('supabase/migrations/20261005120000_reduce_aivex_purge_lock_contention.sql')).toLowerCase()
  assert.match(migration, /create or replace function public\.admin_purge_all_aivex_data/)
  assert.match(migration, /security definer/)
  assert.match(migration, /set lock_timeout = '5s'/)
  assert.match(migration, /set statement_timeout = '15s'/)
  assert.match(migration, /lock table[\s\S]+in share row exclusive mode/)
  assert.doesNotMatch(migration, /in access exclusive mode/)
  assert.match(migration, /v_role is distinct from 'super_admin'/)
  assert.match(migration, /revoke all on function public\.admin_purge_all_aivex_data[\s\S]+from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.admin_purge_all_aivex_data[\s\S]+to service_role/)
})

test('purge lock or statement contention fails fast with a controlled retry response', async () => {
  const env = { ADMIN_AIVEX_API_ENABLED: 'true', NODE_ENV: 'production', ADMIN_SESSION_COOKIE_NAME: 'infinity_admin_session' }
  for (const code of ['55P03', '57014']) {
    const handler = createAdminAivexHandler({
      createService: () => ({ purgeAll: async () => { throw Object.assign(new Error('database busy'), { code }) } }),
      createAuthService: () => ({ confirmPassword: async () => ({ ok: true }) }),
      requireSession: async () => ({ user: SUPER_ADMIN }),
      env,
    })
    const res = response()
    await handler(request('POST', '/api/admin-auth?__admin_path=aivex/purge', {
      password: PASSWORD, confirmation: 'delete_all_aivex_files',
    }, mutationHeaders), res)
    assert.equal(res.statusCode, 409)
    assert.deepEqual(res.body, {
      success: false,
      code: 'aivex_purge_busy',
      message: 'An AIVEX operation is still being saved. Wait a moment and try again.',
    })
  }
})

test('purge control is password-confirmed, super-admin-only in UI, and never persists the password', async () => {
  const [page, hook] = await Promise.all([
    read('src/admin/AivexPages.jsx'),
    read('src/admin/useAdminAivex.js'),
  ])
  assert.match(page, /user\?\.role === 'super_admin'/)
  assert.match(page, /autoComplete="current-password"/)
  assert.match(page, /This action cannot be undone/)
  assert.match(page, /purgeAcknowledged/)
  assert.match(page, /addEventListener\('focus', syncVerification\)/)
  assert.doesNotMatch(page, /setInterval\(syncVerification/)
  assert.match(hook, /\/api\/admin\/aivex\/purge/)
  assert.doesNotMatch(`${page}\n${hook}`, /localStorage|sessionStorage|document\.cookie/)
})
