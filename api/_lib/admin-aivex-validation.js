import { REGISTRATION_REFERENCE_PATTERN } from './aivex-reference.js'
import { ADMIN_AIVEX_ACTIONS } from './admin-aivex-permissions.js'
import {
  DOCUMENT_STATUSES as AIVEX_DOCUMENT_STATUSES,
  REGISTRATION_STATUSES as AIVEX_REGISTRATION_STATUSES,
} from '../../shared/aivex/contract-v4.js'

const REGISTRATION_STATUSES = new Set(AIVEX_REGISTRATION_STATUSES)
const DOCUMENT_STATUSES = new Set(AIVEX_DOCUMENT_STATUSES)
const SORTS = new Set([
  'attention_asc', 'completion_asc', 'completion_desc', 'reference_asc', 'reference_desc',
  'team_asc', 'team_desc', 'institution_asc', 'institution_desc', 'wilaya_asc', 'wilaya_desc',
  'registration_asc', 'registration_desc', 'document_asc', 'document_desc',
  'submitted_asc', 'submitted_desc', 'updated_asc', 'updated_desc',
])
const COMPLETENESS = new Set(['complete', 'incomplete'])
const PRESENCE = new Set(['present', 'absent'])
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DOCUMENT_KEY_RE = /^(official|student-[1-3]|delegation-leader|driver|signed-v[1-9][0-9]*)$/
const CORRECTION_ITEMS = new Set([
  'Team information', 'Activities manager', 'Delegation leader ID', 'Driver ID',
  'Student card 01', 'Student card 02', 'Student card 03', 'Signed and stamped form',
])

const single = (params, name) => {
  const values = params.getAll(name)
  return values.length <= 1 ? (values[0] || '').trim() : null
}

const bounded = (value, max, { required = false } = {}) => typeof value === 'string'
  && value.length <= max && (!required || value.trim().length > 0)

export const isAivexReference = (value) => REGISTRATION_REFERENCE_PATTERN.test(String(value || ''))
export const isAivexDocumentKey = (value) => DOCUMENT_KEY_RE.test(String(value || ''))

export function parseAivexListOptions(params) {
  const raw = Object.fromEntries([
    'q', 'registration', 'document', 'wilaya', 'institution', 'complete',
    'signed', 'dateFrom', 'dateTo', 'edition', 'sort',
  ].map((key) => [key, single(params, key)]))
  if (Object.values(raw).some((value) => value === null)) return { ok: false }

  const pageText = single(params, 'page') || '1'
  const limitText = single(params, 'limit') || '12'
  if (!/^\d+$/.test(pageText) || !/^\d+$/.test(limitText)) return { ok: false }
  const page = Number(pageText)
  const limit = Number(limitText)
  if (page < 1 || page > 100000 || limit < 1 || limit > 50) return { ok: false }
  if (raw.q.length > 120 || raw.wilaya.length > 120 || raw.institution.length > 180) return { ok: false }
  if (raw.registration && !REGISTRATION_STATUSES.has(raw.registration)) return { ok: false }
  if (raw.document && !DOCUMENT_STATUSES.has(raw.document)) return { ok: false }
  if (raw.complete && !COMPLETENESS.has(raw.complete)) return { ok: false }
  if (raw.signed && !PRESENCE.has(raw.signed)) return { ok: false }
  if (raw.dateFrom && !DATE_RE.test(raw.dateFrom)) return { ok: false }
  if (raw.dateTo && !DATE_RE.test(raw.dateTo)) return { ok: false }
  if (raw.edition && (!/^\d{1,2}$/.test(raw.edition) || Number(raw.edition) < 1)) return { ok: false }
  const sort = raw.sort || 'attention_asc'
  if (!SORTS.has(sort)) return { ok: false }
  return { ok: true, value: { ...raw, edition: raw.edition ? Number(raw.edition) : 2, page, limit, sort } }
}

export function validateAivexActionBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  if (!ADMIN_AIVEX_ACTIONS.includes(body.action)) return { ok: false }
  if (!Number.isFinite(Date.parse(body.expectedUpdatedAt))) return { ok: false }
  if (!bounded(body.reason, 2000, { required: true })) return { ok: false }
  const payload = body.payload === undefined ? {} : body.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false }
  if (JSON.stringify(payload).length > 8192) return { ok: false }

  if (body.action === 'verify_activity_official' && typeof payload.verified !== 'boolean') return { ok: false }
  if (['verify_document', 'invalidate_document'].includes(body.action) && !isAivexDocumentKey(payload.documentKey)) return { ok: false }
  if (body.action === 'request_corrections') {
    if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 8) return { ok: false }
    if (new Set(payload.items).size !== payload.items.length || payload.items.some((item) => !CORRECTION_ITEMS.has(item))) return { ok: false }
    if (!bounded(payload.message, 2000, { required: true }) || !DATE_RE.test(payload.deadline || '')) return { ok: false }
  }

  return {
    ok: true,
    value: {
      action: body.action,
      expectedUpdatedAt: body.expectedUpdatedAt,
      reason: body.reason,
      payload,
    },
  }
}
