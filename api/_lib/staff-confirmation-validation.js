const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STATUSES = new Set(['invited', 'submitted', 'revision_requested', 'confirmed', 'revoked', 'expired'])
const DEPARTMENTS = new Set(['dev-tech', 'design-content', 'management-logistics'])
const SORTS = new Set(['invited_desc', 'invited_asc', 'submitted_desc', 'submitted_asc', 'name_asc', 'name_desc', 'status_asc', 'status_desc'])

const single = (params, name) => {
  const values = params.getAll(name)
  return values.length <= 1 ? (values[0] || '').trim() : null
}

export function normalizeMotivation(value) {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : ''
}

export function motivationLength(value) {
  return [...value].length
}

export function validateStaffConfirmationVerifyBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  if (Object.keys(body).length !== 1 || typeof body.token !== 'string') return { ok: false }
  return { ok: true, value: { token: body.token } }
}

export function validateStaffConfirmationSubmitBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  if (!Object.keys(body).every((key) => ['token', 'motivation'].includes(key)) || Object.keys(body).length !== 2) return { ok: false }
  if (typeof body.token !== 'string') return { ok: false }
  const motivation = normalizeMotivation(body.motivation)
  const length = motivationLength(motivation)
  if (length < 150 || length > 2000) return { ok: false, field: 'motivation' }
  return { ok: true, value: { token: body.token, motivation } }
}

export function parseStaffConfirmationListOptions(params) {
  const raw = Object.fromEntries(['q', 'status', 'department', 'sort'].map((key) => [key, single(params, key)]))
  if (Object.values(raw).some((value) => value === null)) return { ok: false }
  const pageText = single(params, 'page') || '1'
  const limitText = single(params, 'limit') || '25'
  if (!/^\d+$/.test(pageText) || !/^\d+$/.test(limitText)) return { ok: false }
  const page = Number(pageText)
  const limit = Number(limitText)
  if (page < 1 || page > 100000 || limit < 1 || limit > 50 || raw.q.length > 100) return { ok: false }
  if (raw.status && !STATUSES.has(raw.status)) return { ok: false }
  if (raw.department && !DEPARTMENTS.has(raw.department)) return { ok: false }
  const sort = raw.sort || 'submitted_desc'
  if (!SORTS.has(sort)) return { ok: false }
  return { ok: true, value: { ...raw, page, limit, sort } }
}

export function isStaffConfirmationRecordId(value) {
  return UUID_RE.test(String(value || ''))
}
