// Small JSON authorization request for five direct-to-Storage uploads.
// File bytes never enter this function.
import { AIVEX_EDITION, registrationResponsesV4, validateRegistrationV4 } from '../../../shared/aivex/contract-v4.js'
import {
  buildRegistrationUploadManifest, createSupabaseUploadSessionStore, newUploadSessionId, sessionExpiry,
} from '../../_lib/aivex-direct-upload.js'
import { canRegister, loadAivexOperationalSettings } from '../../_lib/aivex-operational-settings.js'
import { registrationFingerprint, createSupabaseRegistrationStore } from '../../_lib/aivex-registration-v4.js'
import { createServerSupabaseClient } from '../../_lib/aivex-server.js'
import { readJsonBody, sendJson } from '../../_lib/http.js'
import { consumeRateLimit, getClientIp, isTrustedOrigin } from '../../_lib/security.js'

const RATE_LIMIT = { max: 8, windowMs: 15 * 60 * 1000 }
const MAX_JSON_BYTES = 96 * 1024

const fail = (res, status, state, message = 'The upload could not be prepared.') => sendJson(res, status, { success: false, status: state, message })

export function createRegistrationUploadInitHandler({
  createSupabase = createServerSupabaseClient, now = () => new Date(), createId = newUploadSessionId,
  loadSettings = loadAivexOperationalSettings, makeRegistrationStore = createSupabaseRegistrationStore,
  makeSessionStore = createSupabaseUploadSessionStore,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      fail(res, 405, 'method_not_allowed', 'Method not allowed.')
      return
    }
    if (process.env.VERCEL && !isTrustedOrigin(req)) return fail(res, 403, 'request_refused', 'This request was refused.')
    const rate = consumeRateLimit(`aivex-register-init:${getClientIp(req)}`, RATE_LIMIT)
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds))
      return fail(res, 429, 'rate_limited', 'Too many attempts. Please wait a moment, then try again.')
    }
    const body = await readJsonBody(req, MAX_JSON_BYTES)
    const checked = validateRegistrationV4(body?.payload)
    if (!checked.ok) return sendJson(res, checked.status, registrationResponsesV4.failed(checked.status, checked.message, checked.field).body)

    const supabase = createSupabase()
    if (!supabase) return fail(res, 500, 'server_configuration', 'Server configuration error.')
    const clock = now()
    try {
      const settings = await loadSettings(supabase, AIVEX_EDITION)
      const gate = canRegister(settings, clock)
      if (!gate.ok) return fail(res, 403, gate.status)

      const fingerprint = registrationFingerprint(checked.value)
      const registrationStore = makeRegistrationStore(supabase)
      const existingRegistration = await registrationStore.findBySubmissionId(checked.value.submissionId)
      if (existingRegistration?.studentCount === 3) {
        if (existingRegistration.fingerprint !== fingerprint) return fail(res, 409, 'submission_conflict')
        sendJson(res, 200, { success: true, alreadyProcessed: true, reference: existingRegistration.reference })
        return
      }

      const sessions = makeSessionStore(supabase)
      let session = await sessions.findRegistrationSession(checked.value.submissionId, fingerprint, clock)
      if (!session) {
        const id = createId()
        const manifest = buildRegistrationUploadManifest(id, body?.files)
        if (!manifest) return fail(res, 400, 'invalid_file_manifest', 'The selected files are incomplete or unsupported.')
        session = await sessions.createSession({
          id, kind: 'registration', edition: AIVEX_EDITION, submission_id: checked.value.submissionId,
          payload_fingerprint: fingerprint, expected_files: manifest, expires_at: sessionExpiry(clock).toISOString(),
        })
      }
      const uploads = await sessions.signedCapabilities(session.expected_files)
      sendJson(res, 200, { success: true, uploadSessionId: session.id, expiresAt: session.expires_at, uploads })
    } catch (error) {
      console.error('[aivex] Registration upload init failed', { stage: error?.stage || 'init', code: error?.code })
      fail(res, 500, 'upload_init_failed')
    }
  }
}

export default createRegistrationUploadInitHandler()
