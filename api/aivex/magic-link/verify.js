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
//
// When a signed document has been received, the response also carries its
// version and upload timestamp — never the file, the storage path, or
// anything about earlier versions. This is looked up independently of the
// current document_status (see the comment at its call site below): once
// generation has actually started, a signed document may exist on record no
// matter what document_status later becomes (e.g. 'changes_required' for an
// unrelated item), and the candidate must keep seeing it.
//
// When document_status is 'changes_required', the response also carries the
// real per-team correctionRequest (items, message, deadline) the admin
// dashboard recorded — never the admin-only internal_note or who requested
// it — so the page can show what was actually asked for instead of a
// generic "changes required" notice.
//
// This file also answers ONE more request shape, on the same route: a JSON
// body of { token, itemId, fields } is a field-kind correction resubmission
// ('Team information' / 'Activities manager' — see api/_lib/aivex-
// correction-store.js and shared/aivex/correction-items.js), not a status
// check. It is folded in here, rather than its own file, purely to stay
// within the Vercel Hobby plan's 12-Function ceiling (see
// tests/admin-auth.test.mjs) — every other Magic Link concern already has
// its own endpoint; this is the one exception, kept as a clearly separated
// branch with its own stricter rate limit, never touching the read path
// above it.

import { createClient } from '@supabase/supabase-js'
import { readActivityOfficial, readTeam } from '../../../shared/aivex/contract-v4.js'
import { createSupabaseCorrectionStore } from '../../_lib/aivex-correction-store.js'
import { resolveMagicLink } from '../../_lib/aivex-magic-link.js'
import { createSupabaseMagicLinkStore } from '../../_lib/aivex-magic-link-store.js'
import { createSupabaseSignedDocumentStore } from '../../_lib/aivex-signed-document-store.js'
import { readJsonBody, sendJson as send } from '../../_lib/http.js'
import { consumeRateLimit, getClientIp, isTrustedOrigin } from '../../_lib/security.js'

const RATE_LIMIT = { max: 30, windowMs: 15 * 60 * 1000 }
const FIELD_CORRECTION_RATE_LIMIT = { max: 15, windowMs: 15 * 60 * 1000 }
const MAX_BODY_BYTES = 2 * 1024

const refuse = (res, status, body) => send(res, status, body)

function createDefaultMagicLinkStore() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !supabaseSecret) return null
  return createSupabaseMagicLinkStore(createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false, autoRefreshToken: false } }))
}

function createDefaultSignedDocumentStore() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !supabaseSecret) return null
  return createSupabaseSignedDocumentStore(createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false, autoRefreshToken: false } }))
}

function createDefaultCorrectionStore() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !supabaseSecret) return null
  return createSupabaseCorrectionStore(createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false, autoRefreshToken: false } }))
}

// item -> { validate, toColumns }. Only the two field-kind items (shared/
// aivex/correction-items.js's CORRECTION_ITEM_KIND) are handled; a
// document-kind item's label falls through to the generic 'not_ready' reply.
const FIELD_ITEMS = {
  'Team information': {
    validate: readTeam,
    toColumns: (value) => ({
      team_name: value.name,
      wilaya_code: value.wilaya.code,
      wilaya_name: value.wilaya.name,
      institution_id: value.institution.id,
      institution_name: value.institution.name,
      institution_custom: value.institution.custom,
    }),
  },
  'Activities manager': {
    validate: readActivityOfficial,
    toColumns: (value) => ({
      activity_official_role: value.role,
      activity_official_name: value.fullName,
      activity_official_email: value.email,
      activity_official_phone: value.phone,
    }),
  },
}

