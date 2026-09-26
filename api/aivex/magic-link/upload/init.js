// Magic-Link-authorized direct upload initialization. JSON only; the file's
// bytes go from the candidate browser to one private staging object.
//
// Two request shapes share this one endpoint (see the correction branch
// below): the classic signed-document upload ({ uploadId, file }), and a
// per-item correction document resubmission ({ itemId, uploadId, file } —
// a student card or an identity card). They are folded into one file,
// rather than two, purely to stay within the Vercel Hobby plan's
// 12-Function ceiling (see tests/admin-auth.test.mjs) — every other Magic
// Link concern already has its own endpoint; this is one of two exceptions
// (the other being ../verify.js's field-correction branch), kept as a
// clearly separated, self-contained block with its own store and manifest.
import { AIVEX_EDITION, isUuidV4 } from '../../../../shared/aivex/contract-v4.js'
import { UPLOAD_ELIGIBLE_DOCUMENT_STATUSES } from '../../../../shared/aivex/signed-document-policy.js'
import {
  buildCorrectionCardUploadManifest, buildSignedDocumentUploadManifest,
  createSupabaseUploadSessionStore, newUploadSessionId, sessionExpiry,
} from '../../../_lib/aivex-direct-upload.js'
import { createSupabaseCorrectionStore } from '../../../_lib/aivex-correction-store.js'
import { resolveMagicLink } from '../../../_lib/aivex-magic-link.js'
import { createSupabaseMagicLinkStore } from '../../../_lib/aivex-magic-link-store.js'
import { canUploadSignedDocument, loadAivexOperationalSettings } from '../../../_lib/aivex-operational-settings.js'
import { createServerSupabaseClient } from '../../../_lib/aivex-server.js'
import { createSupabaseSignedDocumentStore } from '../../../_lib/aivex-signed-document-store.js'
import { readJsonBody, sendJson } from '../../../_lib/http.js'
import { consumeRateLimit, getClientIp, isTrustedOrigin } from '../../../_lib/security.js'

const MAX_JSON_BYTES = 16 * 1024
const RATE_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 }
const fail = (res, status, state, message = 'The document upload could not be prepared.') => sendJson(res, status, { success: false, status: state, message })

// The correction branch: a student/identity card, keyed by the correction
// item rather than by document_status. No idempotent-replay short-circuit
// here (unlike the signed document below) — an overwrite-in-place upload
// has nothing to replay; see api/_lib/aivex-correction-upload.js's own note.
async function initCorrectionUpload(res, { supabase, corrections, magicLinkStore, resolved, body, clock, createId, makeSessionStore }) {
  const item = await corrections.loadItem(body.itemId)
  if (!item || item.registration_id !== resolved.registrationId) return fail(res, 404, 'correction_item_not_found')
  if (item.kind !== 'document' || item.status !== 'open') return fail(res, 409, 'correction_item_not_ready')
  const registration = await corrections.loadRegistrationForUpload(resolved.registrationId)
  if (!registration) return fail(res, 404, 'registration_not_found')

  const sessions = makeSessionStore(supabase)
  let session = await sessions.findCorrectionSession(resolved.registrationId, body.uploadId, clock)
  if (!session) {
    const id = createId()
    const manifest = buildCorrectionCardUploadManifest(id, body.itemId, item.item, body.file)
    if (!manifest) return fail(res, 400, 'invalid_file_manifest', 'The selected file is incomplete or unsupported.')
    session = await sessions.createSession({
      id, kind: 'correction_document', edition: registration.edition, upload_id: body.uploadId,
      registration_id: resolved.registrationId, expected_files: manifest, expires_at: sessionExpiry(clock).toISOString(),
    })
  }
  const uploads = await sessions.signedCapabilities(session.expected_files)
  await magicLinkStore.touchLastUsed(resolved.magicLinkId, clock).catch(() => {})
  sendJson(res, 200, { success: true, uploadSessionId: session.id, expiresAt: session.expires_at, upload: uploads[0] })
}

export function createSignedUploadInitHandler({
  createSupabase = createServerSupabaseClient, now = () => new Date(), createId = newUploadSessionId,
  loadSettings = loadAivexOperationalSettings, makeMagicLinkStore = createSupabaseMagicLinkStore,
  makeDocumentStore = createSupabaseSignedDocumentStore, makeSessionStore = createSupabaseUploadSessionStore,
  makeCorrectionStore = createSupabaseCorrectionStore, resolveLink = resolveMagicLink,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return fail(res, 405, 'method_not_allowed', 'Method not allowed.')
    }
    if (process.env.VERCEL && !isTrustedOrigin(req)) return fail(res, 403, 'request_refused', 'This request was refused.')
    const rate = consumeRateLimit(`aivex-signed-init:${getClientIp(req)}`, RATE_LIMIT)
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds))
      return fail(res, 429, 'rate_limited', 'Too many attempts. Please wait a moment, then try again.')
    }
    const body = await readJsonBody(req, MAX_JSON_BYTES)
    if (!body || !isUuidV4(body.uploadId)) return fail(res, 400, 'invalid_upload_request')
    const supabase = createSupabase()
    if (!supabase) return fail(res, 500, 'server_configuration', 'Server configuration error.')
    const clock = now()
    try {
      const magicLinkStore = makeMagicLinkStore(supabase)
      const resolved = await resolveLink({ magicLinkStore, rawToken: typeof body.token === 'string' ? body.token : '', now: clock })
      if (!resolved.ok) return fail(res, 401, resolved.status)

      if (typeof body.itemId === 'string') {
        return await initCorrectionUpload(res, {
          supabase, corrections: makeCorrectionStore(supabase), magicLinkStore, resolved, body, clock, createId, makeSessionStore,
        })
      }

      const documents = makeDocumentStore(supabase)
      const registration = await documents.loadRegistrationForUpload(resolved.registrationId)
      if (!registration) return fail(res, 404, 'registration_not_found')
      const settings = await loadSettings(supabase, registration.edition || AIVEX_EDITION)
      const gate = canUploadSignedDocument(settings, clock)
      if (!gate.ok) return fail(res, 403, gate.status)
      if (!UPLOAD_ELIGIBLE_DOCUMENT_STATUSES.includes(registration.document_status)) return fail(res, 409, 'document_not_ready')

      const existing = await documents.findByUploadId(resolved.registrationId, body.uploadId)
      if (existing) {
        sendJson(res, 200, { success: true, alreadyProcessed: true, version: existing.version })
        return
      }

      const sessions = makeSessionStore(supabase)
      let session = await sessions.findSignedSession(resolved.registrationId, body.uploadId, clock)
      if (!session) {
        const id = createId()
        const manifest = buildSignedDocumentUploadManifest(id, body.file)
        if (!manifest) return fail(res, 400, 'invalid_file_manifest', 'The selected file is incomplete or unsupported.')
        session = await sessions.createSession({
          id, kind: 'signed_document', edition: registration.edition, upload_id: body.uploadId,
          registration_id: resolved.registrationId, expected_files: manifest, expires_at: sessionExpiry(clock).toISOString(),
        })
      }
      const uploads = await sessions.signedCapabilities(session.expected_files)
      await magicLinkStore.touchLastUsed(resolved.magicLinkId, clock).catch(() => {})
      sendJson(res, 200, { success: true, uploadSessionId: session.id, expiresAt: session.expires_at, upload: uploads[0] })
    } catch (error) {
      console.error('[aivex] Signed upload init failed', { stage: error?.stage || 'init', code: error?.code })
      fail(res, 500, 'upload_init_failed')
    }
  }
}

export default createSignedUploadInitHandler()
