import { consumeDistributedRateLimit } from './distributed-rate-limit.js'
import { isJsonContentType, readBoundedJsonBody, sendJson } from './http.js'
import { getClientIp } from './security.js'
import { createServerWorkshopsService } from './workshops.js'
import { workshopSiteOrigin } from './workshop-tokens.js'
import {
  validateInvitationTokenBody, validateScannerContextBody, validateScannerSessionBody,
  validateWorkshopCheckInBody, validateWorkshopRegistrationBody,
} from './workshop-validation.js'

const MAX_BODY_BYTES = 8 * 1024
const INVALID = 'This private workshop link is invalid or no longer active.'

export function isStrictWorkshopOrigin(req, env = process.env) {
  if (!env.VERCEL) return true
  const rawOrigin = String(req?.headers?.origin || '').split(',')[0].trim()
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim()
  if (!rawOrigin || rawOrigin === 'null' || !host) return false
  try { const parsed = new URL(rawOrigin); return parsed.protocol === 'https:' && parsed.host === host } catch { return false }
}

const CONFIG = Object.freeze({
  invitation: { validate: validateInvitationTokenBody, limit: { max: 30, windowMs: 15 * 60 * 1000 } },
  register: { validate: validateWorkshopRegistrationBody, limit: { max: 10, windowMs: 15 * 60 * 1000 } },
  'scanner-session': { validate: validateScannerSessionBody, limit: { max: 20, windowMs: 15 * 60 * 1000 } },
  'scanner-context': { validate: validateScannerContextBody, limit: { max: 120, windowMs: 15 * 60 * 1000 } },
  'scanner-check-in': { validate: validateWorkshopCheckInBody, limit: { max: 180, windowMs: 15 * 60 * 1000 } },
})

export function createWorkshopHandler(kind, {
  createService = createServerWorkshopsService, rateLimit = consumeDistributedRateLimit,
  trustedOrigin = isStrictWorkshopOrigin, enabled = (env) => env.WORKSHOP_ACCESS_API_ENABLED === 'true', env = process.env,
} = {}) {
  const config = CONFIG[kind]
  if (!config) throw new Error('unknown_workshop_handler')
  return async function workshopHandler(req, res) {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return sendJson(res, 405, { success: false, message: 'Method not allowed.' }) }
    if (!enabled(env)) return sendJson(res, 503, { success: false, message: 'Workshop access is temporarily unavailable.' })
    if (!isJsonContentType(req)) return sendJson(res, 415, { success: false, message: 'Unsupported request.' })
    if (!trustedOrigin(req, env)) return sendJson(res, 403, { success: false, message: 'Request refused.' })
    const limited = await rateLimit(`workshop-${kind}`, getClientIp(req), config.limit, { env })
    if (!limited.allowed) {
      res.setHeader('Retry-After', String(limited.retryAfterSeconds))
      return sendJson(res, 429, { success: false, message: 'Too many attempts. Please wait a moment.' })
    }
    const body = await readBoundedJsonBody(req, MAX_BODY_BYTES)
    if (!body.ok) return sendJson(res, body.reason === 'too_large' ? 413 : 400, { success: false, message: 'Invalid request.' })
    const parsed = config.validate(body.value)
    if (!parsed.ok) return sendJson(res, 400, { success: false, message: kind.startsWith('scanner') ? 'Invalid scanner request.' : INVALID })
    try {
      const service = createService({ origin: workshopSiteOrigin(req, env), env })
      const result = kind === 'invitation' ? await service.invitation(parsed.value.token)
        : kind === 'register' ? await service.register(parsed.value)
          : kind === 'scanner-session' ? await service.exchangeScanner(parsed.value.token)
            : kind === 'scanner-context' ? await service.scannerContext(parsed.value.sessionToken)
              : await service.checkIn(parsed.value)
      if (!result.ok) return sendJson(res, result.status === 'closed' || result.status === 'not_open' ? 409 : 401, { success: false, status: result.status, message: result.message })
      return sendJson(res, 200, { success: true, ...result })
    } catch (error) {
      console.error(`[workshop-${kind}] Request failed`, { stage: error?.stage || kind, code: error?.code || 'unexpected_error' })
      return sendJson(res, 503, { success: false, message: 'Workshop access is temporarily unavailable.' })
    }
  }
}

