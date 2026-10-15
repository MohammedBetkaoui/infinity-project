const OBJECT_TYPES = new Set([
  'join_application', 'aivex_registration', 'aivex_document',
  'club_member', 'club_staff', 'aivex_settings', 'staff_link_export',
])
const SENSITIVITIES = new Set(['standard', 'confidential'])
const SORTS = new Set([
  'created_desc', 'created_asc', 'action_asc', 'action_desc',
  'actor_asc', 'actor_desc', 'object_asc', 'object_desc',
  'subject_asc', 'subject_desc', 'sensitivity_asc', 'sensitivity_desc',
])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ACTION_RE = /^[a-z][a-z0-9_]{1,79}$/

const single = (params, name) => {
  const values = params.getAll(name)
  return values.length <= 1 ? (values[0] || '').trim() : null
}

const validDate = (value) => {
  if (!DATE_RE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

export function parseActivityListOptions(params) {
  const raw = Object.fromEntries(
    ['q', 'actor', 'objectType', 'action', 'sensitivity', 'dateFrom', 'dateTo', 'sort']
      .map((key) => [key, single(params, key)]),
  )
  if (Object.values(raw).some((value) => value === null)) return { ok: false }

  const pageText = single(params, 'page') || '1'
  const limitText = single(params, 'limit') || '12'
  if (!/^\d+$/.test(pageText) || !/^\d+$/.test(limitText)) return { ok: false }

  const page = Number(pageText)
  const limit = Number(limitText)
  const sort = raw.sort || 'created_desc'
  if (page < 1 || page > 100000 || limit < 1 || limit > 50) return { ok: false }
  if (raw.q.length > 120 || raw.actor.length > 120) return { ok: false }
  if (raw.objectType && !OBJECT_TYPES.has(raw.objectType)) return { ok: false }
  if (raw.action && !ACTION_RE.test(raw.action)) return { ok: false }
  if (raw.sensitivity && !SENSITIVITIES.has(raw.sensitivity)) return { ok: false }
  if (raw.dateFrom && !validDate(raw.dateFrom)) return { ok: false }
  if (raw.dateTo && !validDate(raw.dateTo)) return { ok: false }
  if (raw.dateFrom && raw.dateTo && raw.dateFrom > raw.dateTo) return { ok: false }
  if (!SORTS.has(sort)) return { ok: false }

  return { ok: true, value: { ...raw, page, limit, sort } }
}
