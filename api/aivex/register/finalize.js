// Small JSON finalization request. Staged objects are fetched through the
// service-role client, validated from their real bytes, then copied inside
// private Storage to the existing permanent V4 paths.
import { AIVEX_EDITION, LIMITS, registrationResponsesV4, validateRegistrationV4 } from '../../../shared/aivex/contract-v4.js'
import { generateOfficialDocuments } from '../../_lib/aivex-document-generation.js'
import { createSupabaseDocumentStore } from '../../_lib/aivex-document-store.js'
import {
  UPLOAD_SESSION_STALE_MS, createSupabaseUploadSessionStore, sessionIsUsable, verifyRegistrationStaging,
} from '../../_lib/aivex-direct-upload.js'
import { issueMagicLink } from '../../_lib/aivex-magic-link.js'
import { createSupabaseMagicLinkStore } from '../../_lib/aivex-magic-link-store.js'
import { canRegister, loadAivexOperationalSettings } from '../../_lib/aivex-operational-settings.js'
import { generateRegistrationReference } from '../../_lib/aivex-reference.js'
import { createSupabaseRegistrationStore, registerV4, registrationFingerprint } from '../../_lib/aivex-registration-v4.js'
import { createServerSupabaseClient } from '../../_lib/aivex-server.js'
import { readJsonBody, sendJson } from '../../_lib/http.js'
import { consumeRateLimit, getClientIp, isTrustedOrigin } from '../../_lib/security.js'

const RATE_LIMIT = { max: 8, windowMs: 15 * 60 * 1000 }
const MAX_JSON_BYTES = 80 * 1024
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const fail = (res, status, state, message = 'The registration could not be finalized.') => sendJson(res, status, { success: false, status: state, message })

function requestSource(req) {
  try {
    const url = new URL(req.headers?.referer)
    return `${url.origin}${url.pathname}`.slice(0, LIMITS.source)
  } catch { return null }
}

async function postRegistrationWork(supabase, outcome, clock, req) {
  if (!outcome.registrationId) return null
  await generateOfficialDocuments({ store: createSupabaseDocumentStore(supabase), registrationId: outcome.registrationId, now: clock })
    .catch((error) => console.error('[aivex] Document generation step crashed', { code: error?.code }))
  try {
    return await issueMagicLink({
      magicLinkStore: createSupabaseMagicLinkStore(supabase), registrationId: outcome.registrationId, now: clock,
      ip: getClientIp(req), userAgent: req.headers?.['user-agent'], req,
    })
  } catch (error) {
    console.error('[aivex] Magic link issuance step crashed', { code: error?.code })
    return null
  }
}

export function createRegistrationUploadFinalizeHandler({
  createSupabase = createServerSupabaseClient, now = () => new Date(), generateReference = generateRegistrationReference,
  loadSettings = loadAivexOperationalSettings, makeRegistrationStore = createSupabaseRegistrationStore,
  makeSessionStore = createSupabaseUploadSessionStore,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return fail(res, 405, 'method_not_allowed', 'Method not allowed.')
    }
    if (process.env.VERCEL && !isTrustedOrigin(req)) return fail(res, 403, 'request_refused', 'This request was refused.')
    const rate = consumeRateLimit(`aivex-register-finalize:${getClientIp(req)}`, RATE_LIMIT)
    if (!rate.allowed) {
      res.setHeader('Retry-After', String(rate.retryAfterSeconds))
      return fail(res, 429, 'rate_limited', 'Too many attempts. Please wait a moment, then try again.')
    }
    const body = await readJsonBody(req, MAX_JSON_BYTES)
    const checked = validateRegistrationV4(body?.payload)
    if (!checked.ok) return sendJson(res, checked.status, registrationResponsesV4.failed(checked.status, checked.message, checked.field).body)
    if (!UUID_RE.test(body?.uploadSessionId || '')) return fail(res, 400, 'invalid_upload_session')

    const supabase = createSupabase()
    if (!supabase) return fail(res, 500, 'server_configuration', 'Server configuration error.')
    const clock = now()
    const sessions = makeSessionStore(supabase)
    let session
    try {
      const settings = await loadSettings(supabase, AIVEX_EDITION)
      const gate = canRegister(settings, clock)
      if (!gate.ok) return fail(res, 403, gate.status)

      const fingerprint = registrationFingerprint(checked.value)
      session = await sessions.loadSession(body.uploadSessionId)
      if (!sessionIsUsable(session, 'registration', clock)
        || session.submission_id !== checked.value.submissionId || session.payload_fingerprint !== fingerprint) {
        return fail(res, 409, 'invalid_upload_session')
      }

      const registrationStore = makeRegistrationStore(supabase)
      const existing = await registrationStore.findBySubmissionId(checked.value.submissionId)
      if (existing?.studentCount === 3) {
        if (existing.fingerprint !== fingerprint) return fail(res, 409, 'submission_conflict')
        await sessions.markCompleted(session.id, clock).catch(() => {})
        await sessions.removeStaging(session.expected_files).catch(() => {})
        sendJson(res, 200, { success: true, alreadyProcessed: true, reference: existing.reference })
        return
      }

      const claimed = await sessions.markFinalizing(session.id, new Date(clock.getTime() - UPLOAD_SESSION_STALE_MS))
      if (!claimed) return fail(res, 409, 'finalization_in_progress')
      const verified = await verifyRegistrationStaging(sessions, session, checked.value.students)
      if (!verified.ok) {
        await sessions.removeStaging(session.expected_files).catch(() => {})
        await sessions.markFailed(session.id).catch(() => {})
        return fail(res, verified.status || 400, verified.reason || 'invalid_file', verified.message)
      }

      const outcome = await registerV4({
        store: registrationStore, registration: checked.value, cards: verified.cards, identityCards: verified.identityCards,
        source: requestSource(req), now: clock, generateReference,
      })
      if (outcome.status >= 400) {
        await sessions.markFailed(session.id).catch(() => {})
        sendJson(res, outcome.status, outcome.body)
        return
      }
      const link = await postRegistrationWork(supabase, outcome, clock, req)
      await sessions.markCompleted(session.id, clock)
      await sessions.removeStaging(session.expected_files).catch((error) => {
        console.error('[aivex] Staging cleanup failed', { stage: error?.stage, code: error?.code })
      })
      sendJson(res, outcome.status, { ...outcome.body, ...(link?.magicLink ? { magicLink: link.magicLink } : {}) })
    } catch (error) {
      if (session?.id) await sessions.markFailed(session.id).catch(() => {})
      console.error('[aivex] Registration finalize failed', { stage: error?.stage || 'finalize', code: error?.code })
      fail(res, 500, 'finalization_failed')
    }
  }
}

export default createRegistrationUploadFinalizeHandler()
