// POST /api/join — Vercel Serverless Function (Node, ESM).
//
// Browser -> POST /api/join -> origin/rate-limit checks -> server validation
//   -> Supabase -> public.membership_applications -> 201 { success: true, reference }
//
// Supabase is NEVER called from React. The secret key lives only here,
// server-side, via process.env. No SQL is built by hand: all writes go
// through the official @supabase/supabase-js client (parameterized).
//
// NOTE on rate limiting: see api/_lib/security.js — the limiter there is
// an in-memory, best-effort defense (not a global limit across a whole
// deployment). This is the right place to plug a distributed limiter
// (Upstash Redis, Vercel KV...) later if abuse ever outgrows it.

import { createClient } from '@supabase/supabase-js'
import { consumeRateLimit, getClientIp, isTrustedOrigin } from './_lib/security.js'

const MAX_BODY_BYTES = 65536
const RATE_LIMIT = { max: 8, windowMs: 10 * 60 * 1000 }

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
  department: 120,
  memberInterest: 120,
  source: 500,
}

const send = (res, status, payload) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  // This response only ever carries a submission outcome, never anything
  // that should be cached or sniffed as a different content type.
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.end(JSON.stringify(payload))
}

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '')

const isFilled = (value) => typeof value === 'string' && value.trim().length > 0

// Digits-only form of a phone number, used for duplicate comparison so
// that '+213 555 01 02 03', '0555010203' and '00213555010203' are
// recognised as the same number. Non-Algerian numbers compare on their
// full digit string.
const phoneKey = (value) => {
  const digits = String(value || '').replace(/\D/g, '')
  const withoutCountry = digits.startsWith('00213')
    ? digits.slice(5)
    : digits.startsWith('213') && digits.length > 9
      ? digits.slice(3)
      : digits
  return withoutCountry.length === 9 ? `0${withoutCountry}` : withoutCountry
}

// Returns 'email' | 'phone' | null. A failed check query fails open (logs
// only): the insert itself remains the source of truth and surfaces real
// DB errors. No PII is ever logged.
const findDuplicateField = async (supabase, email, phone) => {
  const { data: emailHit, error: emailError } = await supabase
    .from('membership_applications')
    .select('id')
    .eq('email', email)
    .limit(1)
    .maybeSingle()
  if (emailError) {
    console.error('[join] Duplicate email check failed', { code: emailError.code })
  } else if (emailHit) {
    return 'email'
  }

  if (phone) {
    const wanted = phoneKey(phone)
    const { data: phones, error: phoneError } = await supabase
      .from('membership_applications')
      .select('phone')
      .not('phone', 'is', null)
      .limit(10000)
    if (phoneError) {
      console.error('[join] Duplicate phone check failed', { code: phoneError.code })
    } else if ((phones || []).some((existing) => existing.phone && phoneKey(existing.phone) === wanted)) {
      return 'phone'
    }
  }

  return null
}

const invalid = (res, message, field) => {
  send(res, 400, field
    ? { success: false, message, field }
    : { success: false, message })
  return false
}

const readBody = (req) => {
  const raw = req.body
  if (raw && typeof raw === 'object') return raw
  if (typeof raw === 'string' && raw.length > 0) return JSON.parse(raw)
  return {}
}

