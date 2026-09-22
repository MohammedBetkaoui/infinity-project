// POST /api/aivex/register — Vercel Serverless Function (Node, ESM).
//
// AIVEX registration, form v4 only (shared/aivex/contract-v4.js):
//
// Browser (multipart: payload = canonical v4 JSON, studentCard_1..3 = the
// student cards, delegationHeadIdCard + driverIdCard = the identity cards)
//   -> origin / rate-limit checks -> streaming multipart parse (five files at
//      most, 5 MB each, refused WHILE they stream) -> honeypot
//   -> validateRegistrationV4 (team, institution, activity contact,
//      delegation, exactly three students, names, phones, RFIDs, BAC years,
//      consent, submissionId, edition, formVersion) — the shared contract,
//      the same rules the form applies, re-run here as the authority; nothing
//      below runs, and nothing is opened or written, until it passes
//   -> validateRegistrationFilesV4 (all five images: presence, type, size,
//      real image bytes, SHA-256 of the identity cards)
//   -> registerV4: idempotent on submissionId, aivex_registrations,
//      two private Storage buckets, aivex_students
//      (api/_lib/aivex-registration-v4.js)
//   -> generateOfficialDocuments: best-effort official DOCX generation
//      (api/_lib/aivex-document-generation.js) — never changes the response;
//      the browser then downloads it through api/aivex/document.js
//   -> issueMagicLink: best-effort candidate access link
//      (api/_lib/aivex-magic-link.js), added to the response when it
//      succeeds; a failure here never changes the response either — the
//      applicant's own browser can still use api/aivex/document.js, and
//      api/aivex/magic-link.js is the recovery path for a link afterwards
//   -> 201 { success: true, reference, magicLink? } | 200 replay { ..., alreadyProcessed }
//
// A v3 payload is refused with a 400 ("reload the page"), never converted.
// Nothing is written until everything has been validated. Same conventions
// as api/join.js: secrets from process.env only, JSON responses without
// internals, logs carry error codes and never personal data.

import { createClient } from '@supabase/supabase-js'
import {
  AIVEX_EDITION, IDENTITY_CARD_FIELDS, IDENTITY_CARD_POLICY, LIMITS, REGISTRATION_FILE_FIELD_PATTERN, REGISTRATION_MAX_FILES,
  STUDENT_CARD_POLICY, registrationResponsesV4, validateRegistrationV4,
} from '../../shared/aivex/contract-v4.js'
import { generateOfficialDocuments } from '../../api/_lib/aivex-document-generation.js'
import { createSupabaseDocumentStore } from '../../api/_lib/aivex-document-store.js'
import { issueMagicLink } from '../../api/_lib/aivex-magic-link.js'
import { createSupabaseMagicLinkStore } from '../../api/_lib/aivex-magic-link-store.js'
import { generateRegistrationReference } from '../../api/_lib/aivex-reference.js'
import { createSupabaseRegistrationStore, registerV4 } from '../../api/_lib/aivex-registration-v4.js'
import { validateRegistrationFilesV4 } from '../../api/_lib/aivex-validation-v4.js'
import { isFilled, sendJson as send } from '../../api/_lib/http.js'
import { MultipartError, parseMultipart } from '../../api/_lib/multipart.js'
import { consumeRateLimit, getClientIp, isTrustedOrigin } from '../../api/_lib/security.js'

// Several images per attempt: stricter than the text-only join form.
const RATE_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 }
const MULTIPART_LIMITS = {
  // The most permissive of the two file policies: the parser stops a file at
  // this size WHILE it streams; validateRegistrationFilesV4 then applies each
  // kind's own rule.
  maxFileBytes: Math.max(STUDENT_CARD_POLICY.maxBytes, IDENTITY_CARD_POLICY.maxBytes),
  // Three student cards + the two identity cards, and nothing else.
  maxFiles: REGISTRATION_MAX_FILES,
  // Memory guard for one request (five files of 5 MB and the payload). Vercel
  // itself rejects bodies above 4.5 MB.
  maxRequestBytes: 30 * 1024 * 1024,
  allowedFields: new Set(['payload']),
  fileFieldPattern: REGISTRATION_FILE_FIELD_PATTERN,
  fileSizeMessage: (field) => (IDENTITY_CARD_FIELDS.includes(field)
    ? 'Each identity card image must be 5 MB or smaller.'
    : 'Each student card must be 5 MB or smaller.'),
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
const createDefaultMagicLinkStore = () => {
  const supabase = createDefaultSupabaseClient()
  return supabase ? createSupabaseMagicLinkStore(supabase) : null
}

// Factory so tests can inject an in-memory store and a fixed clock.
export function createRegisterHandler({
  createStore = createDefaultStore, createDocumentStore = createDefaultDocumentStore, createMagicLinkStore = createDefaultMagicLinkStore,
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
      if (error instanceof MultipartError) refuse(res, error.status, error.message, error.field)
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
    const registration = validateRegistrationV4(body)
    if (!registration.ok) {
      refuse(res, registration.status, registration.message, registration.field)
      return
    }

    // Nothing is stored before every image has passed: a request that fails
    // here leaves no file and no row behind.
    const fileCheck = await validateRegistrationFilesV4(registration.value.students, parsed.files)
    if (!fileCheck.ok) {
      refuse(res, fileCheck.status, fileCheck.message, fileCheck.field)
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
      cards: fileCheck.cards,
      identityCards: fileCheck.identityCards,
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

      // Same best-effort discipline: a link the applicant can reopen later
      // is valuable, but its failure must never turn a valid registration
      // into an error, and the raw link/token is never logged (only a
      // stage + code on failure, nothing at all on success).
      try {
        const magicLinkStore = createMagicLinkStore()
        if (magicLinkStore) {
          const { magicLink } = await issueMagicLink({
            magicLinkStore, registrationId: outcome.registrationId, now: clock, ip: getClientIp(req), userAgent: req.headers?.['user-agent'], req,
          })
          if (magicLink) outcome.body = { ...outcome.body, magicLink }
        }
      } catch (error) {
        console.error('[aivex] Magic link issuance step crashed', { code: error?.code })
      }
    }

    reply(res, outcome)
  }
}

export default createRegisterHandler()

