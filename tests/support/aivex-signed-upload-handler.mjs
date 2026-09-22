// POST /api/aivex/magic-link/upload — Vercel Serverless Function (Node, ESM).
//
// Phase 5B: the candidate uploads the final signed/stamped copy of the
// official AIVEX document. The Magic Link token is the entire authorization
// context — exactly like api/aivex/magic-link/verify.js and
// api/aivex/magic-link/document.js, reusing the same resolveMagicLink
// (api/_lib/aivex-magic-link.js, untouched) so all three endpoints agree,
// independently, on what "valid" means.
//
// Browser (multipart/form-data: token, uploadId, file)
//   -> origin / rate-limit checks -> streaming multipart parse
//   -> resolveMagicLink: invalid / revoked / expired / ok
//   -> validateSignedDocumentUpload: real magic bytes, not the declared
//      type or the file name (PDF, JPG or PNG; up to 10 MB)
//   -> uploadSignedDocument: idempotent on uploadId, safe under concurrent
//      uploads, only flips document_status once the file AND its metadata
//      row both exist
//   -> 200 { success: true, status: 'signed_document_uploaded', version }
//
// `registrationId`, `reference`, or any other identity field the browser
// might send is never read — the token alone selects the registration
// (api/_lib/aivex-magic-link.js's resolveMagicLink). Logs carry a stage and
// a code only — never the token, never the file's bytes or name.

import { createClient } from '@supabase/supabase-js'
import { MAX_SIGNED_DOCUMENT_SIZE } from '../../shared/aivex/signed-document-policy.js'
import { resolveMagicLink } from '../../api/_lib/aivex-magic-link.js'
import { createSupabaseMagicLinkStore } from '../../api/_lib/aivex-magic-link-store.js'
import { createSupabaseSignedDocumentStore } from '../../api/_lib/aivex-signed-document-store.js'
import { uploadSignedDocument } from '../../api/_lib/aivex-signed-document-upload.js'
import { validateSignedDocumentUpload } from '../../api/_lib/aivex-signed-document-validation.js'
import { sendJson as send } from '../../api/_lib/http.js'
import { MultipartError, parseMultipart } from '../../api/_lib/multipart.js'
import { consumeRateLimit, getClientIp, isTrustedOrigin } from '../../api/_lib/security.js'

// Files are heavier than a status check: a stricter budget than verify's
// 30/15min (and than /api/aivex/document's 20/15min), while still leaving
// room for a candidate to recover from picking the wrong file once or
// twice. Best-effort / per-instance, same as every other limit in this API
// (api/_lib/security.js) — not a distributed guarantee.
const RATE_LIMIT = { max: 8, windowMs: 15 * 60 * 1000 }
const MULTIPART_LIMITS = {
  maxFileBytes: MAX_SIGNED_DOCUMENT_SIZE,
  maxFiles: 1,
  // A little slack over the file limit itself for the token/uploadId
  // fields and multipart boundary overhead.
  maxRequestBytes: MAX_SIGNED_DOCUMENT_SIZE + 32 * 1024,
  allowedFields: new Set(['token', 'uploadId']),
  fileFieldPattern: /^file$/,
  // Overrides parseMultipart's defaults, which are worded for the
  // registration form's student cards (a different limit, 5 MB) — see
  // api/_lib/multipart.js.
  contentTypeMessage: 'The signed document must be sent as multipart/form-data.',
  fileSizeMessage: `The signed document must be ${Math.round(MAX_SIGNED_DOCUMENT_SIZE / (1024 * 1024))} MB or smaller.`,
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
const createDefaultSignedDocumentStore = () => {
  const supabase = createDefaultSupabaseClient()
  return supabase ? createSupabaseSignedDocumentStore(supabase) : null
}

export function createMagicLinkUploadHandler({
  createMagicLinkStore = createDefaultMagicLinkStore, createSignedDocumentStore = createDefaultSignedDocumentStore, now = () => new Date(),
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

    const rateLimit = consumeRateLimit(`aivex-magic-link-upload:${getClientIp(req)}`, RATE_LIMIT)
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
      refuse(res, 429, { success: false, message: 'Too many attempts. Please wait a moment, then try again.' })
      return
    }

    let parsed
    try {
      parsed = await parseMultipart(req, MULTIPART_LIMITS)
    } catch (error) {
      if (error instanceof MultipartError) refuse(res, error.status, { success: false, message: error.message })
      else refuse(res, 400, { success: false, message: 'Invalid upload request.' })
      return
    }

    const token = typeof parsed.fields.token === 'string' ? parsed.fields.token : ''
    const uploadId = typeof parsed.fields.uploadId === 'string' && UUID_RE.test(parsed.fields.uploadId) ? parsed.fields.uploadId.toLowerCase() : null

    const magicLinkStore = createMagicLinkStore()
    const signedDocumentStore = createSignedDocumentStore()
    if (!magicLinkStore || !signedDocumentStore) {
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

      stage = 'validate-file'
      const file = parsed.files.get('file')
      const validated = await validateSignedDocumentUpload(file)
      if (!validated.ok) {
        refuse(res, validated.status, { success: false, message: validated.message })
        return
      }

      stage = 'upload'
      const outcome = await uploadSignedDocument({
        store: signedDocumentStore, registrationId: resolved.registrationId, uploadId,
        file: { ...validated, filename: file.filename }, now: clock,
      })
      if (!outcome.ok) {
        refuse(res, 409, { success: false, status: outcome.reason })
        return
      }

      stage = 'touch'
      await magicLinkStore.touchLastUsed(resolved.magicLinkId, clock).catch((error) => {
        console.error('[aivex] Magic link touch failed', { stage: 'touch', code: error?.code })
      })

      send(res, 200, { success: true, status: 'signed_document_uploaded', version: outcome.version })
    } catch (error) {
      console.error('[aivex] Magic link upload failed', { stage: error?.stage || stage, code: error?.code })
      refuse(res, 500, { success: false, message: 'The signed document could not be uploaded. Please try again.' })
    }
  }
}

export default createMagicLinkUploadHandler()

