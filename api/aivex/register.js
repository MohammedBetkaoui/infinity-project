// POST /api/aivex/register — Vercel Serverless Function (Node, ESM).
//
// Dispatch on the payload version, never converting one into the other:
//   v3 (LEGACY, production) -> validated and written as described below.
//   v4 (canonical contract, shared/aivex/contract-v4.js) -> validated end to
//      end (payload + the real bytes of the three cards), then answered 503
//      without any write: storing v4 needs the v4 migration and the v4 write
//      path (idempotent submission_id, aivex_students, server reference),
//      which belong to Phase 2.
//
// Browser (multipart: payload JSON v3 + studentCard_1..3)
//   -> origin / rate-limit checks -> streaming multipart parse
//   -> full validation (institution, activity contact, delegation,
//      exactly three students, consent, real image signatures)
//   -> aivex_registrations -> Storage (private bucket) -> aivex_members
//   -> 201 { success: true, reference }
//
// aivex_registrations holds the team, its institution, the activity
// administration contact, the head of delegation and the driver;
// aivex_members holds the three students (one card each).
//
// Nothing is written until everything has been validated. Storage and
// PostgreSQL do not share a transaction, so any failure after the
// registration row exists is compensated by cleanupFailedRegistration().
// Same conventions as api/join.js: secrets from process.env only, JSON
// responses without internals, logs carry error codes and never personal data
// (national ID numbers above all).

import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { AIVEX_FORM_VERSION, registrationResponsesV4, validateRegistrationV4 } from '../../shared/aivex/contract-v4.js'
import {
  CARD_FIELD_PATTERN, MAX_CARD_BYTES, STUDENT_COUNT, validateCards, validateRegistrationV3,
} from '../_lib/aivex-validation.js'
import { validateStudentCardsV4 } from '../_lib/aivex-validation-v4.js'
import { isFilled, normalizeString, sendJson as send } from '../_lib/http.js'
import { MultipartError, parseMultipart } from '../_lib/multipart.js'
import { consumeRateLimit, getClientIp, isTrustedOrigin } from '../_lib/security.js'

const EDITION = 2
const STORAGE_BUCKET = 'aivex-student-cards'
// Several images per attempt: stricter than the text-only join form.
const RATE_LIMIT = { max: 5, windowMs: 15 * 60 * 1000 }
const MULTIPART_LIMITS = {
  maxFileBytes: MAX_CARD_BYTES,
  maxFiles: STUDENT_COUNT,
  // Memory guard for one request. Vercel itself rejects bodies above 4.5 MB.
  maxRequestBytes: 30 * 1024 * 1024,
  allowedFields: new Set(['payload']),
  fileFieldPattern: CARD_FIELD_PATTERN,
}

const MESSAGES = {
  duplicateEmail: 'A team has already been registered with this activity contact email for this edition.',
  duplicateStudent: 'One of these students is already registered for this AIVEX edition.',
  duplicateRegistration: 'This registration already seems to have been received. Please contact the organisers.',
  saveFailed: 'We could not save your registration. Please try again.',
  v4NotOpen: 'AIVEX form v4 registrations are not open yet. Nothing was saved.',
}

// Form v4: every check runs, nothing is written or uploaded (Phase 1).
async function answerV4(res, body, files) {
  const registration = validateRegistrationV4(body)
  const cards = registration.ok ? await validateStudentCardsV4(registration.value.students, files) : registration
  const outcome = cards.ok
    ? registrationResponsesV4.failed(503, MESSAGES.v4NotOpen)
    : registrationResponsesV4.failed(cards.status, cards.message, cards.field)
  send(res, outcome.status, outcome.body)
}

class StageError extends Error {
  constructor(stage, cause) {
    super(stage)
    this.stage = stage
    this.code = cause?.code || cause?.statusCode || cause?.status
    this.cause = cause
  }
}

const isUniqueViolation = (error) => error?.code === '23505'
const mentions = (error, word) => [error?.message, error?.details, error?.hint].some((text) => typeof text === 'string' && text.includes(word))

