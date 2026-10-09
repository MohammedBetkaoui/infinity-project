// POST /api/join — Vercel Serverless Function (Node, ESM).
//
// Browser -> POST /api/join (application/json, at most 64 KB)
//   -> method / content-type / size checks -> same-site check
//   -> deployment-wide rate limit (Upstash Redis, local fallback)
//   -> bounded JSON body -> honeypot (neutral success, nothing written)
//   -> server validation (explicit allowlist, Faculty -> Department pair)
//   -> Cloudflare Turnstile verification (server-side Siteverify)
//   -> indexed duplicate lookup -> INSERT public.membership_applications
//   -> 201 { success: true, reference }
//
// Supabase is NEVER called from React. The secret key lives only here,
// server-side, via process.env. No SQL is built by hand: all writes go
// through the official @supabase/supabase-js client (parameterized).
// Duplicate contacts are finally refused by the database's unique indexes
// (email, normalized phone); the lookup below only answers earlier.
//
// Logs carry error codes and fixed reasons only: never the body, a name,
// an e-mail address, a phone number, an IP address, a token or a secret.
// See docs/join-security.md.

import { createClient } from '@supabase/supabase-js'
import { isValidDepartmentForFaculty, isValidFaculty } from '../shared/membership/university-structure.js'
import { consumeDistributedRateLimit } from './_lib/distributed-rate-limit.js'
import { isFilled, isJsonContentType, normalizeString, readBoundedJsonBody, sendJson as send } from './_lib/http.js'
import { normalizeMembershipPhone } from './_lib/membership-phone.js'
import { emitJoinApplicationNotification } from './_lib/admin-notifications.js'
import { getClientIp, isTrustedOrigin } from './_lib/security.js'
import { verifyTurnstileToken } from './_lib/turnstile.js'
import {
  createStaffConfirmationSubmitHandler, createStaffConfirmationVerifyHandler,
} from './_lib/staff-confirmation-handlers.js'

const MAX_BODY_BYTES = 65536
const RATE_LIMIT = { max: 8, windowMs: 10 * 60 * 1000 }
// v4 added the Turnstile check. An older open tab cannot pass it, so it is
// asked to reload rather than being refused without explanation.
const CURRENT_FORM_VERSION = 4
const TURNSTILE_ACTION = 'join'

