import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import vm from 'node:vm'
import {
  ADMIN_NOTIFICATION_KINDS,
  createAdminNotificationsStore,
  createAdminNotificationsService,
  safeAdminNotificationActionPath,
  validateAdminNotificationAction,
  validatePushSubscription,
} from '../api/_lib/admin-notifications.js'
import { createAdminNotificationsHandler, createAdminRouter } from '../api/admin-auth.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const ADMIN_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOTIFICATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ADMIN = { id: ADMIN_ID, role: 'super_admin', username: 'root' }

function request(method, path, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = `/api/admin/${path}`
  req.headers = headers
  req.socket = { remoteAddress: '127.0.0.71' }
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

test('notification kinds enforce the documented role boundaries and privacy-safe copy', () => {
  assert.deepEqual(ADMIN_NOTIFICATION_KINDS.join_application_submitted.roles, ['super_admin'])
  for (const kind of ['aivex_signed_document_uploaded', 'aivex_corrections_resubmitted', 'aivex_generation_failed']) {
    assert.deepEqual(ADMIN_NOTIFICATION_KINDS[kind].roles, ['super_admin', 'administrator', 'reviewer'])
  }
  const copy = JSON.stringify(ADMIN_NOTIFICATION_KINDS)
  assert.doesNotMatch(copy, /email|phone|identity|passport|candidate name|document content/i)
  assert.match(ADMIN_NOTIFICATION_KINDS.aivex_generation_failed.pushBody, /needs administrator attention/i)
})

test('notification deep links accept only exact same-origin admin destinations', () => {
  assert.equal(safeAdminNotificationActionPath('/admin/applications?record=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), '/admin/applications?record=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assert.equal(safeAdminNotificationActionPath('/admin/aivex/AIVEX2-7K9M2P4R'), '/admin/aivex/AIVEX2-7K9M2P4R')
  assert.equal(safeAdminNotificationActionPath('/admin/settings'), '/admin/settings')
  for (const unsafe of [
    'https://evil.invalid/admin/settings', '//evil.invalid/admin/settings', '/admin/../',
    '/admin/applications?record=not-a-uuid', '/admin/aivex/../../overview', '/admin/settings#secret',
  ]) assert.equal(safeAdminNotificationActionPath(unsafe), null, unsafe)
})

test('push subscriptions and recipient-state actions use strict bounded schemas', () => {
  const validSubscription = {
    endpoint: 'https://push.example.test/subscription/123',
    keys: { p256dh: 'A'.repeat(65), auth: 'B'.repeat(16) },
    deviceLabel: 'Test browser',
  }
  assert.equal(validatePushSubscription(validSubscription).ok, true)
  assert.equal(validatePushSubscription({ ...validSubscription, endpoint: 'http://push.example.test/x' }).ok, false)
  assert.equal(validatePushSubscription({ ...validSubscription, keys: { p256dh: '!', auth: 'short' } }).ok, false)
  assert.equal(validatePushSubscription({ ...validSubscription, adminUserId: ADMIN_ID }).ok, false)
  assert.deepEqual(validateAdminNotificationAction({ action: 'mark_read', notificationId: NOTIFICATION_ID }), {
    ok: true, value: { action: 'mark_read', notificationId: NOTIFICATION_ID },
  })
  assert.equal(validateAdminNotificationAction({ action: 'mark_read', notificationId: NOTIFICATION_ID, adminUserId: ADMIN_ID }).ok, false)
  assert.equal(validateAdminNotificationAction({ action: 'mark_seen', notificationIds: Array(101).fill(NOTIFICATION_ID) }).ok, true, 'duplicate ids are bounded after deduplication')
  assert.equal(validateAdminNotificationAction({ action: 'delete_everything' }).ok, false)
})

test('a stable dedupe key persists and pushes only once across retries', async () => {
  const rows = new Map()
  const deliveries = []
  const pushes = []
  const store = {
    async create(input) {
      if (rows.has(input.dedupeKey)) return { id: rows.get(input.dedupeKey), created: false }
      rows.set(input.dedupeKey, NOTIFICATION_ID)
      return { id: NOTIFICATION_ID, created: true }
    },
    async recipientSubscriptions() {
      return [{ id: 'subscription-1', admin_user_id: ADMIN_ID, endpoint: 'https://push.example.test/1', p256dh: 'A'.repeat(65), auth: 'B'.repeat(16) }]
    },
    async markDelivered(notificationId, adminUserId) { deliveries.push([notificationId, adminUserId]) },
    async recordPushFailure() {},
  }
  const service = createAdminNotificationsService({
    store,
    push: { configured: true, async send(subscription, payload) { pushes.push({ subscription, payload }) } },
    now: () => new Date('2026-10-08T10:00:00.000Z'),
  })
  const input = {
    kind: 'join_application_submitted',
    dedupeKey: 'join:submitted:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    actionPath: '/admin/applications?record=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    entityType: 'join_application',
    entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  }
  assert.equal((await service.createNotification(input)).created, true)
  assert.equal((await service.createNotification(input)).created, false)
  assert.equal(rows.size, 1)
  assert.equal(pushes.length, 1)
  assert.deepEqual(deliveries, [[NOTIFICATION_ID, ADMIN_ID]])
  assert.equal(pushes[0].payload.title, 'Infinity Administration')
  assert.doesNotMatch(`${pushes[0].payload.title} ${pushes[0].payload.body}`, /email|phone|passport|identity|candidate name/i)
})

test('permanent push failures revoke subscriptions while transient failures are retained', async () => {
  for (const [statusCode, permanent] of [[410, true], [500, false]]) {
    const failures = []
    const store = {
      create: async () => ({ id: NOTIFICATION_ID, created: true }),
      recipientSubscriptions: async () => [{ id: `subscription-${statusCode}`, admin_user_id: ADMIN_ID, endpoint: 'https://push.example.test/1', p256dh: 'A'.repeat(65), auth: 'B'.repeat(16) }],
      markDelivered: async () => { throw new Error('a failed push must not be marked delivered') },
      recordPushFailure: async (id, isPermanent) => failures.push({ id, isPermanent }),
    }
    const service = createAdminNotificationsService({
      store,
      push: { configured: true, async send() { throw Object.assign(new Error('push failed'), { statusCode }) } },
      now: () => new Date('2026-10-08T10:00:00.000Z'),
    })
    const result = await service.createNotification({
      kind: 'aivex_generation_failed', dedupeKey: `failure:${statusCode}`,
      actionPath: '/admin/aivex/AIVEX2-7K9M2P4R', entityType: 'aivex_registration', entityId: ADMIN_ID,
    })
    assert.equal(result.created, true)
    assert.deepEqual(failures, [{ id: `subscription-${statusCode}`, isPermanent: permanent }])
  }
})

test('device subscription registration upserts the endpoint for the current administrator', async () => {
  const calls = []
  const row = { id: 'subscription-id', device_label: 'Office browser', created_at: '2026-10-08T10:00:00.000Z', last_seen_at: '2026-10-08T10:00:00.000Z' }
  const supabase = {
    from(table) {
      assert.equal(table, 'admin_push_subscriptions')
      return {
        upsert(value, options) {
          calls.push({ value, options })
          return { select() { return { single: async () => ({ data: row, error: null }) } } }
        },
      }
    },
  }
  const store = createAdminNotificationsStore(supabase)
  const subscription = { endpoint: 'https://push.example.test/1', p256dh: 'A'.repeat(65), auth: 'B'.repeat(16), deviceLabel: 'Office browser' }
  await store.registerSubscription(ADMIN_ID, subscription, { userAgent: 'Test browser' }, new Date('2026-10-08T10:00:00.000Z'))
  await store.registerSubscription(ADMIN_ID, subscription, { userAgent: 'Updated browser' }, new Date('2026-10-08T11:00:00.000Z'))
  assert.equal(calls.length, 2)
  assert.deepEqual(calls.map((call) => call.options), [{ onConflict: 'endpoint' }, { onConflict: 'endpoint' }])
  assert.ok(calls.every((call) => call.value.admin_user_id === ADMIN_ID))
  assert.ok(calls.every((call) => !('adminUserId' in call.value)))
})

test('test notifications target only the requesting administrator', async () => {
  let created
  const store = {
    create: async (input) => { created = input; return { id: NOTIFICATION_ID, created: true } },
    recipientSubscriptions: async () => [],
  }
  const service = createAdminNotificationsService({ store, push: { configured: false } })
  await service.sendTestNotification(ADMIN)
  assert.equal(created.kind, 'test_notification')
  assert.deepEqual(created.recipientRoles, [])
  assert.deepEqual(created.recipientUserIds, [ADMIN_ID])
})

test('notification API fails closed, scopes actions to the session user, and dispatches via the gateway', async () => {
  const unauthenticated = createAdminNotificationsHandler({
    enabled: () => true,
    requireSession: async () => null,
    createService: () => { throw new Error('must not create service') },
  })
  let res = response()
  await unauthenticated(request('GET', 'notifications'), res)
  assert.equal(res.statusCode, 401)

  const serviceCalls = []
  const service = {
    list: async (user, options) => {
      serviceCalls.push({ name: 'list', user, options })
      return { notifications: [], nextCursor: null, unreadCount: 0 }
    },
    markSeen: async () => {}, markAllRead: async () => {}, sendTestNotification: async () => {},
    markRead: async (user, id) => { serviceCalls.push({ name: 'read', user, id }); return true },
    archive: async () => true, unreadCount: async () => 3,
    listPushSubscriptions: async () => [], registerPushSubscription: async () => ({}), removePushSubscription: async () => true,
  }
  const handler = createAdminNotificationsHandler({
    enabled: () => true,
    requireSession: async () => ({ user: ADMIN, sessionId: 'session' }),
    trustedOrigin: () => true,
    createService: () => service,
  })
  res = response()
  await handler(request('POST', 'notifications/actions', { action: 'mark_read', notificationId: NOTIFICATION_ID }, { 'content-type': 'application/json' }), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(serviceCalls.at(-1), { name: 'read', user: ADMIN, id: NOTIFICATION_ID })
  assert.equal(res.body.unreadCount, 3)

  res = response()
  await handler(request('POST', 'notifications/actions', { action: 'unknown' }, { 'content-type': 'application/json' }), res)
  assert.equal(res.statusCode, 400)

  res = response()
  await handler(request('POST', 'notifications/actions', { action: 'mark_all_read' }, { 'content-type': 'text/plain' }), res)
  assert.equal(res.statusCode, 415)

  res = response()
  await handler(request('POST', 'notifications/push-subscription', {
    subscription: { endpoint: 'https://push.example.test/subscription/123', keys: { p256dh: 'A'.repeat(65), auth: 'B'.repeat(16) } },
    deviceLabel: 'Browser', adminUserId: ADMIN_ID,
  }, { 'content-type': 'application/json' }), res)
  assert.equal(res.statusCode, 400)

  const rejected = createAdminNotificationsHandler({
    enabled: () => true,
    requireSession: async () => ({ user: ADMIN }),
    trustedOrigin: () => false,
    createService: () => service,
  })
  res = response()
  await rejected(request('POST', 'notifications/actions', { action: 'mark_all_read' }, { 'content-type': 'application/json', origin: 'https://evil.invalid' }), res)
  assert.equal(res.statusCode, 403)

  let dispatched = false
  const router = createAdminRouter({ notifications: (req, routeResponse) => {
    dispatched = req.url === '/api/admin/notifications'
    routeResponse.statusCode = 204
    routeResponse.end()
  } })
  res = response()
  await router(request('GET', 'notifications'), res)
  assert.equal(res.statusCode, 204)
  assert.equal(dispatched, true)
})

test('notification migration is private, constrained, deduplicated and cascade-safe', async () => {
  const [migration, retentionMigration, conflictFixMigration] = await Promise.all([
    read('supabase/migrations/20261015120000_admin_notification_system.sql'),
    read('supabase/migrations/20261015121000_admin_notification_retention.sql'),
    read('supabase/migrations/20261015122000_fix_admin_notification_recipient_conflict.sql'),
  ])
  for (const table of ['admin_notifications', 'admin_notification_recipients', 'admin_push_subscriptions']) {
    assert.match(migration, new RegExp(`create table public\\.${table}`))
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`))
  }
  assert.match(migration, /dedupe_key text not null unique/)
  assert.match(migration, /primary key \(notification_id, admin_user_id\)/)
  assert.match(migration, /references public\.admin_notifications \(id\) on delete cascade/)
  assert.match(migration, /references public\.admin_users \(id\) on delete cascade/g)
  assert.match(migration, /administrator\.is_active = true/)
  assert.match(migration, /administrator\.id <> p_actor_admin_user_id/)
  assert.match(migration, /aivex_notifications_enabled/)
  assert.match(migration, /join_notifications_enabled/)
  assert.match(retentionMigration, /admin_prune_notifications/)
  assert.match(retentionMigration, /created_at < now\(\) - interval '90 days'/)
  assert.match(retentionMigration, /grant execute on function public\.admin_prune_notifications\(\)\s+to service_role/)
  assert.match(conflictFixMigration, /create or replace function public\.admin_create_notification/)
  assert.match(conflictFixMigration, /on conflict on constraint admin_notification_recipients_pkey do nothing/)
  assert.doesNotMatch(conflictFixMigration, /on conflict \(notification_id, admin_user_id\)/)
})

test('service worker is admin-scoped, privacy-safe, focus-aware and never intercepts fetch', async () => {
  const [worker, manifest, client, center, settings] = await Promise.all([
    read('public/admin-sw.js'), read('public/admin.webmanifest'), read('src/admin/AdminNotifications.jsx'),
    read('src/admin/AdminNotificationCenter.jsx'), read('src/admin/AdminNotificationSettings.jsx'),
  ])
  assert.match(worker, /addEventListener\('push'/)
  assert.match(worker, /addEventListener\('notificationclick'/)
  assert.match(worker, /visibilityState === 'visible'/)
  assert.match(worker, /INFINITY_ADMIN_NOTIFICATION/)
  assert.match(worker, /showNotification/)
  assert.doesNotMatch(worker, /addEventListener\('fetch'/)
  assert.doesNotMatch(worker, /email|phone|passport|identity document|candidate name/i)
  assert.match(manifest, /"scope": "\/admin\/"/)
  assert.match(client, /Notification\.requestPermission\(\)/)
  assert.match(client, /window\.addEventListener\('focus'/)
  assert.match(client, /document\.addEventListener\('visibilitychange'/)
  assert.match(client, /navigator\.setAppBadge/)
  assert.match(center, /Mark all as read/)
  assert.match(center, /unreadFilter/)
  assert.match(settings, /Enable browser notifications/)
  assert.match(await read('src/admin/AdminApp.jsx'), /onBeforeLogout=.*disablePush/)
  assert.doesNotMatch(`${client}\n${center}\n${settings}\n${worker}`, /WEB_PUSH_VAPID_PRIVATE_KEY|SUPABASE_SECRET_KEY|service_role|Magic Link token|admin session token/i)
})

test('service worker pure logic survives malformed payloads and suppresses foreground native alerts', async () => {
  const listeners = {}
  const shown = []
  const messages = []
  let clients = []
  const context = {
    URL,
    self: {
      location: { origin: 'https://www.infinty-bba.com' },
      addEventListener: (name, listener) => { listeners[name] = listener },
      clients: {
        claim: async () => {},
        matchAll: async () => clients,
        openWindow: async () => {},
      },
      registration: { showNotification: async (...args) => { shown.push(args) } },
    },
  }
  vm.runInNewContext(await read('public/admin-sw.js'), context)
  assert.equal(context.safeActionPath('https://evil.invalid/admin/settings'), '/admin')
  assert.equal(context.safeActionPath('/admin/settings'), '/admin/settings')
  assert.equal(context.normalizePushPayload({ data: { json() { throw new Error('bad payload') } } }), null)

  clients = [{
    visibilityState: 'visible', url: 'https://www.infinty-bba.com/admin/aivex',
    postMessage: (value) => messages.push(value),
  }]
  let foreground
  listeners.push({
    data: { json: () => ({ body: 'A new AIVEX file is ready for review.', notificationId: NOTIFICATION_ID, actionPath: '/admin/settings' }) },
    waitUntil: (promise) => { foreground = promise },
  })
  await foreground
  assert.equal(messages.length, 1)
  assert.equal(shown.length, 0)

  clients = []
  let background
  listeners.push({ data: { json() { throw new Error('malformed') } }, waitUntil: (promise) => { background = promise } })
  await background
  assert.equal(shown.length, 1)
  assert.equal(shown[0][0], 'Infinity Administration')
  assert.match(shown[0][1].body, /administration notification/i)
})

test('business success paths emit best-effort persistent notifications', async () => {
  const sources = await Promise.all([
    read('api/join.js'),
    read('api/aivex/magic-link/upload/finalize.js'),
    read('api/aivex/magic-link/verify.js'),
    read('api/_lib/aivex-document-generation.js'),
  ])
  assert.match(sources[0], /emitJoinApplicationNotification/)
  assert.match(sources[1], /emitAivexSignedDocumentNotification/)
  assert.match(sources[1], /emitAivexCorrectionsNotification/)
  assert.match(sources[2], /emitAivexCorrectionsNotification/)
  assert.match(sources[3], /onFailure/)
  for (const source of sources) assert.match(source, /catch/, 'notification failures must not replace the business response')
})