// Validate the membership payload. Returns { ok: true, row } or
// { ok: false } after the 400 response has already been sent.
const validateApplication = (res, body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    invalid(res, 'Invalid application data.')
    return null
  }

  if (body.form !== 'membership') {
    invalid(res, 'Invalid application data.', 'form')
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

  const department = normalizeString(answers.department)
  if (department.length < 1 || department.length > MAX_LEN.department) {
    invalid(res, 'Please enter your department.', 'department')
    return null
  }

  const formVersion = Number.isFinite(body.version) ? Math.trunc(body.version) : 1

  // v1 clients (a tab opened before the Member/Staff release) had no role
  // choice: they were all member applications, with the interest in primaryField.
  const legacy = formVersion < 2 && answers.joinType === undefined
  const joinType = legacy ? 'member' : normalizeString(answers.joinType)
  if (!ALLOWED_JOIN_TYPES.has(joinType)) {
    invalid(res, 'Choose how you would like to join Infinity.', 'joinType')
    return null
  }

  let memberInterest = null
  let staffDepartment = null
  if (joinType === 'member') {
    memberInterest = normalizeString(legacy ? answers.primaryField : answers.memberInterest)
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

  const source = normalizeString(body.source).slice(0, MAX_LEN.source) || null

  // Explicit allowlist: unknown client properties are ignored, never inserted.
  // primary_field keeps one readable "area" per row: the member's interest,
  // or the staff department's label.
  return {
    full_name: fullName,
    email,
    phone,
    study_year: studyYear,
    department,
    join_type: joinType,
    staff_department: staffDepartment,
    primary_field: memberInterest ?? STAFF_DEPARTMENTS[staffDepartment],
    experience,
    availability,
    consent: true,
    source,
    form_version: formVersion,
    submitted_at: new Date().toISOString(),
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    send(res, 405, { success: false, message: 'Method not allowed.' })
    return
  }

  // Same-site check: only enforced on real Vercel deployments. Local dev
  // deliberately serves the Vite app and the API on different origins
  // (see vite.config.js), so Origin would never match Host there.
  if (process.env.VERCEL && !isTrustedOrigin(req)) {
    send(res, 403, { success: false, message: 'This submission was refused. Please try again from the official site page.' })
    return
  }

  const rateLimit = consumeRateLimit(`join:${getClientIp(req)}`, RATE_LIMIT)
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
    send(res, 429, { success: false, message: 'Too many attempts. Please wait a moment, then try again.' })
    return
  }

  let body
  try {
    body = readBody(req)
  } catch {
    send(res, 400, { success: false, message: 'Invalid application data.' })
    return
  }

  if (JSON.stringify(body)?.length > MAX_BODY_BYTES) {
    send(res, 413, { success: false, message: 'Payload too large.' })
    return
  }

  // Honeypot (defense in depth: the frontend already strips/filters it).
  // A filled trap is answered with a neutral success WITHOUT any DB write,
  // so bots cannot tell they were filtered. Real users never hit this path.
  if (isFilled(body?.answers?.website) || isFilled(body?.website)) {
    const echo = normalizeString(body?.reference).slice(0, 64)
    send(res, 201, { success: true, reference: echo || 'received' })
    return
  }

  const row = validateApplication(res, body)
  if (!row) return

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !supabaseSecret) {
    console.error('[join] Missing Supabase server configuration.')
    send(res, 500, { success: false, message: 'Server configuration error.' })
    return
  }

  try {
    // No browser storage exists in a serverless function, and each
    // invocation is a single short-lived call: disable session persistence
    // and the background auto-refresh timer so nothing outlives the request.
    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const duplicateField = await findDuplicateField(supabase, row.email, row.phone)
    if (duplicateField) {
      console.warn('[join] Duplicate application blocked', { field: duplicateField })
      send(res, 409, {
        success: false,
        message: duplicateField === 'email'
          ? 'This email has already been used for an application. Please use another email or contact the club.'
          : 'This phone number has already been used for an application. Please use another number or contact the club.',
        field: duplicateField,
      })
      return
    }

    const { data, error } = await supabase
      .from('membership_applications')
      .insert(row)
      .select('id, reference, status, created_at')
      .single()

    if (error || !data) {
      // Minimal server log: code only, never PII, secrets, or full payloads.
      console.error('[join] Supabase insertion failed', { code: error?.code })
      if (error?.code === '23505') {
        send(res, 409, {
          success: false,
          message: 'This application already seems to have been received. Please contact the club.',
        })
        return
      }
      send(res, 500, { success: false, message: 'We could not save your application. Please try again.' })
      return
    }

    if (!data.reference) {
      console.error('[join] Insert succeeded without a reference.')
      send(res, 500, { success: false, message: 'We could not save your application. Please try again.' })
      return
    }

    send(res, 201, { success: true, reference: data.reference })
  } catch (error) {
    console.error('[join] Unexpected failure', { code: error?.code })
    send(res, 500, { success: false, message: 'We could not save your application. Please try again.' })
  }
}
