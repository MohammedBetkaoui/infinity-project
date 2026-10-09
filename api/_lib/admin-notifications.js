import { randomUUID } from 'node:crypto'
import { createServerSupabaseClient } from './aivex-server.js'
import { createAdminWebPush, isExpiredPushSubscription, pushFailureStatus } from './admin-web-push.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const AIVEX_REFERENCE_RE = /^AIVEX[1-9][0-9]?-[0-9A-HJKMNP-TV-Z]{8}$/
const PUSH_KEY_RE = /^[A-Za-z0-9_-]+$/
const ALL_AIVEX_ROLES = Object.freeze(['super_admin', 'administrator', 'reviewer'])

export const ADMIN_NOTIFICATION_KINDS = Object.freeze({
  join_application_submitted: Object.freeze({
    source: 'join', severity: 'info', roles: Object.freeze(['super_admin']),
    title: 'New Join application', body: 'A new membership application is ready for review.',
    pushBody: 'A new Join application is ready for review.',
  }),
  staff_motivation_submitted: Object.freeze({
    source: 'join', severity: 'info', roles: Object.freeze(['super_admin']),
    title: 'Staff motivation received', body: 'A Staff candidate submitted their confirmation.',
    pushBody: 'A Staff confirmation is ready for review.',
  }),
  aivex_signed_document_uploaded: Object.freeze({
    source: 'aivex', severity: 'info', roles: ALL_AIVEX_ROLES,
    title: 'Signed document received', body: 'A signed AIVEX document is ready for review.',
    pushBody: 'A new AIVEX file is ready for review.',
  }),
  aivex_corrections_resubmitted: Object.freeze({
    source: 'aivex', severity: 'info', roles: ALL_AIVEX_ROLES,
    title: 'Corrections resubmitted', body: 'An AIVEX correction is ready for review.',
    pushBody: 'An AIVEX correction is ready for review.',
  }),
  aivex_generation_failed: Object.freeze({
    source: 'aivex', severity: 'warning', roles: ALL_AIVEX_ROLES,
    title: 'Document generation issue', body: 'An AIVEX document could not be generated and needs attention.',
    pushBody: 'An AIVEX file needs administrator attention.',
  }),
  system_notice: Object.freeze({
    source: 'system', severity: 'info', roles: Object.freeze(['super_admin']),
    title: 'System notice', body: 'An administration system notice is available.',
    pushBody: 'An administration system notice is available.',
  }),
  test_notification: Object.freeze({
    source: 'system', severity: 'info', roles: Object.freeze([]),
    title: 'Test notification', body: 'Browser notifications are configured for this administrator.',
    pushBody: 'Your Infinity Administration test notification is working.',
  }),
})

const fail = (stage, error) => {
  throw Object.assign(new Error(stage), {
    stage,
    code: error?.code || error?.statusCode || error?.status || 'database_error',
  })
}

const firstRow = (value) => Array.isArray(value) ? value[0] : value

export function safeAdminNotificationActionPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/admin/')) return null
  if (value.includes('\\') || [...value].some((character) => character.charCodeAt(0) < 32)) return null
  try {
    const parsed = new URL(value, 'https://infinity.invalid')
    if (parsed.origin !== 'https://infinity.invalid' || parsed.hash) return null
    if (/^\/admin\/aivex\//.test(parsed.pathname)) {
      const reference = parsed.pathname.slice('/admin/aivex/'.length)
      return AIVEX_REFERENCE_RE.test(reference) && !parsed.search ? parsed.pathname : null
    }
    if (parsed.pathname === '/admin/applications') {
      if (!parsed.search) return parsed.pathname
      const record = parsed.searchParams.get('record')
      if (!UUID_RE.test(record || '')) return null
      if (parsed.searchParams.size === 1) return `${parsed.pathname}?record=${record}`
      const view = parsed.searchParams.get('view')
      return parsed.searchParams.size === 2 && view === 'staff-confirmations'
        ? `${parsed.pathname}?view=staff-confirmations&record=${record}`
        : null
    }
    if (['/admin/overview', '/admin/activity', '/admin/settings', '/admin/aivex'].includes(parsed.pathname) && !parsed.search) {
      return parsed.pathname
    }
  } catch {
    return null
  }
  return null
}

