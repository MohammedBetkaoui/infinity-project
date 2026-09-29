import { createServerSupabaseClient } from './aivex-server.js'

export const ADMIN_PREFERENCE_DEFAULTS = Object.freeze({
  tableDensity: 'comfortable',
  reviewNotificationsEnabled: true,
  viewerTimeoutSeconds: 120,
  reducedMotion: false,
})

const PREFERENCE_COLUMNS = [
  'admin_user_id', 'table_density', 'review_notifications_enabled',
  'viewer_timeout_seconds', 'reduced_motion', 'created_at', 'updated_at',
].join(', ')

const UPDATE_KEYS = Object.freeze([
  'reducedMotion', 'reviewNotificationsEnabled', 'tableDensity', 'viewerTimeoutSeconds',
])
const TABLE_DENSITIES = new Set(['comfortable', 'compact'])
const VIEWER_TIMEOUTS = new Set([60, 120, 300])

const fail = (stage, error) => {
  throw Object.assign(new Error(stage), {
    stage,
    code: error?.code || error?.statusCode || error?.status || 'database_error',
  })
}

export function safeAdminPreferences(row) {
  if (!row) return { ...ADMIN_PREFERENCE_DEFAULTS }
  return {
    tableDensity: TABLE_DENSITIES.has(row.table_density)
      ? row.table_density
      : ADMIN_PREFERENCE_DEFAULTS.tableDensity,
    reviewNotificationsEnabled: typeof row.review_notifications_enabled === 'boolean'
      ? row.review_notifications_enabled
      : ADMIN_PREFERENCE_DEFAULTS.reviewNotificationsEnabled,
    viewerTimeoutSeconds: VIEWER_TIMEOUTS.has(row.viewer_timeout_seconds)
      ? row.viewer_timeout_seconds
      : ADMIN_PREFERENCE_DEFAULTS.viewerTimeoutSeconds,
    reducedMotion: typeof row.reduced_motion === 'boolean'
      ? row.reduced_motion
      : ADMIN_PREFERENCE_DEFAULTS.reducedMotion,
  }
}

export function validateAdminPreferencesBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Invalid administrator preferences.' }
  }
  const keys = Object.keys(body).sort()
  if (keys.length !== UPDATE_KEYS.length || UPDATE_KEYS.some((key, index) => keys[index] !== key)) {
    return { ok: false, message: 'Only administrator preference fields may be updated.' }
  }
  if (!TABLE_DENSITIES.has(body.tableDensity)) {
    return { ok: false, field: 'tableDensity', message: 'Choose a valid table density.' }
  }
  if (typeof body.reviewNotificationsEnabled !== 'boolean') {
    return { ok: false, field: 'reviewNotificationsEnabled', message: 'Review notifications must be true or false.' }
  }
  if (!VIEWER_TIMEOUTS.has(body.viewerTimeoutSeconds)) {
    return { ok: false, field: 'viewerTimeoutSeconds', message: 'Choose a valid viewer timeout.' }
  }
  if (typeof body.reducedMotion !== 'boolean') {
    return { ok: false, field: 'reducedMotion', message: 'Reduced motion must be true or false.' }
  }
  return {
    ok: true,
    value: {
      tableDensity: body.tableDensity,
      reviewNotificationsEnabled: body.reviewNotificationsEnabled,
      viewerTimeoutSeconds: body.viewerTimeoutSeconds,
      reducedMotion: body.reducedMotion,
    },
  }
}

export function createAdminPreferencesStore(supabase) {
  if (!supabase) {
    throw Object.assign(new Error('admin_preferences_store_unavailable'), {
      stage: 'configuration', code: 'configuration_error',
    })
  }
  return {
    async get(adminUserId) {
      const { data, error } = await supabase
        .from('admin_user_preferences')
        .select(PREFERENCE_COLUMNS)
        .eq('admin_user_id', adminUserId)
        .maybeSingle()
      if (error) fail('admin_preferences_get', error)
      return data
    },

    async upsert(adminUserId, preferences) {
      const { data, error } = await supabase
        .from('admin_user_preferences')
        .upsert({
          admin_user_id: adminUserId,
          table_density: preferences.tableDensity,
          review_notifications_enabled: preferences.reviewNotificationsEnabled,
          viewer_timeout_seconds: preferences.viewerTimeoutSeconds,
          reduced_motion: preferences.reducedMotion,
        }, { onConflict: 'admin_user_id' })
        .select(PREFERENCE_COLUMNS)
        .single()
      if (error) fail('admin_preferences_upsert', error)
      return data
    },
  }
}

export function createAdminPreferencesService({ store } = {}) {
  if (!store) {
    throw Object.assign(new Error('admin_preferences_service_unavailable'), {
      stage: 'configuration', code: 'configuration_error',
    })
  }
  return {
    async get(user) {
      if (!user?.id) return { ok: false, status: 401 }
      return { ok: true, preferences: safeAdminPreferences(await store.get(user.id)) }
    },
    async update(input, user) {
      if (!user?.id) return { ok: false, status: 401 }
      return { ok: true, preferences: safeAdminPreferences(await store.upsert(user.id, input)) }
    },
  }
}

export function createServerAdminPreferencesService() {
  return createAdminPreferencesService({
    store: createAdminPreferencesStore(createServerSupabaseClient()),
  })
}
