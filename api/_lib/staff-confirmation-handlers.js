import { consumeDistributedRateLimit } from './distributed-rate-limit.js'
import { isJsonContentType, readBoundedJsonBody, sendJson as send } from './http.js'
import { getClientIp } from './security.js'
import { validateStaffConfirmationSubmitBody, validateStaffConfirmationVerifyBody } from './staff-confirmation-validation.js'
import { createServerStaffConfirmationsService } from './staff-confirmations.js'

const MAX_BODY_BYTES = 16 * 1024
const INVALID_MESSAGE = 'This Staff confirmation link is invalid or no longer active.'
const EXPIRED_MESSAGE = 'This invitation is no longer active. Please contact Infinity Club.'
const UNAVAILABLE_MESSAGE = 'This Staff confirmation link is currently unavailable. Please contact Infinity Club.'
const FIELD_MESSAGES = Object.freeze({
  motivation: 'Your motivation must be between 150 and 2000 characters.',
  workLinks: 'Add up to 5 links, each a complete http:// or https:// address of at most 500 characters.',
})

export function isStrictStaffConfirmationOrigin(req, env = process.env) {
  if (!env.VERCEL) return true
  const rawOrigin = String(req?.headers?.origin || '').split(',')[0].trim()
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim()
  if (!rawOrigin || rawOrigin === 'null' || !host) return false
  try {
    const origin = new URL(rawOrigin)
    return origin.protocol === 'https:' && origin.host === host
  } catch {
    return false
  }
}

function createHandler(kind, {
  createService = createServerStaffConfirmationsService,
  rateLimit = consumeDistributedRateLimit,
  trustedOrigin = isStrictStaffConfirmationOrigin,
  env = process.env,
  enabled = (runtime) => runtime.STAFF_CONFIRMATION_API_ENABLED === 'true',
} = {}) {
  const submit = kind === 'submit'
  const scope = submit ? 'staff-confirmation-submit' : 'staff-confirmation-verify'
  const limit = submit ? { max: 10, windowMs: 15 * 60 * 1000 } : { max: 30, windowMs: 15 * 60 * 1000 }
  const validate = submit ? validateStaffConfirmationSubmitBody : validateStaffConfirmationVerifyBody

  return async function staffConfirmationHandler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      send(res, 405, { success: false, message: 'Method not allowed.' })
      return
    }
    if (!enabled(env)) {
      send(res, 503, { success: false, status: 'service_unavailable', message: 'Staff confirmation is temporarily unavailable. Please try again.' })
      return
    }
    if (!isJsonContentType(req)) {
      send(res, 415, { success: false, message: 'Unsupported request.' })
      return
    }
    const declaredLength = Number(req.headers?.['content-length'])
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      send(res, 413, { success: false, message: 'Payload too large.' })
      return
    }
    if (!trustedOrigin(req, env)) {
      send(res, 403, { success: false, message: 'This request was refused. Please reopen the official private link.' })
      return
    }
    const limited = await rateLimit(scope, getClientIp(req), limit, { env })
    if (!limited.allowed) {
      res.setHeader('Retry-After', String(limited.retryAfterSeconds))
      send(res, 429, { success: false, message: 'Too many attempts. Please wait a moment, then try again.' })
      return
    }
    const parsedBody = await readBoundedJsonBody(req, MAX_BODY_BYTES)
    if (!parsedBody.ok) {
      const tooLarge = parsedBody.reason === 'too_large'
      send(res, tooLarge ? 413 : 400, { success: false, message: tooLarge ? 'Payload too large.' : 'Invalid request.' })
      return
    }
    const parsed = validate(parsedBody.value)
    if (!parsed.ok) {
      // Per-link problems are reported by index and code only; submitted URLs are never echoed.
      send(res, 400, {
        success: false,
        message: FIELD_MESSAGES[parsed.field] || 'Invalid request.',
        ...(parsed.field ? { field: parsed.field } : {}),
        ...(parsed.errors?.length ? { errors: parsed.errors } : {}),
      })
      return
    }

    try {
      const service = createService()
      const result = submit
        ? await service.submit(parsed.value.token, parsed.value.motivation, parsed.value.workLinks)
        : await service.verify(parsed.value.token)
      if (result.ok) {
        send(res, 200, {
          success: true,
          status: result.status,
          ...(result.confirmation ? { confirmation: result.confirmation } : {}),
          ...(result.reference ? { reference: result.reference } : {}),
          ...(result.submittedAt ? { submittedAt: result.submittedAt } : {}),
        })
        return
      }
      if (result.status === 'expired') {
        send(res, 410, { success: false, status: 'expired', message: EXPIRED_MESSAGE })
        return
      }
      if (result.status === 'unavailable') {
        send(res, 423, { success: false, status: 'unavailable', message: UNAVAILABLE_MESSAGE })
        return
      }
      if (result.status === 'invalid_motivation') {
        send(res, 400, { success: false, status: 'invalid_motivation', field: 'motivation', message: FIELD_MESSAGES.motivation })
        return
      }
      if (result.status === 'invalid_work_links') {
        send(res, 400, { success: false, status: 'invalid_work_links', field: 'workLinks', message: FIELD_MESSAGES.workLinks })
        return
      }
      send(res, 401, { success: false, status: 'invalid', message: INVALID_MESSAGE })
    } catch (error) {
      console.error(`[staff-confirmation] ${submit ? 'Submission' : 'Verification'} failed`, {
        stage: error?.stage || kind, code: error?.code || 'unexpected_error',
      })
      send(res, 503, { success: false, status: 'service_unavailable', message: 'Staff confirmation is temporarily unavailable. Please try again.' })
    }
  }
}

export const createStaffConfirmationVerifyHandler = (options) => createHandler('verify', options)
export const createStaffConfirmationSubmitHandler = (options) => createHandler('submit', options)