export function validatePushSubscription(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false }
  if (!Object.keys(input).every((key) => ['endpoint', 'keys', 'deviceLabel'].includes(key))) return { ok: false }
  if (!input.keys || typeof input.keys !== 'object' || Array.isArray(input.keys)) return { ok: false }
  if (Object.keys(input.keys).length !== 2 || !Object.keys(input.keys).every((key) => ['p256dh', 'auth'].includes(key))) return { ok: false }
  const endpoint = typeof input.endpoint === 'string' ? input.endpoint.trim() : ''
  const p256dh = typeof input.keys?.p256dh === 'string' ? input.keys.p256dh.trim() : ''
  const auth = typeof input.keys?.auth === 'string' ? input.keys.auth.trim() : ''
  const deviceLabel = typeof input.deviceLabel === 'string' ? input.deviceLabel.trim() : ''
  let endpointUrl
  try { endpointUrl = new URL(endpoint) } catch { return { ok: false } }
  if (endpointUrl.protocol !== 'https:' || endpoint.length > 2048 || endpoint.length < 16) return { ok: false }
  if (!PUSH_KEY_RE.test(p256dh) || p256dh.length < 40 || p256dh.length > 512) return { ok: false }
  if (!PUSH_KEY_RE.test(auth) || auth.length < 8 || auth.length > 256) return { ok: false }
  if (deviceLabel.length > 120) return { ok: false }
  return { ok: true, value: { endpoint, p256dh, auth, deviceLabel: deviceLabel || null } }
}

export function validateAdminNotificationAction(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.action !== 'string') return { ok: false }
  if (input.action === 'mark_all_read' || input.action === 'test') {
    return Object.keys(input).length === 1 ? { ok: true, value: { action: input.action } } : { ok: false }
  }
  if (input.action === 'mark_seen') {
    const ids = Array.isArray(input.notificationIds) ? [...new Set(input.notificationIds)] : []
    return ids.length > 0 && ids.length <= 100 && ids.every((id) => UUID_RE.test(id))
      && Object.keys(input).every((key) => ['action', 'notificationIds'].includes(key))
      ? { ok: true, value: { action: input.action, notificationIds: ids } }
      : { ok: false }
  }
  if (['mark_read', 'archive'].includes(input.action)) {
    return UUID_RE.test(input.notificationId || '')
      && Object.keys(input).every((key) => ['action', 'notificationId'].includes(key))
      ? { ok: true, value: { action: input.action, notificationId: input.notificationId } }
      : { ok: false }
  }
  return { ok: false }
}

