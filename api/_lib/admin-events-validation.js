const EVENT_TYPES = new Set(['workshop', 'competition', 'conference', 'open_day', 'hackathon', 'meeting', 'training', 'other'])
const CREATION_EVENT_TYPES = new Set(['workshop'])
const EVENT_STATUSES = new Set(['draft', 'planned', 'registration_open', 'registration_closed', 'ongoing', 'completed', 'cancelled', 'archived'])
const CREATION_STATUSES = new Set(['draft', 'planned'])
const TYPE_FILTERS = new Set(['workshop', 'competition', 'conference', 'other'])
const STATUS_FILTERS = new Set(['upcoming', 'ongoing', 'completed', 'cancelled'])
const SORTS = new Set([
  'starts_asc', 'starts_desc', 'created_asc', 'created_desc', 'title_asc', 'title_desc',
  'type_asc', 'type_desc', 'location_asc', 'location_desc', 'status_asc', 'status_desc',
  'speaker_asc', 'speaker_desc', 'invited_asc', 'invited_desc', 'present_asc', 'present_desc',
])
// Attendance is read from club_event_registrations: present (checked in),
// not checked in yet, explicitly absent after finalize, or cancelled.
const ATTENDANCE_STATUSES = new Set(['present', 'not_checked_in', 'absent', 'cancelled'])
const INVITATION_SCOPES = new Set(['all_member_applicants'])
const SCANNER_ACTIONS = new Set(['generate', 'copy', 'regenerate', 'revoke'])
const EVENT_TRANSITIONS = new Set(['planned', 'registration_open', 'registration_closed', 'ongoing', 'completed', 'cancelled', 'archived'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const single = (params, name) => {
  const values = params.getAll(name)
  return values.length <= 1 ? (values[0] || '').trim() : null
}
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max
const TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|([+-])(\d{2}):(\d{2}))$/
const validTimestamp = (value) => {
  if (typeof value !== 'string') return false
  const match = value.trim().match(TIMESTAMP_RE)
  if (!match) return false
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', fraction = '', zone, sign, offsetHourText = '0', offsetMinuteText = '0'] = match
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText].map(Number)
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] = parts
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59 || offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return false
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return false
  const milliseconds = Number((fraction + '000').slice(0, 3))
  const offset = zone === 'Z' ? 0 : (sign === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute)
  return Number.isFinite(Date.parse(value)) && Date.parse(value) === Date.UTC(year, month - 1, day, hour, minute, second, milliseconds) - offset * 60_000
}
const MAX_SPEAKERS = 8
// Facilitators arrive as a list (speakerNames); a lone speakerName string is
// still accepted as a one-person list. Returns null when the list is invalid.
function speakerList(body) {
  const raw = body.speakerNames !== undefined ? body.speakerNames : [body.speakerName]
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SPEAKERS) return null
  if (raw.some((name) => typeof name !== 'string')) return null
  const names = raw.map((name) => name.replace(/\s+/g, ' ').trim())
  if (names.some((name) => name.length < 2 || name.length > 120)) return null
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) return null
  return names
}

export const isEventId = (value) => UUID_RE.test(String(value || ''))

export function parseEventListOptions(params) {
  const raw = Object.fromEntries(['q', 'type', 'status', 'sort'].map((key) => [key, single(params, key)]))
  if (Object.values(raw).some((value) => value === null)) return { ok: false }
  const pageText = single(params, 'page') || '1'
  const limitText = single(params, 'limit') || '12'
  if (!/^\d+$/.test(pageText) || !/^\d+$/.test(limitText)) return { ok: false }
  const page = Number(pageText)
  const limit = Number(limitText)
  const sort = raw.sort || 'starts_desc'
  if (page < 1 || page > 100000 || limit < 1 || limit > 50) return { ok: false }
  if (raw.q.length > 100) return { ok: false }
  if (raw.type && !TYPE_FILTERS.has(raw.type)) return { ok: false }
  if (raw.status && !STATUS_FILTERS.has(raw.status)) return { ok: false }
  if (!SORTS.has(sort)) return { ok: false }
  return { ok: true, value: { ...raw, page, limit, sort } }
}

export function parseEventParticipantOptions(params) {
  const q = single(params, 'q')
  const pageText = single(params, 'page') || '1'
  const limitText = single(params, 'limit') || '50'
  if (q === null || !/^\d+$/.test(pageText) || !/^\d+$/.test(limitText)) return { ok: false }
  const page = Number(pageText)
  const limit = Number(limitText)
  if (page < 1 || page > 100000 || limit < 1 || limit > 100 || q.length > 100) return { ok: false }
  return { ok: true, value: { q, page, limit } }
}

