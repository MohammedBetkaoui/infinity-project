// POST /api/aivex/register — Vercel Serverless Function (Node, ESM).
//
// AIVEX registration, form v4 only (shared/aivex/contract-v4.js):
//
// Browser (multipart: payload = canonical v4 JSON, studentCard_1..3 = files)
//   -> origin / rate-limit checks -> streaming multipart parse -> honeypot
//   -> validateRegistrationV4 (team, institution, activity contact,
//      delegation, exactly three students, BAC years, RFIDs, consent,
//      submissionId, edition, formVersion)
//   -> validateStudentCardsV4 (presence, type, size, real image bytes)
//   -> registerV4: idempotent on submissionId, aivex_registrations,
//      private Storage, aivex_students (api/_lib/aivex-registration-v4.js)
//   -> generateOfficialDocuments: best-effort DOCX/PDF generation
//      (api/_lib/aivex-document-generation.js) — never changes the response
//   -> 201 { success: true, reference } | 200 replay { ..., alreadyProcessed }
//
// A v3 payload is refused with a 400 ("reload the page"), never converted.
// Nothing is written until everything has been validated. Same conventions
// as api/join.js: secrets from process.env only, JSON responses without
// internals, logs carry error codes and never personal data.

import { createClient } from '@supabase/supabase-js'
import {
  AIVEX_EDITION, AIVEX_STUDENT_COUNT, LIMITS, STUDENT_CARD_FIELD_PATTERN, STUDENT_CARD_POLICY, registrationResponsesV4, validateRegistrationV4,
} from '../../shared/aivex/contract-v4.js'
import { generateOfficialDocuments } from '../_lib/aivex-document-generation.js'
import { createSupabaseDocumentStore } from '../_lib/aivex-document-store.js'
import { generateRegistrationReference } from '../_lib/aivex-reference.js'
import { createSupabaseRegistrationStore, registerV4 } from '../_lib/aivex-registration-v4.js'
import { validateStudentCardsV4 } from '../_lib/aivex-validation-v4.js'
import { isFilled, sendJson as send } from '../_lib/http.js'
import { MultipartError, parseMultipart } from '../_lib/multipart.js'
import { consumeRateLimit, getClientIp, isTrustedOrigin } from '../_lib/security.js'

// Several images per attempt: stricter than the text-only join form.
const RATE_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 }
const MULTIPART_LIMITS = {
  maxFileBytes: STUDENT_CARD_POLICY.maxBytes,
  maxFiles: AIVEX_STUDENT_COUNT,
  // Memory guard for one request. Vercel itself rejects bodies above 4.5 MB.
  maxRequestBytes: 30 * 1024 * 1024,
  allowedFields: new Set(['payload']),
  fileFieldPattern: STUDENT_CARD_FIELD_PATTERN,
}

const reply = (res, { status, body, retryAfterSeconds }) => {
  if (retryAfterSeconds) res.setHeader('Retry-After', String(retryAfterSeconds))
  send(res, status, body)
}
const refuse = (res, status, message, field) => reply(res, registrationResponsesV4.failed(status, message, field))

// Page the form was sent from (origin + path only), kept as `source`.
function requestSource(req) {
  try {
    const url = new URL(req.headers?.referer)
    return `${url.origin}${url.pathname}`.slice(0, LIMITS.source)
  } catch {
    return null
  }
}

// Secret key from the server environment only: never VITE_/INFINITY_/AIVEX_.
function createDefaultSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !supabaseSecret) return null
  return createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false, autoRefreshToken: false } })
}
const createDefaultStore = () => {
  const supabase = createDefaultSupabaseClient()
  return supabase ? createSupabaseRegistrationStore(supabase) : null
}
const createDefaultDocumentStore = () => {
  const supabase = createDefaultSupabaseClient()
  return supabase ? createSupabaseDocumentStore(supabase) : null
}

// Factory so tests can inject an in-memory store and a fixed clock.
export function createRegisterHandler({
  createStore = createDefaultStore, createDocumentStore = createDefaultDocumentStore,
  now = () => new Date(), generateReference = generateRegistrationReference,
} = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      refuse(res, 405, 'Method not allowed.')
      return
    }

    // Same policy as api/join.js: enforced on Vercel deployments only, since
    // local dev serves the app and the API from different origins.
    if (process.env.VERCEL && !isTrustedOrigin(req)) {
      refuse(res, 403, 'This submission was refused. Please try again from the official site page.')
      return
    }

    const rateLimit = consumeRateLimit(`aivex-register:${getClientIp(req)}`, RATE_LIMIT)
    if (!rateLimit.allowed) {
      reply(res, { ...registrationResponsesV4.failed(429, 'Too many attempts. Please wait a moment, then try again.'), retryAfterSeconds: rateLimit.retryAfterSeconds })
      return
    }

    let parsed
    try {
      parsed = await parseMultipart(req, MULTIPART_LIMITS)
    } catch (error) {
      if (error instanceof MultipartError) refuse(res, error.status, error.message)
      else refuse(res, 400, 'Invalid registration data.')
      return
    }

    let body
    try {
      body = JSON.parse(parsed.fields.payload ?? '')
    } catch {
      refuse(res, 400, 'Invalid registration data.')
      return
    }

    // Honeypot: a neutral, well-formed success with no write and no upload,
    // so a bot cannot tell it was filtered.
    if (isFilled(body?.website)) {
      reply(res, registrationResponsesV4.created(generateReference(AIVEX_EDITION)))
      return
    }

    const clock = now()
    const registration = validateRegistrationV4(body, { now: clock })
    if (!registration.ok) {
      refuse(res, registration.status, registration.message, registration.field)
      return
    }

    const cardCheck = await validateStudentCardsV4(registration.value.students, parsed.files)
    if (!cardCheck.ok) {
      refuse(res, cardCheck.status, cardCheck.message, cardCheck.field)
      return
    }

    const store = createStore()
    if (!store) {
      console.error('[aivex] Missing Supabase server configuration.')
      refuse(res, 500, 'Server configuration error.')
      return
    }

    const outcome = await registerV4({
      store,
      registration: registration.value,
      cards: cardCheck.cards,
      source: requestSource(req),
      now: clock,
      generateReference,
    })

    // Best-effort, never awaited into the response's success/failure: a
    // document-generation problem must not turn a valid registration into
    // an error for the applicant (document_status carries the real outcome).
    if (outcome.registrationId) {
      try {
        const documentStore = createDocumentStore()
        if (documentStore) await generateOfficialDocuments({ store: documentStore, registrationId: outcome.registrationId, now: clock })
      } catch (error) {
        console.error('[aivex] Document generation step crashed', { code: error?.code })
      }
    }

    reply(res, outcome)
  }
}

export default createRegisterHandler()
