// POST /api/aivex/magic-link/verify — Vercel Serverless Function (Node, ESM).
//
// Resolves a Magic Link token to the candidate-safe status of its
// registration (src/pages/aivex/status/AivexStatusPage.jsx). The token is
// the entire authorization context: nothing else in the request body is
// trusted to pick a registration (api/_lib/aivex-magic-link.js's
// resolveMagicLink is shared with api/aivex/magic-link/document.js so both
// endpoints agree on what "valid" means).
//
// Browser (JSON: { token })
//   -> origin / rate-limit checks -> bounded JSON body
//   -> resolveMagicLink: invalid / revoked / expired / ok
//   -> ok: load the registration's candidate-safe fields, touch
//      last_used_at (best effort), reply
//
// The response never carries the raw token, an internal id, a Storage path
// or a Supabase URL — only what src/pages/aivex/status needs to render.
// Logs carry a stage and a code only.

import { createClient } from '@supabase/supabase-js'
import { resolveMagicLink } from '../../_lib/aivex-magic-link.js'
import { createSupabaseMagicLinkStore } from '../../_lib/aivex-magic-link-store.js'
import { readJsonBody, sendJson as send } from '../../_lib/http.js'
import { consumeRateLimit, getClientIp, isTrustedOrigin } from '../../_lib/security.js'

const RATE_LIMIT = { max: 30, windowMs: 15 * 60 * 1000 }
const MAX_BODY_BYTES = 1 * 1024

const refuse = (res, status, body) => send(res, status, body)

function createDefaultMagicLinkStore() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !supabaseSecret) return null
  return createSupabaseMagicLinkStore(createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false, autoRefreshToken: false } }))
}

export function createMagicLinkVerifyHandler({ createMagicLinkStore = createDefaultMagicLinkStore, now = () => new Date() } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      refuse(res, 405, { success: false, message: 'Method not allowed.' })
      return
    }

    if (process.env.VERCEL && !isTrustedOrigin(req)) {
      refuse(res, 403, { success: false, message: 'This request was refused. Please try again from the official site page.' })
      return
    }

    const rateLimit = consumeRateLimit(`aivex-magic-link-verify:${getClientIp(req)}`, RATE_LIMIT)
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
      refuse(res, 429, { success: false, message: 'Too many attempts. Please wait a moment, then try again.' })
      return
    }

    const body = await readJsonBody(req, MAX_BODY_BYTES)
    const token = typeof body?.token === 'string' ? body.token : ''

    const magicLinkStore = createMagicLinkStore()
    if (!magicLinkStore) {
      console.error('[aivex] Missing Supabase server configuration.')
      refuse(res, 500, { success: false, message: 'Server configuration error.' })
      return
    }

    let stage = 'resolve'
    try {
      const clock = now()
      const resolved = await resolveMagicLink({ magicLinkStore, rawToken: token, now: clock })
      if (!resolved.ok) {
        refuse(res, 401, { success: false, status: resolved.status })
        return
      }

      stage = 'load-registration'
      const registration = await magicLinkStore.loadCandidateRegistration(resolved.registrationId)
      if (!registration) {
        refuse(res, 404, { success: false, status: 'registration_not_found' })
        return
      }

      stage = 'touch'
      await magicLinkStore.touchLastUsed(resolved.magicLinkId, clock).catch((error) => {
        console.error('[aivex] Magic link touch failed', { stage: 'touch', code: error?.code })
      })

      send(res, 200, {
        success: true,
        status: 'valid',
        reference: registration.reference,
        teamName: registration.team_name,
        institutionName: registration.institution_name,
        wilayaName: registration.wilaya_name,
        studentCount: registration.student_count,
        registrationStatus: registration.registration_status,
        documentStatus: registration.document_status,
      })
    } catch (error) {
      console.error('[aivex] Magic link verification failed', { stage: error?.stage || stage, code: error?.code })
      refuse(res, 500, { success: false, status: 'server_error' })
    }
  }
}

export default createMagicLinkVerifyHandler()
