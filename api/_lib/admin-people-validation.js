const KINDS = new Set(['members', 'staff'])
const STUDY_YEARS = new Set(['L1', 'L2', 'L3', 'M1', 'M2', 'E1', 'E2', 'E3', 'E4', 'E5', 'other'])
const AVAILABILITY = new Set(['weekly', 'events', 'flexible'])
const DEPARTMENTS = new Set(['dev-tech', 'design-content', 'management-logistics'])
const STATUSES = Object.freeze({
  members: new Set(['active', 'on_pause', 'inactive', 'alumni', 'archived']),
  staff: new Set(['active', 'on_pause', 'inactive', 'archived']),
})
const SORTS = new Set([
  'joined_desc', 'joined_asc', 'updated_desc', 'updated_asc', 'name_asc', 'name_desc',
  'status_asc', 'status_desc', 'structure_asc', 'structure_desc', 'level_asc', 'level_desc',
  'availability_asc', 'availability_desc',
])
const ACTIONS = Object.freeze({
  members: new Set(['update_profile', 'change_pole', 'promote_to_staff', 'set_status', 'add_note']),
  staff: new Set(['assign_role', 'move_department', 'assign_project', 'change_availability', 'set_status', 'add_note']),
})
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const single = (params, name) => {
  const values = params.getAll(name)
  return values.length <= 1 ? (values[0] || '').trim() : null
}
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max
const validDate = (value) => {
  if (!DATE_RE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export const isPeopleKind = (value) => KINDS.has(value)
export const isPeopleProfileId = (value) => UUID_RE.test(String(value || ''))

export function parsePeopleListOptions(params, kind) {
  if (!isPeopleKind(kind)) return { ok: false }
  const raw = Object.fromEntries(['q', 'status', 'studyYear', 'speciality', 'structure', 'availability', 'dateFrom', 'dateTo', 'sort']
    .map((key) => [key, single(params, key)]))
  if (Object.values(raw).some((value) => value === null)) return { ok: false }
  const pageText = single(params, 'page') || '1'
  const limitText = single(params, 'limit') || '12'
  if (!/^\d+$/.test(pageText) || !/^\d+$/.test(limitText)) return { ok: false }
  const page = Number(pageText)
  const limit = Number(limitText)
  const sort = raw.sort || 'joined_desc'
  if (page < 1 || page > 100000 || limit < 1 || limit > 50) return { ok: false }
  if (raw.q.length > 100 || raw.speciality.length > 160 || raw.structure.length > 120) return { ok: false }
  if (raw.status && !STATUSES[kind].has(raw.status)) return { ok: false }
  if (raw.studyYear && !STUDY_YEARS.has(raw.studyYear)) return { ok: false }
  if (raw.availability && !AVAILABILITY.has(raw.availability)) return { ok: false }
  if (raw.dateFrom && !validDate(raw.dateFrom)) return { ok: false }
  if (raw.dateTo && !validDate(raw.dateTo)) return { ok: false }
  if (!SORTS.has(sort)) return { ok: false }
  return { ok: true, value: { ...raw, page, limit, sort } }
}

export function validatePeopleCreateBody(body, kind) {
  if (!isPeopleKind(kind) || !body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  if (!text(body.fullName, 3, 120) || !text(body.email, 3, 254) || !EMAIL_RE.test(body.email.trim())) return { ok: false }
  if (body.phone && !text(body.phone, 6, 32)) return { ok: false }
  if (!STUDY_YEARS.has(body.studyYear) || !text(body.speciality, 2, 160) || !AVAILABILITY.has(body.availability)) return { ok: false }
  if (kind === 'members' && !text(body.pole, 2, 120)) return { ok: false }
  if (kind === 'staff' && (!DEPARTMENTS.has(body.department) || !text(body.role, 2, 120))) return { ok: false }
  if (body.joinedAt && !validDate(body.joinedAt)) return { ok: false }
  if (body.cohort && !/^\d{4}\/\d{2}$/.test(body.cohort)) return { ok: false }
  return { ok: true, value: {
    fullName: body.fullName.trim(), email: body.email.trim().toLowerCase(), phone: String(body.phone || '').trim(),
    studyYear: body.studyYear, speciality: body.speciality.trim(), availability: body.availability,
    pole: kind === 'members' ? body.pole.trim() : undefined,
    department: kind === 'staff' ? body.department : undefined,
    role: kind === 'staff' ? body.role.trim() : undefined,
    joinedAt: body.joinedAt || undefined, cohort: body.cohort || undefined,
  } }
}

export function validatePeopleActionBody(body, kind) {
  if (!isPeopleKind(kind) || !body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  if (!ACTIONS[kind].has(body.action) || typeof body.expectedUpdatedAt !== 'string' || !Number.isFinite(Date.parse(body.expectedUpdatedAt))) return { ok: false }
  if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.trim().length > 2000)) return { ok: false }
  if (body.payload !== undefined && (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload))) return { ok: false }
  const payload = body.payload || {}
  if (body.action === 'set_status' && !STATUSES[kind].has(payload.status)) return { ok: false }
  if (body.action === 'change_pole' && !text(payload.pole, 2, 120)) return { ok: false }
  if (body.action === 'promote_to_staff' && (!DEPARTMENTS.has(payload.department) || !text(payload.role, 2, 120))) return { ok: false }
  if (body.action === 'move_department' && !DEPARTMENTS.has(payload.department)) return { ok: false }
  if (body.action === 'assign_role' && !text(payload.role, 2, 120)) return { ok: false }
  if (body.action === 'assign_project' && !text(payload.project, 2, 160)) return { ok: false }
  if (body.action === 'change_availability' && !AVAILABILITY.has(payload.availability)) return { ok: false }
  if (body.action === 'add_note' && !text(payload.note, 1, 4000)) return { ok: false }
  if (body.action === 'update_profile' && (!text(payload.fullName, 3, 120) || !text(payload.email, 3, 254) || !EMAIL_RE.test(payload.email.trim()) || (payload.phone && !text(payload.phone, 6, 32)) || !STUDY_YEARS.has(payload.studyYear) || !text(payload.speciality, 2, 160))) return { ok: false }
  return { ok: true, value: { action: body.action, expectedUpdatedAt: body.expectedUpdatedAt, reason: String(body.reason || '').trim(), payload } }
}

export function validatePeopleBulkBody(body, kind) {
  if (!isPeopleKind(kind) || !body || body.action !== 'set_status' || !STATUSES[kind].has(body.payload?.status)) return { ok: false }
  if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.trim().length > 2000)) return { ok: false }
  if (!Array.isArray(body.records) || body.records.length < 1 || body.records.length > 50) return { ok: false }
  const records = body.records.map((record) => ({ id: record?.id, expectedUpdatedAt: record?.expectedUpdatedAt }))
  if (records.some((record) => !isPeopleProfileId(record.id) || !Number.isFinite(Date.parse(record.expectedUpdatedAt)))) return { ok: false }
  if (new Set(records.map((record) => record.id)).size !== records.length) return { ok: false }
  return { ok: true, value: { action: 'set_status', payload: { status: body.payload.status }, reason: String(body.reason || '').trim().slice(0, 2000), records } }
}
