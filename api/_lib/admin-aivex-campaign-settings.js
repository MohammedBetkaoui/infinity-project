import { createServerSupabaseClient } from './aivex-server.js'
import {
  AIVEX_BUSINESS_TIME_ZONE, campaignStatusFor, formatAlgiersTimestamp, parseAlgiersTimestamp,
} from '../../shared/aivex/campaign-schedule.js'

const CAMPAIGN_COLUMNS = [
  'edition', 'registration_enabled', 'registration_open_at', 'registration_close_at',
  'signed_document_deadline',
].join(', ')

const UPDATE_KEYS = Object.freeze([
  'registrationEnabled', 'registrationOpenAt', 'registrationCloseAt', 'signedDocumentDeadline',
])

const fail = (stage, error) => {
  throw Object.assign(new Error(stage), {
    stage,
    code: error?.code || error?.statusCode || error?.status || 'database_error',
  })
}

const firstRow = (data) => Array.isArray(data) ? data[0] : data

export function validateAivexCampaignSettingsBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Invalid campaign settings.' }
  }
  const keys = Object.keys(body).sort()
  if (keys.length !== UPDATE_KEYS.length || UPDATE_KEYS.some((key) => !keys.includes(key))) {
    return { ok: false, message: 'Only registration campaign settings may be updated.' }
  }
  if (typeof body.registrationEnabled !== 'boolean') {
    return { ok: false, field: 'registrationEnabled', message: 'Registration enabled must be true or false.' }
  }

  const opens = parseAlgiersTimestamp(body.registrationOpenAt)
  const closes = parseAlgiersTimestamp(body.registrationCloseAt)
  const signedDeadline = parseAlgiersTimestamp(body.signedDocumentDeadline)
  if (!opens) return { ok: false, field: 'registrationOpenAt', message: 'Enter a valid opening date and time in Africa/Algiers.' }
  if (!closes) return { ok: false, field: 'registrationCloseAt', message: 'Enter a valid closing date and time in Africa/Algiers.' }
  if (!signedDeadline) return { ok: false, field: 'signedDocumentDeadline', message: 'Enter a valid signed-document deadline in Africa/Algiers.' }
  if (closes.getTime() <= opens.getTime()) {
    return { ok: false, field: 'registrationCloseAt', message: 'Registration closing must be after registration opening.' }
  }
  if (signedDeadline.getTime() < closes.getTime()) {
    return { ok: false, field: 'signedDocumentDeadline', message: 'The signed-document deadline cannot be earlier than registration closing.' }
  }

  return {
    ok: true,
    value: {
      registrationEnabled: body.registrationEnabled,
      registrationOpenAt: formatAlgiersTimestamp(opens),
      registrationCloseAt: formatAlgiersTimestamp(closes),
      signedDocumentDeadline: formatAlgiersTimestamp(signedDeadline),
    },
  }
}

export function safeAivexCampaignSettings(row, now = new Date()) {
  if (!row) return null
  const settings = {
    registrationEnabled: row.registration_enabled === true,
    registrationOpenAt: formatAlgiersTimestamp(row.registration_open_at) || null,
    registrationCloseAt: formatAlgiersTimestamp(row.registration_close_at) || null,
  }
  const phase = campaignStatusFor(settings, now)
  return {
    edition: Number(row.edition),
    ...settings,
    signedDocumentDeadline: formatAlgiersTimestamp(row.signed_document_deadline) || null,
    timeZone: AIVEX_BUSINESS_TIME_ZONE,
    status: phase === 'not_open' ? 'scheduled' : phase,
  }
}

export function createAdminAivexCampaignSettingsStore(supabase) {
  if (!supabase) {
    throw Object.assign(new Error('admin_aivex_campaign_store_unavailable'), {
      stage: 'configuration', code: 'configuration_error',
    })
  }
  return {
    async get(edition) {
      const { data, error } = await supabase.from('aivex_settings').select(CAMPAIGN_COLUMNS).eq('edition', edition).maybeSingle()
      if (error) fail('aivex_campaign_settings_get', error)
      return data
    },

    async update(edition, input, adminUserId, now) {
      const { data, error } = await supabase.rpc('admin_update_aivex_campaign_settings', {
        p_admin_user_id: adminUserId,
        p_edition: edition,
        p_registration_enabled: input.registrationEnabled,
        p_registration_open_at: input.registrationOpenAt,
        p_registration_close_at: input.registrationCloseAt,
        p_signed_document_deadline: input.signedDocumentDeadline,
        p_now: now.toISOString(),
      })
      if (error) fail('aivex_campaign_settings_update', error)
      return firstRow(data)
    },
  }
}

export function createAdminAivexCampaignSettingsService({ store, now = () => new Date() } = {}) {
  if (!store) {
    throw Object.assign(new Error('admin_aivex_campaign_service_unavailable'), {
      stage: 'configuration', code: 'configuration_error',
    })
  }
  const authorised = (user) => user?.role === 'super_admin'
  return {
    async get(edition, user) {
      if (!authorised(user)) return { ok: false, status: 403 }
      return { ok: true, settings: safeAivexCampaignSettings(await store.get(edition), now()) }
    },
    async update(edition, input, user) {
      if (!authorised(user)) return { ok: false, status: 403 }
      const clock = now()
      const row = await store.update(edition, input, user.id, clock)
      return { ok: true, settings: safeAivexCampaignSettings(row, clock) }
    },
  }
}

export function createServerAdminAivexCampaignSettingsService() {
  const supabase = createServerSupabaseClient()
  return createAdminAivexCampaignSettingsService({
    store: createAdminAivexCampaignSettingsStore(supabase),
  })
}
