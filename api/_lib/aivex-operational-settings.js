// Authoritative campaign gates. The frontend may mirror these states for UX,
// but only these server-side decisions authorize registration/upload work.

export const AIVEX_TIME_ZONE = 'Africa/Algiers'

const SETTINGS_COLUMNS = [
  'edition', 'registration_enabled', 'registration_open_at', 'registration_close_at',
  'document_upload_enabled', 'signed_document_deadline',
].join(', ')

const instant = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function normalizeOperationalSettings(row) {
  if (!row) return null
  return {
    edition: Number(row.edition),
    registrationEnabled: row.registration_enabled === true,
    registrationOpenAt: instant(row.registration_open_at),
    registrationCloseAt: instant(row.registration_close_at),
    documentUploadEnabled: row.document_upload_enabled === true,
    signedDocumentDeadline: instant(row.signed_document_deadline),
  }
}

export async function loadAivexOperationalSettings(supabase, edition) {
  const { data, error } = await supabase.from('aivex_settings').select(SETTINGS_COLUMNS).eq('edition', edition).maybeSingle()
  if (error) throw Object.assign(new Error('settings_load_failed'), { stage: 'settings', code: error.code })
  return normalizeOperationalSettings(data)
}

export function canRegister(settings, now = new Date()) {
  if (!settings || !settings.registrationEnabled) return { ok: false, status: 'registration_disabled' }
  if (!settings.registrationOpenAt || !settings.registrationCloseAt) return { ok: false, status: 'registration_disabled' }
  const timestamp = now.getTime()
  if (timestamp < settings.registrationOpenAt.getTime()) return { ok: false, status: 'registration_not_open' }
  if (timestamp > settings.registrationCloseAt.getTime()) return { ok: false, status: 'registration_closed' }
  return { ok: true }
}

export function canUploadSignedDocument(settings, now = new Date()) {
  if (!settings || !settings.documentUploadEnabled) return { ok: false, status: 'document_upload_disabled' }
  if (!settings.signedDocumentDeadline) return { ok: false, status: 'document_upload_disabled' }
  if (now.getTime() > settings.signedDocumentDeadline.getTime()) return { ok: false, status: 'document_upload_closed' }
  return { ok: true }
}