// Best effort: every step is attempted even if an earlier one fails, and
// only error codes are logged. The caller keeps reporting the original error.
async function cleanupFailedRegistration({ supabase, registrationId, uploadedPaths }) {
  if (uploadedPaths.length) {
    try {
      const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths)
      if (error) console.error('[aivex] Cleanup failed', { stage: 'storage', code: error.statusCode || error.code })
    } catch (error) {
      console.error('[aivex] Cleanup failed', { stage: 'storage', code: error?.code })
    }
  }
  try {
    // The student rows go with it (ON DELETE CASCADE).
    const { error } = await supabase.from('aivex_registrations').delete().eq('id', registrationId)
    if (error) console.error('[aivex] Cleanup failed', { stage: 'registration', code: error.code })
  } catch (error) {
    console.error('[aivex] Cleanup failed', { stage: 'registration', code: error?.code })
  }
}

// UX pre-checks only: the unique constraints stay the source of truth.
// A failed lookup fails open and lets the insert decide.
async function findDuplicate(supabase, activityOfficial, students) {
  const { data: emailHit, error: emailError } = await supabase
    .from('aivex_registrations')
    .select('id')
    .eq('edition', EDITION)
    .eq('activity_official_email', activityOfficial.email)
    .limit(1)
    .maybeSingle()
  if (emailError) console.error('[aivex] Duplicate email check failed', { code: emailError.code })
  else if (emailHit) return MESSAGES.duplicateEmail

  const { data: studentHits, error: studentError } = await supabase
    .from('aivex_members')
    .select('id')
    .eq('edition', EDITION)
    .in('registration_number', students.map((student) => student.registrationNumber))
    .limit(1)
  if (studentError) console.error('[aivex] Duplicate student check failed', { code: studentError.code })
  else if (studentHits?.length) return MESSAGES.duplicateStudent

  return null
}

