import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import {
  ADMIN_PREFERENCE_DEFAULTS,
  createAdminPreferencesService,
  createAdminPreferencesStore,
  validateAdminPreferencesBody,
} from '../api/_lib/admin-preferences.js'
import { createAdminPreferencesHandler, createAdminRouter } from '../api/admin-auth.js'
import { reviewQueueItems } from '../src/admin/adminPreferencesModel.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const OTHER_ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ADMIN = { id: ADMIN_ID, role: 'reviewer', username: 'reviewer' }
const VALID = Object.freeze({
  tableDensity: 'comfortable',
  reviewNotificationsEnabled: true,
  viewerTimeoutSeconds: 120,
  reducedMotion: false,
})

function request(method, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = '/api/admin-auth?__admin_path=settings/preferences'
  req.headers = headers
  req.socket = { remoteAddress: '127.0.0.70' }
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

test('preferences validation is exact and enforces every allowed value', () => {
  assert.deepEqual(ADMIN_PREFERENCE_DEFAULTS, VALID)
  assert.deepEqual(validateAdminPreferencesBody(VALID), { ok: true, value: VALID })
  for (const input of [
    { ...VALID, tableDensity: 'dense' },
    { ...VALID, reviewNotificationsEnabled: 'true' },
    { ...VALID, viewerTimeoutSeconds: 90 },
    { ...VALID, reducedMotion: 1 },
    { ...VALID, adminUserId: OTHER_ADMIN_ID },
    { tableDensity: 'compact' },
  ]) assert.equal(validateAdminPreferencesBody(input).ok, false)
})

test('unauthenticated preference GET and POST fail closed', async () => {
  const handler = createAdminPreferencesHandler({
    enabled: () => true,
    requireSession: async () => null,
    createService: () => { throw new Error('must not create service') },
  })
  for (const [method, body, headers] of [
    ['GET', undefined, {}],
    ['POST', VALID, { 'content-type': 'application/json' }],
  ]) {
    const res = response()
    await handler(request(method, body, headers), res)
    assert.equal(res.statusCode, 401)
  }
})

test('an authenticated administrator gets only their own no-store preferences', async () => {
  let requestedUser
  const handler = createAdminPreferencesHandler({
    enabled: () => true,
    requireSession: async () => ({ user: ADMIN, sessionId: 'session' }),
    createService: () => ({
      get: async (user) => { requestedUser = user; return { ok: true, preferences: VALID } },
    }),
  })
  const res = response()
  await handler(request('GET'), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.deepEqual(res.body, { success: true, preferences: VALID })
  assert.equal(requestedUser.id, ADMIN_ID)
})

test('an authenticated administrator updates only the session-owned record', async () => {
  const changed = { ...VALID, tableDensity: 'compact', reviewNotificationsEnabled: false, viewerTimeoutSeconds: 300, reducedMotion: true }
  let mutation
  const handler = createAdminPreferencesHandler({
    enabled: () => true,
    trustedOrigin: () => true,
    requireSession: async () => ({ user: ADMIN, sessionId: 'session' }),
    createService: () => ({
      update: async (input, user) => { mutation = { input, user }; return { ok: true, preferences: input } },
    }),
  })
  const res = response()
  await handler(request('POST', changed, { 'content-type': 'application/json; charset=utf-8' }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.deepEqual(mutation, { input: changed, user: ADMIN })
  assert.equal('adminUserId' in mutation.input, false)
})

test('the preferences URL dispatches through the existing admin gateway', async () => {
  let dispatched = false
  const router = createAdminRouter({
    preferences: (req, res) => {
      dispatched = req.url === '/api/admin/settings/preferences'
      res.statusCode = 204
      res.end()
    },
  })
  const req = request('GET')
  req.url = '/api/admin/settings/preferences'
  const res = response()
  await router(req, res)
  assert.equal(res.statusCode, 204)
  assert.equal(dispatched, true)
})

test('preference mutations reject cross-origin, unknown-key, invalid-value and content-type requests', async () => {
  let updates = 0
  const dependencies = {
    enabled: () => true,
    requireSession: async () => ({ user: ADMIN }),
    createService: () => ({ update: async () => { updates += 1; return { ok: true, preferences: VALID } } }),
  }
  for (const [handler, body, headers, expected] of [
    [createAdminPreferencesHandler({ ...dependencies, trustedOrigin: () => false }), VALID, { 'content-type': 'application/json', origin: 'https://evil.invalid' }, 403],
    [createAdminPreferencesHandler({ ...dependencies, trustedOrigin: () => true }), { ...VALID, adminUserId: OTHER_ADMIN_ID }, { 'content-type': 'application/json' }, 400],
    [createAdminPreferencesHandler({ ...dependencies, trustedOrigin: () => true }), { ...VALID, tableDensity: 'dense' }, { 'content-type': 'application/json' }, 400],
    [createAdminPreferencesHandler({ ...dependencies, trustedOrigin: () => true }), { ...VALID, viewerTimeoutSeconds: 90 }, { 'content-type': 'application/json' }, 400],
    [createAdminPreferencesHandler({ ...dependencies, trustedOrigin: () => true }), VALID, { 'content-type': 'application/jsonp' }, 415],
  ]) {
    const res = response()
    await handler(request('POST', body, headers), res)
    assert.equal(res.statusCode, expected)
  }
  assert.equal(updates, 0)
})

test('preference service returns defaults for a missing row and persists all four values per administrator', async () => {
  const rows = new Map()
  const store = {
    get: async (id) => rows.get(id) || null,
    upsert: async (id, value) => {
      const row = {
        admin_user_id: id,
        table_density: value.tableDensity,
        review_notifications_enabled: value.reviewNotificationsEnabled,
        viewer_timeout_seconds: value.viewerTimeoutSeconds,
        reduced_motion: value.reducedMotion,
      }
      rows.set(id, row)
      return row
    },
  }
  const service = createAdminPreferencesService({ store })
  assert.deepEqual((await service.get(ADMIN)).preferences, VALID)
  const changed = { tableDensity: 'compact', reviewNotificationsEnabled: false, viewerTimeoutSeconds: 60, reducedMotion: true }
  assert.deepEqual((await service.update(changed, ADMIN)).preferences, changed)
  assert.deepEqual((await service.get(ADMIN)).preferences, changed)
  assert.deepEqual((await service.get({ ...ADMIN, id: OTHER_ADMIN_ID })).preferences, VALID)
})

test('Supabase preference store scopes reads and upserts to the authenticated administrator id', async () => {
  const calls = []
  const storedRow = {
    admin_user_id: ADMIN_ID,
    table_density: 'compact',
    review_notifications_enabled: false,
    viewer_timeout_seconds: 300,
    reduced_motion: true,
  }
  const supabase = {
    from(table) {
      assert.equal(table, 'admin_user_preferences')
      return {
        select(columns) {
          calls.push({ type: 'select', columns })
          return { eq(key, value) { calls.push({ type: 'eq', key, value }); return { maybeSingle: async () => ({ data: storedRow, error: null }) } } }
        },
        upsert(row, options) {
          calls.push({ type: 'upsert', row, options })
          return { select() { return { single: async () => ({ data: storedRow, error: null }) } } }
        },
      }
    },
  }
  const store = createAdminPreferencesStore(supabase)
  await store.get(ADMIN_ID)
  await store.upsert(ADMIN_ID, { tableDensity: 'compact', reviewNotificationsEnabled: false, viewerTimeoutSeconds: 300, reducedMotion: true })
  assert.deepEqual(calls.find((call) => call.type === 'eq'), { type: 'eq', key: 'admin_user_id', value: ADMIN_ID })
  assert.equal(calls.find((call) => call.type === 'upsert').row.admin_user_id, ADMIN_ID)
})

test('the live review queue includes bounded actionable AIVEX statuses and real references only', () => {
  const items = reviewQueueItems([
    { ref: 'AIVEX2-AAAA2222', name: 'Alpha', documentKey: 'signed_document_uploaded' },
    { ref: 'AIVEX2-BBBB2222', name: 'Beta', documentKey: 'changes_required' },
    { ref: 'AIVEX2-CCCC2222', name: 'Gamma', documentKey: 'generation_failed' },
    { ref: 'AIVEX2-DDDD2222', name: 'Delta', documentKey: 'under_review' },
    { ref: 'AIVEX2-EEEE2222', name: 'Done', documentKey: 'validated' },
    { ref: 'AIVEX2-FFFF2222', name: 'Closed', documentKey: 'generation_failed', registrationKey: 'rejected' },
  ])
  assert.equal(items.length, 4)
  assert.deepEqual(items.map((item) => item.reference), [
    'AIVEX2-AAAA2222', 'AIVEX2-BBBB2222', 'AIVEX2-CCCC2222', 'AIVEX2-DDDD2222',
  ])
})

test('Settings has only real controls and production preferences are not sourced from AdminStore', async () => {
  const [settings, app, provider, store, model, viewer, css] = await Promise.all([
    read('src/admin/AdminUtilityPages.jsx'),
    read('src/admin/AdminApp.jsx'),
    read('src/admin/AdminPreferences.jsx'),
    read('src/admin/AdminStore.jsx'),
    read('src/admin/adminModel.js'),
    read('src/admin/AivexPages.jsx'),
    read('src/admin/admin.css'),
  ])
  for (const removed of [
    'Demo records', 'Reset demo data', 'Danger action example', 'Primary action',
    'Secondary action', 'Text button', 'StatePreview', 'Action confirmed', 'Design system',
  ]) assert.doesNotMatch(settings, new RegExp(removed))
  assert.doesNotMatch(settings, />Active campaign</)
  assert.match(settings, /Active programmes/)
  assert.match(settings, /\['Workspace', 'AIVEX', 'Access & privacy', 'Appearance'\]/)
  assert.match(provider, /\/api\/admin\/settings\/preferences/)
  assert.match(provider, /limit=12&sort=attention_asc/)
  assert.match(app, /preferences\.tableDensity === 'compact'/)
  assert.match(app, /preferences\.reviewNotificationsEnabled/)
  assert.doesNotMatch(app, /const pending = state\.teams/)
  assert.doesNotMatch(store, /state\.settings/)
  assert.doesNotMatch(model, /settings:\s*\{/)
  assert.match(store, /delete saved\.settings/)
  assert.match(viewer, /useState\(preferences\.viewerTimeoutSeconds\)/)
  assert.match(css, /\.adm-reduced-motion/)
  assert.match(settings, /changePassword\(currentPassword, newPassword\)/)
  assert.match(settings, /<AivexCampaignSettings/)
})

test('preference migration is forward-only, constrained, RLS-protected and service-role-only', async () => {
  const migration = await read('supabase/migrations/20261012120000_admin_user_preferences.sql')
  assert.match(migration, /create table public\.admin_user_preferences/)
  assert.match(migration, /references public\.admin_users \(id\) on delete cascade/)
  assert.match(migration, /table_density in \('comfortable', 'compact'\)/)
  assert.match(migration, /viewer_timeout_seconds in \(60, 120, 300\)/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.admin_user_preferences from public, anon, authenticated/)
  assert.match(migration, /grant select, insert, update on table public\.admin_user_preferences to service_role/)
  assert.doesNotMatch(migration, /insert into public\.admin_user_preferences/)
})