export function createAdminNotificationsStore(supabase) {
  if (!supabase) fail('admin_notifications_store_unavailable', { code: 'configuration_error' })
  return {
    async create(input) {
      const { data, error } = await supabase.rpc('admin_create_notification', {
        p_kind: input.kind,
        p_source: input.source,
        p_severity: input.severity,
        p_entity_type: input.entityType || null,
        p_entity_id: input.entityId || null,
        p_action_path: input.actionPath || null,
        p_dedupe_key: input.dedupeKey,
        p_payload: input.payload || {},
        p_recipient_roles: input.recipientRoles,
        p_recipient_user_ids: input.recipientUserIds || null,
        p_actor_admin_user_id: input.actorAdminUserId || null,
        p_created_at: input.createdAt.toISOString(),
        p_expires_at: input.expiresAt?.toISOString() || null,
      })
      if (error) fail('admin_notification_create', error)
      const row = firstRow(data)
      if (!row?.notification_id) fail('admin_notification_create', { code: 'missing_notification' })
      return { id: row.notification_id, created: row.created === true }
    },

    async list(adminUserId, { source, unreadOnly, cursor, limit }) {
      let query = supabase.from('admin_notification_recipients').select(`
        notification_id, delivered_at, seen_at, read_at, archived_at, created_at,
        notification:admin_notifications!inner(
          id, kind, source, severity, entity_type, entity_id, action_path, payload, created_at, expires_at
        )
      `)
        .eq('admin_user_id', adminUserId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(limit + 1)
      if (source) query = query.eq('notification.source', source)
      if (unreadOnly) query = query.is('read_at', null)
      if (cursor) query = query.lt('created_at', cursor)
      const { data, error } = await query
      if (error) fail('admin_notifications_list', error)
      const rows = data || []
      return { rows: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].created_at : null }
    },

    async unreadCount(adminUserId) {
      const { count, error } = await supabase.from('admin_notification_recipients')
        .select('notification_id', { count: 'exact', head: true })
        .eq('admin_user_id', adminUserId)
        .is('read_at', null)
        .is('archived_at', null)
      if (error) fail('admin_notifications_count', error)
      return Number(count || 0)
    },

    async markSeen(adminUserId, notificationIds, now) {
      if (!notificationIds.length) return
      const { error } = await supabase.from('admin_notification_recipients')
        .update({ seen_at: now.toISOString() })
        .eq('admin_user_id', adminUserId)
        .in('notification_id', notificationIds)
        .is('seen_at', null)
      if (error) fail('admin_notifications_seen', error)
    },

    async markRead(adminUserId, notificationId, now) {
      const { data, error } = await supabase.from('admin_notification_recipients')
        .update({ read_at: now.toISOString(), seen_at: now.toISOString() })
        .eq('admin_user_id', adminUserId)
        .eq('notification_id', notificationId)
        .select('notification_id')
      if (error) fail('admin_notification_read', error)
      return Boolean(data?.length)
    },

    async markAllRead(adminUserId, now) {
      const { error } = await supabase.from('admin_notification_recipients')
        .update({ read_at: now.toISOString(), seen_at: now.toISOString() })
        .eq('admin_user_id', adminUserId)
        .is('read_at', null)
        .is('archived_at', null)
      if (error) fail('admin_notifications_read_all', error)
    },

    async archive(adminUserId, notificationId, now) {
      const { data, error } = await supabase.from('admin_notification_recipients')
        .update({ archived_at: now.toISOString(), read_at: now.toISOString(), seen_at: now.toISOString() })
        .eq('admin_user_id', adminUserId)
        .eq('notification_id', notificationId)
        .select('notification_id')
      if (error) fail('admin_notification_archive', error)
      return Boolean(data?.length)
    },

    async recipientSubscriptions(notificationId) {
      const { data: recipients, error: recipientError } = await supabase.from('admin_notification_recipients')
        .select('admin_user_id')
        .eq('notification_id', notificationId)
      if (recipientError) fail('admin_notification_recipients', recipientError)
      const userIds = (recipients || []).map((row) => row.admin_user_id)
      if (!userIds.length) return []
      const { data, error } = await supabase.from('admin_push_subscriptions')
        .select('id, admin_user_id, endpoint, p256dh, auth')
        .in('admin_user_id', userIds)
        .is('revoked_at', null)
      if (error) fail('admin_push_subscriptions_list', error)
      return data || []
    },

    async markDelivered(notificationId, adminUserId, now) {
      const { error } = await supabase.from('admin_notification_recipients')
        .update({ delivered_at: now.toISOString() })
        .eq('notification_id', notificationId)
        .eq('admin_user_id', adminUserId)
        .is('delivered_at', null)
      if (error) fail('admin_notification_delivered', error)
    },

    async recordPushFailure(subscriptionId, permanent, now) {
      const { error } = await supabase.rpc('admin_record_push_failure', {
        p_subscription_id: subscriptionId,
        p_permanent: permanent,
        p_now: now.toISOString(),
      })
      if (error) fail('admin_push_failure', error)
    },

    async registerSubscription(adminUserId, subscription, requestMeta, now) {
      const { data, error } = await supabase.from('admin_push_subscriptions').upsert({
        admin_user_id: adminUserId,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        user_agent: requestMeta.userAgent || null,
        device_label: subscription.deviceLabel,
        last_seen_at: now.toISOString(),
        revoked_at: null,
        failure_count: 0,
        last_failure_at: null,
      }, { onConflict: 'endpoint' }).select('id, device_label, created_at, last_seen_at').single()
      if (error) fail('admin_push_subscription_upsert', error)
      return data
    },

    async removeSubscription(adminUserId, endpoint, now) {
      const { data, error } = await supabase.from('admin_push_subscriptions')
        .update({ revoked_at: now.toISOString() })
        .eq('admin_user_id', adminUserId)
        .eq('endpoint', endpoint)
        .select('id')
      if (error) fail('admin_push_subscription_remove', error)
      return Boolean(data?.length)
    },

    async listSubscriptions(adminUserId) {
      const { data, error } = await supabase.from('admin_push_subscriptions')
        .select('id, device_label, created_at, updated_at, last_seen_at')
        .eq('admin_user_id', adminUserId)
        .is('revoked_at', null)
        .order('last_seen_at', { ascending: false })
      if (error) fail('admin_push_subscriptions_devices', error)
      return data || []
    },

    async referenceForRegistration(registrationId) {
      const { data, error } = await supabase.from('aivex_registrations')
        .select('reference')
        .eq('id', registrationId)
        .maybeSingle()
      if (error) fail('admin_notification_aivex_reference', error)
      return data?.reference || null
    },
  }
}