const ALLOWED_STUDY_YEARS = new Set(['L1', 'L2', 'L3', 'M1', 'M2', 'E1', 'E2', 'E3', 'E4', 'E5', 'other'])
const ALLOWED_EXPERIENCE = new Set(['starting', 'learning', 'building'])
const ALLOWED_AVAILABILITY = new Set(['weekly', 'events', 'flexible'])
const ALLOWED_JOIN_TYPES = new Set(['member', 'staff'])
// Stored as the slug; the label also fills primary_field for staff rows.
const STAFF_DEPARTMENTS = {
  'dev-tech': 'Dev / Tech',
  'design-content': 'Design / Content Creation',
  'management-logistics': 'Management / Logistics',
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MAX_LEN = {
  fullName: 120,
  email: 254,
  phone: 40,
  memberInterest: 120,
}

// One neutral answer for any duplicate contact: it never says whether the
// e-mail address or the phone number matched, so the public endpoint cannot
// be used to find out who already applied.
const DUPLICATE_MESSAGE = 'An application with these contact details may already exist. Please contact the club if you need help.'
const SECURITY_CHECK_MESSAGE = 'We couldn’t verify the security check. Please try again.'
const SERVICE_UNAVAILABLE_MESSAGE = 'We could not send your application right now. Please try again in a few minutes.'
const SAVE_FAILED_MESSAGE = 'We could not save your application. Please try again.'

// Early answer for the common case, through indexed equality lookups only
// (email, phone_normalized): no application rows are scanned or loaded. A
// failed lookup is logged (code only) and ignored — the unique indexes still
// refuse the insert.
const hasDuplicateContact = async (supabase, email, phoneKey) => {
  const lookups = [
    supabase.from('membership_applications').select('id').eq('email', email).limit(1),
    ...(phoneKey ? [supabase.from('membership_applications').select('id').eq('phone_normalized', phoneKey).limit(1)] : []),
  ]
  const results = await Promise.all(lookups)
  let duplicate = false
  for (const { data, error } of results) {
    if (error) console.error('[join] Duplicate lookup failed', { code: error.code })
    else if (data?.length) duplicate = true
  }
  return duplicate
}

const invalid = (res, message, field) => {
  send(res, 400, field
    ? { success: false, message, field }
    : { success: false, message })
  return false
}

// Only the page path is kept: never a query string, a fragment or a host,
// which could carry tokens or tracking identifiers. Older clients sent the
// full href; it is reduced the same way.
const sourcePath = (value) => {
  const raw = normalizeString(value)
  if (!raw) return null
  try {
    const { pathname } = new URL(raw, 'https://source.invalid')
    return /^\/[A-Za-z0-9/_-]{0,120}$/.test(pathname) ? pathname : null
  } catch {
    return null
  }
}

// Validate the membership payload. Returns the row to insert, or null after
// the 400 response has already been sent.
const validateApplication = (res, body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    invalid(res, 'Invalid application data.')
    return null
  }

  if (body.form !== 'membership') {
    invalid(res, 'Invalid application data.', 'form')
    return null
  }

  const formVersion = Number.isFinite(body.version) ? Math.trunc(body.version) : 1
  if (formVersion < CURRENT_FORM_VERSION) {
    invalid(res, 'This form has been updated. Please reload the page, then send your application again.', 'version')
    return null
  }

  const answers = body.answers
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    invalid(res, 'Invalid application data.')
    return null
  }

  const fullName = normalizeString(answers.fullName)
  if (fullName.length < 3 || fullName.length > MAX_LEN.fullName) {
    invalid(res, 'Please enter your full name.', 'fullName')
    return null
  }

  const email = normalizeString(answers.email).toLowerCase()
  if (!EMAIL_RE.test(email) || email.length > MAX_LEN.email) {
    invalid(res, 'Enter a valid email address.', 'email')
    return null
  }

  const phoneRaw = answers.phone
  let phone = null
  if (phoneRaw !== undefined && phoneRaw !== null && String(phoneRaw).trim() !== '') {
    if (typeof phoneRaw !== 'string') {
      invalid(res, 'Enter a valid phone number or leave it empty.', 'phone')
      return null
    }
    phone = phoneRaw.trim()
    if (phone.length > MAX_LEN.phone || phone.replace(/\D/g, '').length < 8) {
      invalid(res, 'Enter a valid phone number or leave it empty.', 'phone')
      return null
    }
  }

  const studyYear = normalizeString(answers.studyYear)
  if (!ALLOWED_STUDY_YEARS.has(studyYear)) {
    invalid(res, 'Please select your study level.', 'studyYear')
    return null
  }

  // Faculty -> Department, checked against the same list the form uses
  // (shared/membership/university-structure.js): a department is only
  // accepted inside its own faculty. The database enforces the same pairs.
  const faculty = normalizeString(answers.faculty)
  if (!isValidFaculty(faculty)) {
    invalid(res, 'Please select your faculty.', 'faculty')
    return null
  }

  const department = normalizeString(answers.department)
  if (!isValidDepartmentForFaculty(faculty, department)) {
    invalid(res, 'Please select a department of your faculty.', 'department')
    return null
  }

  const joinType = normalizeString(answers.joinType)
  if (!ALLOWED_JOIN_TYPES.has(joinType)) {
    invalid(res, 'Choose how you would like to join Infinity.', 'joinType')
    return null
  }

  let memberInterest = null
  let staffDepartment = null
  if (joinType === 'member') {
    memberInterest = normalizeString(answers.memberInterest)
    if (memberInterest.length < 1 || memberInterest.length > MAX_LEN.memberInterest) {
      invalid(res, 'Choose what you would like to explore.', 'memberInterest')
      return null
    }
  } else {
    staffDepartment = normalizeString(answers.staffDepartment)
    if (!Object.hasOwn(STAFF_DEPARTMENTS, staffDepartment)) {
      invalid(res, 'Choose the department you would like to join.', 'staffDepartment')
      return null
    }
  }

  const experience = normalizeString(answers.experience)
  if (!ALLOWED_EXPERIENCE.has(experience)) {
    invalid(res, 'Please tell us where you are starting from.', 'experience')
    return null
  }

  const availability = normalizeString(answers.availability)
  if (!ALLOWED_AVAILABILITY.has(availability)) {
    invalid(res, 'Please choose your availability.', 'availability')
    return null
  }

  if (answers.consent !== true) {
    invalid(res, 'Please confirm that the club may contact you about this application.', 'consent')
    return null
  }

  // Explicit allowlist: unknown client properties are ignored, never inserted.
  // primary_field keeps one readable "area" per row: the member's interest,
  // or the staff department's label. faculty/department are stored as slugs;
  // `department` is the university department, never the staff department.
  // phone_normalized is computed by the database from `phone`.
  return {
    full_name: fullName,
    email,
    phone,
    study_year: studyYear,
    faculty,
    department,
    join_type: joinType,
    staff_department: staffDepartment,
    primary_field: memberInterest ?? STAFF_DEPARTMENTS[staffDepartment],
    experience,
    availability,
    consent: true,
    source: sourcePath(body.source),
    form_version: formVersion,
    submitted_at: new Date().toISOString(),
  }
}

