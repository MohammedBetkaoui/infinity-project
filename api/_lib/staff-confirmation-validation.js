import { validateStaffWorkLinks } from '../../shared/membership/staff-work-links.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SUBMIT_FIELDS = new Set(['token', 'motivation', 'workLinks'])
const STATUSES = new Set(['not_invited', 'invited', 'submitted', 'revision_requested', 'confirmed', 'revoked', 'expired'])
const DEPARTMENTS = new Set(['dev-tech', 'design-content', 'management-logistics'])
const LINK_ACCESS = new Set(['active', 'blocked', 'legacy', 'none'])
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

// `workLinks` is optional (missing means none); any other field is refused.
export function validateStaffConfirmationSubmitBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  const keys = Object.keys(body)
  if (!keys.every((key) => SUBMIT_FIELDS.has(key)) || !keys.includes('token') || !keys.includes('motivation')) return { ok: false }
  if (typeof body.token !== 'string') return { ok: false }
  const motivation = normalizeMotivation(body.motivation)
  const length = motivationLength(motivation)
  if (length < 150 || length > 2000) return { ok: false, field: 'motivation' }
  const workLinks = validateStaffWorkLinks(body.workLinks)
  if (!workLinks.ok) return { ok: false, field: 'workLinks', errors: workLinks.errors }
  return { ok: true, value: { token: body.token, motivation, workLinks: workLinks.value } }
}

export function parseStaffConfirmationListOptions(params) {
  const raw = Object.fromEntries(['q', 'status', 'linkAccess', 'department', 'sort'].map((key) => [key, single(params, key)]))
  if (Object.values(raw).some((value) => value === null)) return { ok: false }
  const pageText = single(params, 'page') || '1'
  const limitText = single(params, 'limit') || '25'
  if (!/^\d+$/.test(pageText) || !/^\d+$/.test(limitText)) return { ok: false }
  const page = Number(pageText)
  const limit = Number(limitText)
  if (page < 1 || page > 100000 || limit < 1 || limit > 50 || raw.q.length > 100) return { ok: false }
  if (raw.status && !STATUSES.has(raw.status)) return { ok: false }
  if (raw.linkAccess && !LINK_ACCESS.has(raw.linkAccess)) return { ok: false }
  if (raw.department && !DEPARTMENTS.has(raw.department)) return { ok: false }
  const sort = raw.sort || 'submitted_desc'
  if (!SORTS.has(sort)) return { ok: false }
  return { ok: true, value: { ...raw, page, limit, sort } }
}

export function validateStaffLinkRevealBody(body) {
  return body && typeof body === 'object' && !Array.isArray(body)
    && Object.keys(body).length === 1 && body.action === 'reveal'
    ? { ok: true, value: { action: 'reveal' } }
    : { ok: false }
}

export function validateStaffLinkExportBody(body, { preflight = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  const keys = Object.keys(body)
  if (body.scope !== 'all') return { ok: false }
  if (preflight) return keys.length === 1 ? { ok: true, value: { scope: 'all' } } : { ok: false }
  if (keys.length !== 2 || body.convertLegacy !== true) return { ok: false }
  return { ok: true, value: { scope: 'all', convertLegacy: true } }
}

export function isStaffConfirmationRecordId(value) {
  return UUID_RE.test(String(value || ''))
}
