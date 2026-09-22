// Magic-Link-authorized signed-document finalization. JSON only.
import { UPLOAD_ELIGIBLE_DOCUMENT_STATUSES } from '../../../../shared/aivex/signed-document-policy.js'
import {
  UPLOAD_SESSION_STALE_MS, createSupabaseUploadSessionStore, sessionIsUsable, verifySignedDocumentStaging,
} from '../../../_lib/aivex-direct-upload.js'
import { resolveMagicLink } from '../../../_lib/aivex-magic-link.js'
import { createSupabaseMagicLinkStore } from '../../../_lib/aivex-magic-link-store.js'
import { canUploadSignedDocument, loadAivexOperationalSettings } from '../../../_lib/aivex-operational-settings.js'
import { createServerSupabaseClient } from '../../../_lib/aivex-server.js'
import { createSupabaseSignedDocumentStore } from '../../../_lib/aivex-signed-document-store.js'
import { uploadSignedDocument } from '../../../_lib/aivex-signed-document-upload.js'
import { readJsonBody, sendJson } from '../../../_lib/http.js'
import { consumeRateLimit, getClientIp, isTrustedOrigin } from '../../../_lib/security.js'

const MAX_JSON_BYTES = 12 * 1024
const RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (res, status, state, message = 'The signed document could not be finalized.') => sendJson(res, status, { success: false, status: state, message })

export function createSignedUploadFinalizeHandler({
  createSupabase = createServerSupabaseClient, now = () => new Date(), loadSettings = loadAivexOperationalSettings,
  makeSessionStore = createSupabaseUploadSessionStore, makeMagicLinkStore = createSupabaseMagicLinkStore,
  makeDocumentStore = createSupabaseSignedDocumentStore, resolveLink = resolveMagicLink,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return fail(res, 405, 'method_not_allowed', 'Method not allowed.')
    }
    if (process.env.VERCEL && !isTrustedOrigin(req)) return fail(res, 403, 'request_refused', 'This request was refused.')
    const rate = consumeRateLimit(`aivex-signed-finalize:${getClientIp(req)}`, RATE_LIMIT)
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds))
      return fail(res, 429, 'rate_limited', 'Too many attempts. Please wait a moment, then try again.')
    }
    const body = await readJsonBody(req, MAX_JSON_BYTES)
    if (!body || !UUID_RE.test(body.uploadSessionId || '')) return fail(res, 400, 'invalid_upload_session')
    const supabase = createSupabase()
    if (!supabase) return fail(res, 500, 'server_configuration', 'Server configuration error.')
    const clock = now()
    const sessions = makeSessionStore(supabase)
    let session
    try {
      const magicLinkStore = makeMagicLinkStore(supabase)
      const resolved = await resolveLink({ magicLinkStore, rawToken: typeof body.token === 'string' ? body.token : '', now: clock })
      if (!resolved.ok) return fail(res, 401, resolved.status)

      session = await sessions.loadSession(body.uploadSessionId)
      if (!sessionIsUsable(session, 'signed_document', clock) || session.registration_id !== resolved.registrationId) {
        return fail(res, 409, 'invalid_upload_session')
      }
      const documents = makeDocumentStore(supabase)
      const registration = await documents.loadRegistrationForUpload(resolved.registrationId)
      if (!registration) return fail(res, 404, 'registration_not_found')
      const settings = await loadSettings(supabase, registration.edition)
      const gate = canUploadSignedDocument(settings, clock)
      if (!gate.ok) return fail(res, 403, gate.status)
      if (!UPLOAD_ELIGIBLE_DOCUMENT_STATUSES.includes(registration.document_status)) return fail(res, 409, 'document_not_ready')

      const existing = await documents.findByUploadId(resolved.registrationId, session.upload_id)
      if (existing) {
        await sessions.markCompleted(session.id, clock).catch(() => {})
        await sessions.removeStaging(session.expected_files).catch(() => {})
        sendJson(res, 200, { success: true, status: 'signed_document_uploaded', version: existing.version, alreadyProcessed: true })
        return
      }

      const claimed = await sessions.markFinalizing(session.id, new Date(clock.getTime() - UPLOAD_SESSION_STALE_MS))
      if (!claimed) return fail(res, 409, 'finalization_in_progress')
      const verified = await verifySignedDocumentStaging(sessions, session)
      if (!verified.ok) {
        await sessions.removeStaging(session.expected_files).catch(() => {})
        await sessions.markFailed(session.id).catch(() => {})
        return fail(res, verified.status || 400, verified.reason || 'invalid_file', verified.message)
      }

      const outcome = await uploadSignedDocument({
        store: documents, registrationId: resolved.registrationId, uploadId: session.upload_id, file: verified.file, now: clock,
      })
      if (!outcome.ok) {
        await sessions.markFailed(session.id).catch(() => {})
        return fail(res, 409, outcome.reason)
      }
      await sessions.markCompleted(session.id, clock)
      await sessions.removeStaging(session.expected_files).catch((error) => {
        console.error('[aivex] Signed staging cleanup failed', { stage: error?.stage, code: error?.code })
      })
      await magicLinkStore.touchLastUsed(resolved.magicLinkId, clock).catch(() => {})
      sendJson(res, 200, { success: true, status: 'signed_document_uploaded', version: outcome.version })
    } catch (error) {
      if (session?.id) await sessions.markFailed(session.id).catch(() => {})
      console.error('[aivex] Signed upload finalize failed', { stage: error?.stage || 'finalize', code: error?.code })
      fail(res, 500, 'finalization_failed')
    }
  }
}

export default createSignedUploadFinalizeHandler()
