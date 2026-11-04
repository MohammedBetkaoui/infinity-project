import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createEventInvitationDeliveryService } from './event-invitation-delivery.js'
import { createEventInvitationDeliveryStore } from './event-invitation-delivery-store.js'
import { createN8nRegistrationDispatcher } from './event-invitation-webhook.js'
import { sendJson } from './http.js'

const authorized = (req, env) => {
  const expected = String(env.CRON_SECRET || '').trim()
  const provided = String(req.headers?.authorization || '')
  const candidate = provided.startsWith('Bearer ') ? provided.slice(7) : ''
  if (expected.length < 32 || candidate.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))
}

export function createEventInvitationWorkerHandler({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  return async function eventInvitationWorkerHandler(req, res) {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return sendJson(res, 405, { success: false, message: 'Method not allowed.' })
    }
    if (!authorized(req, env)) return sendJson(res, 401, { success: false, message: 'Unauthorized.' })

    const supabaseUrl = env.SUPABASE_URL
    const supabaseSecret = env.SUPABASE_SECRET_KEY
    const origin = String(env.PUBLIC_SITE_ORIGIN || '').trim()
    if (!supabaseUrl || !supabaseSecret || !origin) {
      console.error('[event-invitation-worker] Configuration unavailable', { code: 'configuration_error' })
      return sendJson(res, 503, { success: false, message: 'Worker configuration unavailable.' })
    }

    try {
      const dispatcher = createN8nRegistrationDispatcher({ env, fetchImpl })
      const supabase = createClient(supabaseUrl, supabaseSecret, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const service = createEventInvitationDeliveryService({
        store: createEventInvitationDeliveryStore(supabase), dispatcher, origin, env,
      })
      const backfills = await service.processBackfills()
      const deliveries = await service.processDeliveries()
      return sendJson(res, 200, { success: true, backfills, deliveries })
    } catch (error) {
      // Fixed categories only: never log a webhook URL, secret, email, name,
      // private registration URL, raw token, response body, or request body.
      console.error('[event-invitation-worker] Invocation failed', { code: error?.code || 'worker_error', stage: error?.stage || 'worker' })
      return sendJson(res, 503, { success: false, message: 'Invitation delivery worker unavailable.' })
    }
  }
}

