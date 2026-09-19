// POST /api/aivex/magic-link — Vercel Serverless Function (Node, ESM).
//
// Creates or rotates the one active Magic Link for a registration
// (api/_lib/aivex-magic-link.js). Not part of the main success path — that
// path issues the link in-process, right inside api/aivex/register.js,
// straight after a registration succeeds, with no separate HTTP hop. This
// endpoint exists only as the recovery path: if that in-process step failed
// (a transient Supabase error, say) the registration is still valid, so the
// applicant's own browser — the one that still holds the original
// submissionId — can ask for a link afterwards without ever needing one.
//
// Browser (JSON: { reference, submissionId })
//   -> origin / rate-limit checks -> bounded JSON body
//   -> registration found by reference AND submissionId — the exact same
//      trusted lookup api/aivex/document.js already uses; nothing here
//      trusts a bare registration id from an unauthenticated caller
//   -> issueMagicLink: new token, previous active link (if any) revoked
//   -> 200 { success: true, magicLink, expiresAt }
//
// Responses for an unknown pair are the same 404 whether the reference
// exists or not (mirrors api/aivex/document.js). Logs carry a stage and a
// code only — never the reference, never the token.

import { createClient } from '@supabase/supabase-js'
import { isUuidV4 } from '../../shared/aivex/contract-v4.js'
import { issueMagicLink } from '../_lib/aivex-magic-link.js'
import { createSupabaseMagicLinkStore } from '../_lib/aivex-magic-link-store.js'
import { createSupabaseDocumentStore } from '../_lib/aivex-document-store.js'
import { readJsonBody, sendJson as send } from '../_lib/http.js'
import { REGISTRATION_REFERENCE_PATTERN } from '../_lib/aivex-reference.js'
import { consumeRateLimit, getClientIp, isTrustedOrigin } from '../_lib/security.js'

const RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 }
const MAX_BODY_BYTES = 2 * 1024

const refuse = (res, status, message) => send(res, status, { success: false, message })

function createDefaultSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !supabaseSecret) return null
  return createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false, autoRefreshToken: false } })
}
const createDefaultMagicLinkStore = () => {
  const supabase = createDefaultSupabaseClient()
  return supabase ? createSupabaseMagicLinkStore(supabase) : null
}
// A second, small store just to reuse the one existing, already-tested
// reference+submissionId lookup (findRegistrationForDownload) rather than
// re-implementing that same security-sensitive query a third time.
const createDefaultRegistrationLookupStore = () => {
  const supabase = createDefaultSupabaseClient()
  return supabase ? createSupabaseDocumentStore(supabase) : null
}

export function createMagicLinkHandler({
  createMagicLinkStore = createDefaultMagicLinkStore,
  createRegistrationLookupStore = createDefaultRegistrationLookupStore,
  now = () => new Date(),
} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      refuse(res, 405, 'Method not allowed.')
      return
    }

    if (process.env.VERCEL && !isTrustedOrigin(req)) {
      refuse(res, 403, 'This request was refused. Please try again from the official site page.')
      return
    }

    const rateLimit = consumeRateLimit(`aivex-magic-link:${getClientIp(req)}`, RATE_LIMIT)
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
      refuse(res, 429, 'Too many attempts. Please wait a moment, then try again.')
      return
    }

    const body = await readJsonBody(req, MAX_BODY_BYTES)
    const reference = typeof body?.reference === 'string' ? body.reference.trim() : ''
    const submissionId = typeof body?.submissionId === 'string' ? body.submissionId.trim().toLowerCase() : ''
    if (!REGISTRATION_REFERENCE_PATTERN.test(reference) || !isUuidV4(submissionId)) {
      refuse(res, 400, 'Invalid request.')
      return
    }

    const registrationLookupStore = createRegistrationLookupStore()
    const magicLinkStore = createMagicLinkStore()
    if (!registrationLookupStore || !magicLinkStore) {
      console.error('[aivex] Missing Supabase server configuration.')
      refuse(res, 500, 'Server configuration error.')
      return
    }

    let stage = 'find-registration'
    try {
      const registration = await registrationLookupStore.findRegistrationForDownload({ reference, submissionId })
      if (!registration) {
        refuse(res, 404, 'No registration matches this request.')
        return
      }

      stage = 'issue'
      const clock = now()
      const { magicLink, expiresAt } = await issueMagicLink({
        magicLinkStore, registrationId: registration.id, now: clock, ip: getClientIp(req), userAgent: req.headers?.['user-agent'], req,
      })
      send(res, 200, { success: true, magicLink, expiresAt: expiresAt.toISOString() })
    } catch (error) {
      console.error('[aivex] Magic link issuance failed', { stage: error?.stage || stage, code: error?.code })
      refuse(res, 500, 'The access link could not be created. Please try again.')
    }
  }
}

export default createMagicLinkHandler()
