// POST /api/join — Vercel Serverless Function (Node, ESM).
//
// Browser -> POST /api/join -> server validation -> Supabase
//   -> public.membership_applications -> 201 { success: true, reference }
//
// Supabase is NEVER called from React. The secret key lives only here,
// server-side, via process.env. No SQL is built by hand: all writes go
// through the official @supabase/supabase-js client (parameterized).
//
// NOTE on rate limiting: a robust limiter needs shared state (e.g. Upstash
// Redis). A local in-memory counter would NOT work reliably on Vercel
// Serverless (each instance has its own memory), so none is added here.
// This is the right place to plug a distributed limiter later.

import { createClient } from '@supabase/supabase-js'

const MAX_BODY_BYTES = 65536

const ALLOWED_STUDY_YEARS = new Set(['L1', 'L2', 'L3', 'M1', 'M2', 'other'])
const ALLOWED_EXPERIENCE = new Set(['starting', 'learning', 'building'])
const ALLOWED_AVAILABILITY = new Set(['weekly', 'events', 'flexible'])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const MAX_LEN = {
  fullName: 120,
  email: 254,
  phone: 40,
  department: 120,
  primaryField: 120,
  motivation: 520,
  source: 500,
}

const MOTIVATION_MIN = 45

const send = (res, status, payload) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
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
    return invalid(res, 'Invalid application data.') ? null : null
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

  const primaryField = normalizeString(answers.primaryField)
  if (primaryField.length < 1 || primaryField.length > MAX_LEN.primaryField) {
    invalid(res, 'Please choose a field.', 'primaryField')
    return null
  }

  const experience = normalizeString(answers.experience)
  if (!ALLOWED_EXPERIENCE.has(experience)) {
    invalid(res, 'Please tell us where you are starting from.', 'experience')
    return null
  }

  const motivation = normalizeString(answers.motivation)
  if (motivation.length < MOTIVATION_MIN || motivation.length > MAX_LEN.motivation) {
    invalid(res, 'Tell us a little more, using at least 45 characters.', 'motivation')
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
  const formVersion = Number.isFinite(body.version) ? Math.trunc(body.version) : 1

  // Explicit allowlist: unknown client properties are ignored, never inserted.
  return {
    full_name: fullName,
    email,
    phone,
    study_year: studyYear,
    department,
    primary_field: primaryField,
    experience,
    motivation,
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
    const supabase = createClient(supabaseUrl, supabaseSecret)

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
