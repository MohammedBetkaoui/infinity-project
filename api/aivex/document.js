// POST /api/aivex/document — Vercel Serverless Function (Node, ESM).
//
// Download of the official AIVEX Word document (DOCX) generated for a
// registration (api/_lib/aivex-document-generation.js). DOCX is the only
// document the application produces: converting it to PDF, printing it and
// having it signed and stamped by the institution happens by hand.
//
// Browser (JSON: { reference, submissionId })
//   -> origin / rate-limit checks -> bounded JSON body
//   -> registration found by reference AND submissionId (the UUID the
//      submitting browser generated; it never appears in a response, on
//      paper or in a URL — hence POST, not a GET query string)
//   -> docx row not generated yet: one idempotent generation attempt (the
//      same claim-guarded pipeline the registration and the retry script run)
//   -> 200 the .docx bytes, as an attachment, never cached
//
// The file is read with the server-side client and streamed back: the
// bucket stays private, and no public or signed URL is ever created. Whoever
// holds the submissionId typed every value printed on the document.
// Responses for an unknown pair are the same 404 whether the reference
// exists or not. Logs carry a stage and a code only.

import { createClient } from '@supabase/supabase-js'
import { isUuidV4 } from '../../shared/aivex/contract-v4.js'
import { generateOfficialDocuments } from '../_lib/aivex-document-generation.js'
import { createSupabaseDocumentStore } from '../_lib/aivex-document-store.js'
import { DOCX_MIME } from '../_lib/aivex-document-template.js'
import { REGISTRATION_REFERENCE_PATTERN } from '../_lib/aivex-reference.js'
import { sendJson as send } from '../_lib/http.js'
import { consumeRateLimit, getClientIp, isTrustedOrigin } from '../_lib/security.js'

const RATE_LIMIT = { max: 20, windowMs: 15 * 60 * 1000 }
const MAX_BODY_BYTES = 2 * 1024

const refuse = (res, status, message) => send(res, status, { success: false, message })

// The request body is read here rather than through a platform body parser,
// so the handler behaves the same on Vercel and in scripts/dev-api.mjs.
function readJsonBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) tooLarge = true
      else chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) return resolve(null)
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}

function createDefaultDocumentStore() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !supabaseSecret) return null
  return createSupabaseDocumentStore(createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false, autoRefreshToken: false } }))
}

export const officialDocumentFilename = (reference) => `fiche-officielle-${reference}.docx`

export function createDocumentHandler({ createDocumentStore = createDefaultDocumentStore, now = () => new Date() } = {}) {
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

    const rateLimit = consumeRateLimit(`aivex-document:${getClientIp(req)}`, RATE_LIMIT)
    if (!rateLimit.allowed) {
      res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
      refuse(res, 429, 'Too many attempts. Please wait a moment, then try again.')
      return
    }

    const body = await readJsonBody(req)
    const reference = typeof body?.reference === 'string' ? body.reference.trim() : ''
    const submissionId = typeof body?.submissionId === 'string' ? body.submissionId.trim().toLowerCase() : ''
    if (!REGISTRATION_REFERENCE_PATTERN.test(reference) || !isUuidV4(submissionId)) {
      refuse(res, 400, 'Invalid download request.')
      return
    }

    const store = createDocumentStore()
    if (!store) {
      console.error('[aivex] Missing Supabase server configuration.')
      refuse(res, 500, 'Server configuration error.')
      return
    }

    let stage = 'find-registration'
    try {
      const registration = await store.findRegistrationForDownload({ reference, submissionId })
      if (!registration) {
        refuse(res, 404, 'No official document matches this registration.')
        return
      }

      stage = 'load-document-row'
      let row = await store.loadDocumentRow(registration.id, 'docx')
      if (row?.generation_status !== 'generated') {
        // Same retry the registration replay performs: claim-guarded, so a
        // concurrent or already-settled generation is never duplicated.
        stage = 'generate'
        await generateOfficialDocuments({ store, registrationId: registration.id, now: now() })
        stage = 'load-document-row'
        row = await store.loadDocumentRow(registration.id, 'docx')
      }
      if (row?.generation_status !== 'generated' || !row.file_path) {
        refuse(res, 409, 'The official document is not available yet. Please try again in a moment.')
        return
      }

      stage = 'download'
      const file = await store.downloadDocument(row.file_path)
      res.statusCode = 200
      res.setHeader('Content-Type', DOCX_MIME)
      res.setHeader('Content-Length', String(file.length))
      res.setHeader('Content-Disposition', `attachment; filename="${officialDocumentFilename(registration.reference)}"`)
      res.setHeader('Cache-Control', 'no-store')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
      res.end(file)
    } catch (error) {
      console.error('[aivex] Document download failed', { stage: error?.stage || stage, code: error?.code })
      refuse(res, 500, 'The official document could not be downloaded. Please try again.')
    }
  }
}

export default createDocumentHandler()