const safePayload = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const payload = {}
  if (AIVEX_REFERENCE_RE.test(value.reference || '')) payload.reference = value.reference
  return payload
}

const notificationView = (row) => {
  const notification = row.notification
  const copy = ADMIN_NOTIFICATION_KINDS[notification.kind] || ADMIN_NOTIFICATION_KINDS.system_notice
  return {
    id: notification.id,
    kind: notification.kind,
    source: notification.source,
    severity: notification.severity,
    title: copy.title,
    body: copy.body,
    actionPath: safeAdminNotificationActionPath(notification.action_path),
    createdAt: notification.created_at,
    deliveredAt: row.delivered_at,
    seenAt: row.seen_at,
    readAt: row.read_at,
    payload: safePayload(notification.payload),
  }
}

export function createAdminNotificationsService({ store, push = createAdminWebPush(), now = () => new Date() } = {}) {
  if (!store) fail('admin_notifications_service_unavailable', { code: 'configuration_error' })

  const dispatchPush = async (notification, config) => {
    if (!push.configured) return { sent: 0, skipped: true }
    const subscriptions = await store.recipientSubscriptions(notification.id)
    const deliveredUsers = new Set()
    await Promise.all(subscriptions.map(async (row) => {
      try {
        await push.send({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, {
          title: 'Infinity Administration',
          body: config.pushBody,
          tag: notification.dedupeKey,
          notificationId: notification.id,
          actionPath: notification.actionPath,
          kind: notification.kind,
          severity: notification.severity,
        }, { urgency: notification.severity === 'critical' ? 'high' : 'normal' })
        deliveredUsers.add(row.admin_user_id)
      } catch (error) {
        const permanent = isExpiredPushSubscription(error)
        await store.recordPushFailure(row.id, permanent, now()).catch((recordError) => {
          console.error('[admin-notifications] Push failure could not be recorded', { code: recordError?.code })
        })
        console.error('[admin-notifications] Push delivery failed', {
          notificationId: notification.id, status: pushFailureStatus(error) || 'network', permanent,
        })
      }
    }))
    await Promise.all([...deliveredUsers].map((adminUserId) => (
      store.markDelivered(notification.id, adminUserId, now()).catch((error) => {
        console.error('[admin-notifications] Delivery state failed', { notificationId: notification.id, code: error?.code })
      })
    )))
    return { sent: deliveredUsers.size }
  }

  const createNotification = async (input) => {
    const config = ADMIN_NOTIFICATION_KINDS[input.kind]
    if (!config) throw Object.assign(new Error('unsupported_notification_kind'), { code: 'invalid_notification' })
    const actionPath = safeAdminNotificationActionPath(input.actionPath)
    if (input.actionPath && !actionPath) throw Object.assign(new Error('unsafe_notification_action'), { code: 'invalid_notification' })
    if (typeof input.dedupeKey !== 'string' || input.dedupeKey.length < 3 || input.dedupeKey.length > 300) {
      throw Object.assign(new Error('invalid_notification_dedupe_key'), { code: 'invalid_notification' })
    }
    const clock = input.createdAt || now()
    const persisted = await store.create({
      kind: input.kind,
      source: config.source,
      severity: input.severity || config.severity,
      entityType: input.entityType,
      entityId: input.entityId,
      actionPath,
      dedupeKey: input.dedupeKey,
      payload: safePayload(input.payload),
      recipientRoles: config.roles,
      recipientUserIds: input.recipientUserIds,
      actorAdminUserId: input.actorAdminUserId,
      createdAt: clock,
      expiresAt: input.expiresAt,
    })
    if (persisted.created) {
      await dispatchPush({
        id: persisted.id, kind: input.kind, severity: input.severity || config.severity,
        actionPath, dedupeKey: input.dedupeKey,
      }, config)
    }
    return persisted
  }

  return {
    createNotification,
    async list(user, options = {}) {
      const limit = Math.min(30, Math.max(1, Number(options.limit) || 24))
      const source = ['aivex', 'join', 'system', 'security'].includes(options.source) ? options.source : null
      const cursor = options.cursor && !Number.isNaN(new Date(options.cursor).getTime()) ? new Date(options.cursor).toISOString() : null
      const [page, unreadCount] = await Promise.all([
        store.list(user.id, { source, unreadOnly: options.unreadOnly === true, cursor, limit }),
        store.unreadCount(user.id),
      ])
      return { notifications: page.rows.map(notificationView), nextCursor: page.nextCursor, unreadCount }
    },
    unreadCount: (user) => store.unreadCount(user.id),
    markSeen: (user, ids) => store.markSeen(user.id, ids, now()),
    markRead: (user, id) => store.markRead(user.id, id, now()),
    markAllRead: (user) => store.markAllRead(user.id, now()),
    archive: (user, id) => store.archive(user.id, id, now()),
    registerPushSubscription: (user, subscription, requestMeta) => store.registerSubscription(user.id, subscription, requestMeta, now()),
    removePushSubscription: (user, endpoint) => store.removeSubscription(user.id, endpoint, now()),
    listPushSubscriptions: (user) => store.listSubscriptions(user.id),
    sendTestNotification(user) {
      return createNotification({
        kind: 'test_notification',
        dedupeKey: `system:test:${user.id}:${randomUUID()}`,
        actionPath: '/admin/settings',
        entityType: 'admin_user',
        entityId: user.id,
        recipientUserIds: [user.id],
      })
    },
    referenceForRegistration: (registrationId) => store.referenceForRegistration(registrationId),
  }
}

export function createServerAdminNotificationsService({ supabase = createServerSupabaseClient(), env = process.env } = {}) {
  return createAdminNotificationsService({
    store: createAdminNotificationsStore(supabase),
    push: createAdminWebPush({ env }),
  })
}

export async function emitJoinApplicationNotification({ supabase, applicationId, createdAt = new Date() }) {
  return createServerAdminNotificationsService({ supabase }).createNotification({
    kind: 'join_application_submitted',
    entityType: 'membership_application',
    entityId: applicationId,
    actionPath: `/admin/applications?record=${applicationId}`,
    dedupeKey: `join:submitted:${applicationId}`,
    createdAt,
  })
}

export async function emitStaffMotivationNotification({
  supabase, applicationId, confirmationId, version, createdAt = new Date(),
}) {
  return createServerAdminNotificationsService({ supabase }).createNotification({
    kind: 'staff_motivation_submitted',
    entityType: 'membership_staff_confirmation',
    entityId: confirmationId,
    actionPath: `/admin/applications?view=staff-confirmations&record=${applicationId}`,
    dedupeKey: `join:staff-motivation:${confirmationId}:${version}`,
    createdAt,
  })
}

async function aivexNotification({ supabase, registrationId, kind, dedupeKey, severity, createdAt, actorAdminUserId }) {
  const service = createServerAdminNotificationsService({ supabase })
  const reference = await service.referenceForRegistration(registrationId)
  if (!reference || !AIVEX_REFERENCE_RE.test(reference)) {
    throw Object.assign(new Error('aivex_notification_reference_missing'), { code: 'notification_target_missing' })
  }
  return service.createNotification({
    kind,
    severity,
    entityType: 'aivex_registration',
    entityId: registrationId,
    actionPath: `/admin/aivex/${reference}`,
    dedupeKey,
    payload: { reference },
    createdAt,
    actorAdminUserId,
  })
}

export function emitAivexSignedDocumentNotification({ supabase, registrationId, version, createdAt = new Date() }) {
  return aivexNotification({
    supabase, registrationId, kind: 'aivex_signed_document_uploaded', createdAt,
    dedupeKey: `aivex:signed-document:${registrationId}:${version}`,
  })
}

export function emitAivexCorrectionsNotification({ supabase, registrationId, correctionVersion, createdAt = new Date() }) {
  return aivexNotification({
    supabase, registrationId, kind: 'aivex_corrections_resubmitted', createdAt,
    dedupeKey: `aivex:corrections:${registrationId}:${correctionVersion}`,
  })
}

export function emitAivexGenerationFailureNotification({ supabase, registrationId, attempt, createdAt = new Date(), actorAdminUserId }) {
  return aivexNotification({
    supabase, registrationId, kind: 'aivex_generation_failed', severity: 'warning', createdAt, actorAdminUserId,
    dedupeKey: `aivex:generation-failed:${registrationId}:${attempt}`,
  })
}