// Returns true when the request may continue; otherwise the response has
// already been sent. Mandatory on every Vercel deployment: a missing secret
// there closes the form instead of silently switching the check off. Local
// development without a secret (npm run dev:api) skips it, like the
// same-site check below.
let warnedTurnstileSkipped = false
const passesTurnstile = async (req, res, body) => {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()
  if (!secret) {
    if (process.env.VERCEL) {
      console.error('[join] Security check not configured')
      send(res, 503, { success: false, message: SERVICE_UNAVAILABLE_MESSAGE })
      return false
    }
    if (!warnedTurnstileSkipped) {
      warnedTurnstileSkipped = true
      console.warn('[join] Security check skipped: TURNSTILE_SECRET_KEY is not set (local development only)')
    }
    return true
  }

  const verification = await verifyTurnstileToken({
    secret,
    token: body.turnstileToken,
    remoteIp: getClientIp(req),
    action: TURNSTILE_ACTION,
    // Cloudflare's testing keys may be used locally and on previews, never
    // on the production deployment.
    allowTestingKeys: process.env.VERCEL_ENV !== 'production',
  })
  if (verification.ok) return true
  if (verification.reason === 'unavailable') {
    console.error('[join] Security check unavailable', { code: verification.code })
    send(res, 503, { success: false, message: SERVICE_UNAVAILABLE_MESSAGE })
    return false
  }
  send(res, 403, { success: false, message: SECURITY_CHECK_MESSAGE, field: 'turnstile' })
  return false
}

