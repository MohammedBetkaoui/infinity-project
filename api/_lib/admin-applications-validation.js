const STATUSES = new Set(['new', 'in_review', 'interview', 'accepted', 'declined', 'archived'])
const TYPES = new Set(['member', 'staff'])
const STUDY_YEARS = new Set(['L1', 'L2', 'L3', 'M1', 'M2', 'E1', 'E2', 'E3', 'E4', 'E5', 'other'])
const EXPERIENCE = new Set(['starting', 'learning', 'building'])
const AVAILABILITY = new Set(['weekly', 'events', 'flexible'])
const SORTS = new Set([
  'submitted_desc', 'submitted_asc', 'updated_desc', 'updated_asc',
  'name_asc', 'name_desc', 'type_asc', 'type_desc', 'level_asc', 'level_desc',
  'track_asc', 'track_desc', 'availability_asc', 'availability_desc',
  'status_asc', 'status_desc',
])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const single = (params, name) => {
  const values = params.getAll(name)
  return values.length <= 1 ? (values[0] || '').trim() : null
}

const boundedText = (value, max) => typeof value === 'string' && value.trim().length <= max

export const isApplicationId = (value) => UUID_RE.test(String(value || ''))

export function parseApplicationListOptions(params) {
  const raw = Object.fromEntries([
    'q', 'status', 'type', 'studyYear', 'speciality', 'track', 'experience',
    'availability', 'dateFrom', 'dateTo', 'sort',
  ].map((key) => [key, single(params, key)]))
  if (Object.values(raw).some((value) => value === null)) return { ok: false }

  const pageText = single(params, 'page') || '1'
  const limitText = single(params, 'limit') || '25'
  if (!/^\d+$/.test(pageText) || !/^\d+$/.test(limitText)) return { ok: false }
  const page = Number(pageText)
  const limit = Number(limitText)
  if (page < 1 || page > 100000 || limit < 1 || limit > 50) return { ok: false }
  if (raw.q.length > 100 || raw.speciality.length > 120 || raw.track.length > 120) return { ok: false }
  if (raw.status && !STATUSES.has(raw.status)) return { ok: false }
  if (raw.type && !TYPES.has(raw.type)) return { ok: false }
  if (raw.studyYear && !STUDY_YEARS.has(raw.studyYear)) return { ok: false }
  if (raw.experience && !EXPERIENCE.has(raw.experience)) return { ok: false }
  if (raw.availability && !AVAILABILITY.has(raw.availability)) return { ok: false }
  if (raw.dateFrom && !DATE_RE.test(raw.dateFrom)) return { ok: false }
  if (raw.dateTo && !DATE_RE.test(raw.dateTo)) return { ok: false }
  const sort = raw.sort || 'submitted_desc'
  if (!SORTS.has(sort)) return { ok: false }

  return { ok: true, value: { ...raw, page, limit, sort } }
}

export function validateApplicationActionBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  if (typeof body.action !== 'string' || !boundedText(body.reason || '', 2000)) return { ok: false }
  if (typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) return { ok: false }
  if (body.payload !== undefined && (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload))) return { ok: false }
  return {
    ok: true,
    value: {
      action: body.action,
      expectedUpdatedAt: body.expectedUpdatedAt,
      reason: typeof body.reason === 'string' ? body.reason : '',
      payload: body.payload || {},
    },
  }
}

export function validateApplicationBulkBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  if (!['start_review', 'decline', 'archive'].includes(body.action)) return { ok: false }
  if (!boundedText(body.reason || '', 2000)) return { ok: false }
  if (!Array.isArray(body.records) || body.records.length < 1 || body.records.length > 50) return { ok: false }
  const records = body.records.map((record) => ({
    id: record?.id,
    expectedUpdatedAt: record?.expectedUpdatedAt,
  }))
  if (records.some((record) => !isApplicationId(record.id) || !Number.isFinite(Date.parse(record.expectedUpdatedAt)))) return { ok: false }
  if (new Set(records.map((record) => record.id)).size !== records.length) return { ok: false }
  return { ok: true, value: { action: body.action, reason: typeof body.reason === 'string' ? body.reason : '', records } }
}