export function parseEventAttendanceOptions(params) {
  const raw = Object.fromEntries(['status'].map((key) => [key, single(params, key)]))
  if (Object.values(raw).some((value) => value === null)) return { ok: false }
  const pageText = single(params, 'page') || '1'
  const limitText = single(params, 'limit') || '50'
  if (!/^\d+$/.test(pageText) || !/^\d+$/.test(limitText)) return { ok: false }
  const page = Number(pageText)
  const limit = Number(limitText)
  if (page < 1 || page > 100000 || limit < 1 || limit > 50) return { ok: false }
  if (raw.status && !ATTENDANCE_STATUSES.has(raw.status)) return { ok: false }
  return { ok: true, value: { ...raw, page, limit } }
}

export function validateEventCreateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  if (!CREATION_EVENT_TYPES.has(body.eventType)) return { ok: false }
  if (!text(body.title, 3, 160) || !text(body.location, 2, 160)) return { ok: false }
  if (!validTimestamp(body.startsAt)) return { ok: false }
  const startsAt = new Date(body.startsAt).toISOString()
  let endsAt
  if (body.endsAt !== undefined && body.endsAt !== null && String(body.endsAt).trim() !== '') {
    if (!validTimestamp(body.endsAt)) return { ok: false }
    endsAt = new Date(body.endsAt).toISOString()
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return { ok: false }
  }
  const speakerNames = speakerList(body)
  if (!speakerNames) return { ok: false }
  if (body.status !== undefined && !CREATION_STATUSES.has(body.status)) return { ok: false }
  return {
    ok: true,
    value: {
      eventType: body.eventType,
      title: body.title.trim(),
      startsAt,
      endsAt,
      location: body.location.trim(),
      speakerNames,
      speakerName: speakerNames.join(', '),
      status: body.status || 'planned',
    },
  }
}

export function validateEventUpdateBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  if (!CREATION_EVENT_TYPES.has(body.eventType)) return { ok: false }
  if (!text(body.title, 3, 160) || !text(body.location, 2, 160)) return { ok: false }
  if (!validTimestamp(body.startsAt) || !validTimestamp(body.expectedUpdatedAt)) return { ok: false }
  const startsAt = new Date(body.startsAt).toISOString()
  let endsAt
  if (body.endsAt !== undefined && body.endsAt !== null && String(body.endsAt).trim() !== '') {
    if (!validTimestamp(body.endsAt)) return { ok: false }
    endsAt = new Date(body.endsAt).toISOString()
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) return { ok: false }
  }
  const speakerNames = speakerList(body)
  if (!speakerNames) return { ok: false }
  if (body.status !== undefined && !EVENT_STATUSES.has(body.status)) return { ok: false }
  return {
    ok: true,
    value: {
      payload: {
        eventType: body.eventType,
        title: body.title.trim(),
        startsAt,
        endsAt,
        location: body.location.trim(),
        speakerNames,
        speakerName: speakerNames.join(', '),
        status: body.status,
      },
      expectedUpdatedAt: new Date(body.expectedUpdatedAt).toISOString(),
    },
  }
}

export function validateEventInviteBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  const hasIds = Array.isArray(body.applicationIds)
  const hasScope = typeof body.scope === 'string' && body.scope.trim() !== ''
  if (hasIds && hasScope) return { ok: false }
  if (hasIds) {
    if (body.applicationIds.length < 1 || body.applicationIds.length > 500) return { ok: false }
    if (body.applicationIds.some((id) => !isEventId(id))) return { ok: false }
    const ids = [...new Set(body.applicationIds)]
    if (ids.length !== body.applicationIds.length) return { ok: false }
    return { ok: true, value: { applicationIds: ids } }
  }
  if (!hasScope || !INVITATION_SCOPES.has(body.scope)) return { ok: false }
  return { ok: true, value: { scope: body.scope } }
}

export function validateEventInvitationExportBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.confirm !== true) return { ok: false }
  return { ok: true, value: { confirm: true } }
}

export function validateEventInvitationLinkBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  if (body.action === 'reveal') return { ok: true, value: { action: 'ensure' } }
  if (body.action === 'regenerate' && body.confirm === true) return { ok: true, value: { action: 'regenerate' } }
  return { ok: false }
}

export function validateEventScannerActionBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  if (!SCANNER_ACTIONS.has(body.action)) return { ok: false }
  if ((body.action === 'regenerate' || body.action === 'revoke') && body.confirm !== true) return { ok: false }
  return { ok: true, value: { action: body.action } }
}

export function validateEventTransitionBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !EVENT_TRANSITIONS.has(body.nextStatus) || !validTimestamp(body.expectedUpdatedAt)) return { ok: false }
  return { ok: true, value: { nextStatus: body.nextStatus, expectedUpdatedAt: new Date(body.expectedUpdatedAt).toISOString() } }
}

export function validateEventAttendanceFinalizeBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.confirm !== true) return { ok: false }
  return { ok: true, value: { confirm: true } }
}