async function storeRegistration(supabase, registrationInput, cards) {
  const { team, activityOfficial, delegationHead, driver, students, formVersion, source } = registrationInput
  const { data: registration, error: registrationError } = await supabase
    .from('aivex_registrations')
    .insert({
      edition: EDITION,
      team_name: team.name,
      wilaya_code: team.wilaya.code,
      wilaya_name: team.wilaya.name,
      institution_id: team.institution.id,
      institution_name: team.institution.name,
      institution_custom: team.institution.custom,
      activity_official_role: activityOfficial.role,
      activity_official_name: activityOfficial.fullName,
      activity_official_email: activityOfficial.email,
      activity_official_phone: activityOfficial.phone,
      delegation_head_name: delegationHead.fullName,
      delegation_head_phone: delegationHead.phone,
      delegation_head_national_id: delegationHead.nationalId,
      driver_name: driver.fullName,
      driver_phone: driver.phone,
      driver_national_id: driver.nationalId,
      student_count: students.length,
      consent: true,
      source,
      form_version: formVersion,
      submitted_at: new Date().toISOString(),
    })
    .select('id, reference, status, created_at')
    .single()

  if (registrationError || !registration?.id || !registration.reference) {
    if (isUniqueViolation(registrationError)) {
      // Unique index: aivex_registrations_edition_contact_uidx.
      return { status: 409, message: mentions(registrationError, 'contact') ? MESSAGES.duplicateEmail : MESSAGES.duplicateRegistration }
    }
    console.error('[aivex] Registration insert failed', { code: registrationError?.code || 'NO_REFERENCE' })
    // A row without a reference must not stay behind either.
    if (registration?.id) await cleanupFailedRegistration({ supabase, registrationId: registration.id, uploadedPaths: [] })
    return { status: 500, message: MESSAGES.saveFailed }
  }

  const registrationId = registration.id
  const uploadedPaths = []
  try {
    const studentRows = []
    for (const [index, student] of students.entries()) {
      const card = cards[index]
      const studentId = randomUUID()
      // Random ids only: no name, number or other personal data in paths.
      const path = `${registrationId}/${studentId}.${card.extension}`
      const { error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, card.buffer, { contentType: card.mime, upsert: false })
      if (error) throw new StageError('upload', error)
      uploadedPaths.push(path)

      studentRows.push({
        id: studentId,
        registration_id: registrationId,
        position: student.position,
        full_name: student.fullName,
        registration_number: student.registrationNumber,
        study_level: student.studyLevel,
        phone: student.phone,
        student_card_path: path,
        student_card_mime: card.mime,
        student_card_size_bytes: card.size,
      })
    }

    const { error: studentsError } = await supabase.from('aivex_members').insert(studentRows)
    if (studentsError) throw new StageError('students', studentsError)
  } catch (error) {
    const stage = error instanceof StageError ? error.stage : 'unexpected'
    console.error('[aivex] Registration failed', { stage, code: error?.code })
    await cleanupFailedRegistration({ supabase, registrationId, uploadedPaths })
    if (stage === 'students' && isUniqueViolation(error.cause)) return { status: 409, message: MESSAGES.duplicateStudent }
    return { status: 500, message: MESSAGES.saveFailed }
  }

  return { status: 201, reference: registration.reference }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    send(res, 405, { success: false, message: 'Method not allowed.' })
    return
  }

  // Same policy as api/join.js: enforced on Vercel deployments only, since
  // local dev serves the app and the API from different origins.
  if (process.env.VERCEL && !isTrustedOrigin(req)) {
    send(res, 403, { success: false, message: 'This submission was refused. Please try again from the official site page.' })
    return
  }

  const rateLimit = consumeRateLimit(`aivex-register:${getClientIp(req)}`, RATE_LIMIT)
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
    send(res, 429, { success: false, message: 'Too many attempts. Please wait a moment, then try again.' })
    return
  }

  let parsed
  try {
    parsed = await parseMultipart(req, MULTIPART_LIMITS)
  } catch (error) {
    if (error instanceof MultipartError) send(res, error.status, { success: false, message: error.message })
    else send(res, 400, { success: false, message: 'Invalid registration data.' })
    return
  }

  let body
  try {
    body = JSON.parse(parsed.fields.payload ?? '')
  } catch {
    send(res, 400, { success: false, message: 'Invalid registration data.' })
    return
  }

  // Honeypot: a neutral success, with no write and no upload, so a bot
  // cannot tell it was filtered.
  if (isFilled(body?.answers?.website) || isFilled(body?.website)) {
    send(res, 201, { success: true, reference: normalizeString(body?.reference).slice(0, 64) || 'received' })
    return
  }

  if (body?.version === AIVEX_FORM_VERSION) {
    await answerV4(res, body, parsed.files)
    return
  }

  // Legacy path, unchanged: anything that is not v4 is validated as v3.
  const registration = validateRegistrationV3(body)
  if (!registration.ok) {
    send(res, registration.status, { success: false, message: registration.message })
    return
  }

  const cardCheck = await validateCards(registration.value.students, parsed.files)
  if (!cardCheck.ok) {
    send(res, cardCheck.status, { success: false, message: cardCheck.message })
    return
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !supabaseSecret) {
    console.error('[aivex] Missing Supabase server configuration.')
    send(res, 500, { success: false, message: 'Server configuration error.' })
    return
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { activityOfficial, students } = registration.value
    const duplicate = await findDuplicate(supabase, activityOfficial, students)
    if (duplicate) {
      send(res, 409, { success: false, message: duplicate })
      return
    }

    const outcome = await storeRegistration(supabase, registration.value, cardCheck.cards)
    if (outcome.status === 201) send(res, 201, { success: true, reference: outcome.reference })
    else send(res, outcome.status, { success: false, message: outcome.message })
  } catch (error) {
    console.error('[aivex] Unexpected failure', { code: error?.code })
    send(res, 500, { success: false, message: MESSAGES.saveFailed })
  }
}