export function createMagicLinkVerifyHandler({
  createMagicLinkStore = createDefaultMagicLinkStore, createSignedDocumentStore = createDefaultSignedDocumentStore,
  createCorrectionStore = createDefaultCorrectionStore, now = () => new Date(),
} = {}) {
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

    // Field-kind correction resubmission (see the file header): a genuinely
    // different, mutating request, held to its own tighter rate limit on
    // top of the one just spent above, and answered without ever reaching
    // the read-only status logic below.
    if (typeof body?.itemId === 'string' && body?.fields && typeof body.fields === 'object' && !Array.isArray(body.fields)) {
      const fieldRate = consumeRateLimit(`aivex-correction-field:${getClientIp(req)}`, FIELD_CORRECTION_RATE_LIMIT)
      if (!fieldRate.allowed) {
        res.setHeader('Retry-After', String(fieldRate.retryAfterSeconds))
        refuse(res, 429, { success: false, status: 'rate_limited', message: 'Too many attempts. Please wait a moment, then try again.' })
        return
      }
      const corrections = createCorrectionStore()
      if (!corrections) {
        console.error('[aivex] Missing Supabase server configuration.')
        refuse(res, 500, { success: false, status: 'server_configuration', message: 'Server configuration error.' })
        return
      }
      let fieldStage = 'resolve'
      try {
        const clock = now()
        const resolved = await resolveMagicLink({ magicLinkStore, rawToken: token, now: clock })
        if (!resolved.ok) return refuse(res, 401, { success: false, status: resolved.status })

        fieldStage = 'load-item'
        const item = await corrections.loadItem(body.itemId)
        if (!item || item.registration_id !== resolved.registrationId) {
          return refuse(res, 404, { success: false, status: 'correction_item_not_found', message: 'This correction item could not be found.' })
        }
        if (item.kind !== 'field' || item.status !== 'open') {
          return refuse(res, 409, { success: false, status: 'correction_item_not_ready', message: 'This item is no longer open for a correction.' })
        }
        const spec = FIELD_ITEMS[item.item]
        if (!spec) return refuse(res, 409, { success: false, status: 'correction_item_not_ready', message: 'This item does not accept these fields.' })

        const validated = spec.validate(body.fields)
        if (!validated.ok) return refuse(res, 400, { success: false, status: 'invalid_field', message: validated.message, field: validated.field })

        fieldStage = 'apply'
        await corrections.updateRegistrationFields(resolved.registrationId, spec.toColumns(validated.value))
        await corrections.markFieldItemSubmitted(item.id, validated.value, clock)
        await magicLinkStore.touchLastUsed(resolved.magicLinkId, clock).catch(() => {})
        send(res, 200, { success: true, status: 'submitted' })
      } catch (error) {
        console.error('[aivex] Correction field submission failed', { stage: error?.stage || fieldStage, code: error?.code })
        refuse(res, 500, { success: false, status: 'submission_failed', message: 'This correction could not be saved.' })
      }
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

      // Whether a signed document exists is independent of document_status:
      // requesting corrections on something else entirely (a student card,
      // the team's own information) overwrites document_status to
      // 'changes_required', but never touches aivex_submitted_documents —
      // the file already on record must keep showing up here regardless.
      let signedDocument
      if (!['not_generated', 'generating'].includes(registration.document_status)) {
        stage = 'load-signed-document'
        const signedDocumentStore = createSignedDocumentStore()
        const latest = signedDocumentStore ? await signedDocumentStore.latestForCandidate(resolved.registrationId) : null
        if (latest) signedDocument = { version: latest.version, uploadedAt: latest.uploaded_at }
      }

      let correctionRequest
      if (registration.document_status === 'changes_required') {
        stage = 'load-correction'
        correctionRequest = await magicLinkStore.latestOpenCorrection(resolved.registrationId) || undefined
      }

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
        ...(signedDocument ? { signedDocument } : {}),
        ...(correctionRequest ? { correctionRequest } : {}),
      })
    } catch (error) {
      console.error('[aivex] Magic link verification failed', { stage: error?.stage || stage, code: error?.code })
      refuse(res, 500, { success: false, status: 'server_error' })
    }
  }
}

export default createMagicLinkVerifyHandler()
