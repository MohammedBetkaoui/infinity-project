// POST /api/aivex/magic-link/document — Vercel Serverless Function (Node, ESM).
//
// Downloads the official AIVEX Word document for whichever registration a
// Magic Link resolves to (api/_lib/aivex-magic-link.js's resolveMagicLink —
// shared with api/aivex/magic-link/verify.js, so both endpoints agree on
// what "valid" means, re-checked independently on every call: a link can
// expire or be revoked between a page's verify call and this one).
//
// This is a new, separate endpoint rather than a change to the existing
// api/aivex/document.js: that endpoint's contract (reference + submissionId
// identify the registration) is already deployed and tested, and must keep
// working unchanged for the original submitting browser. Here, the token
// alone is the whole authorization context — nothing else in the request
// body can select a different registration (never "token + arbitrary
// reference"; only resolveMagicLink's own registrationId is ever used).
//
// Browser (JSON: { token })
//   -> origin / rate-limit checks -> bounded JSON body
//   -> resolveMagicLink -> registration's own reference read back
//      (loadCandidateRegistration) for the filename, never the caller's
//   -> docx row not generated yet: one idempotent generation attempt (the
//      same claim-guarded pipeline api/aivex/document.js also runs)
//   -> 200 the .docx bytes, as an attachment, never cached
//
// The private bucket, the file path and the Supabase URL never reach the
// response. Logs carry a stage and a code only — never the token.

import { createClient } from '@supabase/supabase-js'
import { generateOfficialDocuments } from '../../_lib/aivex-document-generation.js'
import { createSupabaseDocumentStore } from '../../_lib/aivex-document-store.js'
import { resolveMagicLink } from '../../_lib/aivex-magic-link.js'
import { createSupabaseMagicLinkStore } from '../../_lib/aivex-magic-link-store.js'
import { DOCX_MIME } from '../../_lib/aivex-document-template.js'
import { officialDocumentFilename } from '../document.js'
import { readJsonBody, sendJson as send } from '../../_lib/http.js'
import { consumeRateLimit, getClientIp, isTrustedOrigin } from '../../_lib/security.js'

const RATE_LIMIT = { max: 20, windowMs: 15 * 60 * 1000 }
const MAX_BODY_BYTES = 1 * 1024

const refuse = (res, status, body) => send(res, status, body)

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
const createDefaultDocumentStore = () => {
  const supabase = createDefaultSupabaseClient()
  return supabase ? createSupabaseDocumentStore(supabase) : null
}

export function createMagicLinkDocumentHandler({
  createMagicLinkStore = createDefaultMagicLinkStore, createDocumentStore = createDefaultDocumentStore, now = () => new Date(),
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

    const rateLimit = consumeRateLimit(`aivex-magic-link-document:${getClientIp(req)}`, RATE_LIMIT)
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
      refuse(res, 429, { success: false, message: 'Too many attempts. Please wait a moment, then try again.' })
      return
    }

    const body = await readJsonBody(req, MAX_BODY_BYTES)
    const token = typeof body?.token === 'string' ? body.token : ''

    const magicLinkStore = createMagicLinkStore()
    const documentStore = createDocumentStore()
    if (!magicLinkStore || !documentStore) {
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

      stage = 'load-document-row'
      let row = await documentStore.loadDocumentRow(resolved.registrationId, 'docx')
      if (row?.generation_status !== 'generated') {
        // Same retry api/aivex/document.js performs: claim-guarded, so a
        // concurrent or already-settled generation is never duplicated.
        stage = 'generate'
        await generateOfficialDocuments({ store: documentStore, registrationId: resolved.registrationId, now: clock })
        stage = 'load-document-row'
        row = await documentStore.loadDocumentRow(resolved.registrationId, 'docx')
      }
      if (row?.generation_status !== 'generated' || !row.file_path) {
        refuse(res, 409, { success: false, status: 'document_not_ready' })
        return
      }

      stage = 'touch'
      await magicLinkStore.touchLastUsed(resolved.magicLinkId, clock).catch((error) => {
        console.error('[aivex] Magic link touch failed', { stage: 'touch', code: error?.code })
      })

      stage = 'download'
      const file = await documentStore.downloadDocument(row.file_path)
      res.statusCode = 200
      res.setHeader('Content-Type', DOCX_MIME)
      res.setHeader('Content-Length', String(file.length))
      res.setHeader('Content-Disposition', `attachment; filename="${officialDocumentFilename(registration.reference)}"`)
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
      res.end(file)
    } catch (error) {
      console.error('[aivex] Magic link document download failed', { stage: error?.stage || stage, code: error?.code })
      refuse(res, 500, { success: false, message: 'The official document could not be downloaded. Please try again.' })
    }
  }
}

export default createMagicLinkDocumentHandler()