async function joinApplicationHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    send(res, 405, { success: false, message: 'Method not allowed.' })
    return
  }

  if (!isJsonContentType(req)) {
    send(res, 415, { success: false, message: 'Unsupported request.' })
    return
  }

  const declaredLength = Number(req.headers?.['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    send(res, 413, { success: false, message: 'Payload too large.' })
    return
  }

  // Same-site check: only enforced on real Vercel deployments. Local dev
  // deliberately serves the Vite app and the API on different origins
  // (see vite.config.js), so Origin would never match Host there.
  if (process.env.VERCEL && !isTrustedOrigin(req)) {
    send(res, 403, { success: false, message: 'This submission was refused. Please try again from the official site page.' })
    return
  }

  const rateLimit = await consumeDistributedRateLimit('join', getClientIp(req), RATE_LIMIT)
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
    send(res, 429, { success: false, message: 'Too many attempts. Please wait a moment, then try again.' })
    return
  }

  // Read from the raw stream with a hard byte limit, never through a
  // platform parser with its own (larger) defaults.
  const parsed = await readBoundedJsonBody(req, MAX_BODY_BYTES)
  if (!parsed.ok) {
    if (parsed.reason === 'too_large') send(res, 413, { success: false, message: 'Payload too large.' })
    else send(res, 400, { success: false, message: 'Invalid application data.' })
    return
  }
  const body = parsed.value
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    send(res, 400, { success: false, message: 'Invalid application data.' })
    return
  }

  // Honeypot (defense in depth: the frontend already strips/filters it).
  // A filled trap is answered with a neutral success WITHOUT any DB write,
  // so bots cannot tell they were filtered. Real users never hit this path.
  if (isFilled(body.answers?.website) || isFilled(body.website)) {
    const echo = normalizeString(body.reference).slice(0, 64)
    send(res, 201, { success: true, reference: echo || 'received' })
    return
  }

  const row = validateApplication(res, body)
  if (!row) return

  if (!(await passesTurnstile(req, res, body))) return

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !supabaseSecret) {
    console.error('[join] Missing server configuration.')
    send(res, 500, { success: false, message: SAVE_FAILED_MESSAGE })
    return
  }

  try {
    // No browser storage exists in a serverless function, and each
    // invocation is a single short-lived call: disable session persistence
    // and the background auto-refresh timer so nothing outlives the request.
    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    if (await hasDuplicateContact(supabase, row.email, normalizeMembershipPhone(row.phone))) {
      console.warn('[join] Duplicate application blocked', { reason: 'duplicate_contact' })
      send(res, 409, { success: false, message: DUPLICATE_MESSAGE })
      return
    }

    const { data, error } = await supabase
      .from('membership_applications')
      .insert(row)
      .select('id, reference, status, created_at')
      .single()

    if (error || !data) {
      // Two identical submissions racing past the lookup: the unique index
      // is the final authority.
      if (error?.code === '23505') {
        console.warn('[join] Duplicate application blocked', { reason: 'duplicate_contact', code: error.code })
        send(res, 409, { success: false, message: DUPLICATE_MESSAGE })
        return
      }
      // Minimal server log: code only, never PII, secrets, or full payloads.
      console.error('[join] Insertion failed', { code: error?.code })
      send(res, 500, { success: false, message: SAVE_FAILED_MESSAGE })
      return
    }

    if (!data.reference) {
      console.error('[join] Insert succeeded without a reference.')
      send(res, 500, { success: false, message: SAVE_FAILED_MESSAGE })
      return
    }

    // The application is already authoritative at this point. Notification
    // persistence/push is secondary and may never turn a successful Join
    // submission into an error for the applicant.
    await emitJoinApplicationNotification({
      supabase,
      applicationId: data.id,
      createdAt: new Date(data.created_at),
    }).catch((notificationError) => {
      console.error('[join] Administrator notification failed', { code: notificationError?.code })
    })

    send(res, 201, { success: true, reference: data.reference })
  } catch (error) {
    console.error('[join] Unexpected failure', { code: error?.code })
    send(res, 500, { success: false, message: SAVE_FAILED_MESSAGE })
  }
}

const staffConfirmationVerifyHandler = createStaffConfirmationVerifyHandler()
const staffConfirmationSubmitHandler = createStaffConfirmationSubmitHandler()

export default function handler(req, res) {
  const action = new URL(req.url || '/', 'http://localhost').searchParams.get('__join_action')
  if (action === 'staff-confirmation-verify') return staffConfirmationVerifyHandler(req, res)
  if (action === 'staff-confirmation-submit') return staffConfirmationSubmitHandler(req, res)
  return joinApplicationHandler(req, res)
}
