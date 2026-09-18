// AIVEX form v4 — write path: validated registration -> PostgreSQL + private
// Storage, idempotent on submissionId.
//
//   1. look up submission_id (idempotency)
//   2. INSERT aivex_registrations (server reference, statuses, edition)
//   3. upload the three cards to the private bucket
//   4. INSERT the three aivex_students rows in ONE statement
//   5. 201 { success, reference }
//
// Storage and PostgreSQL share no transaction: a failure after step 2 is
// compensated (uploaded cards removed, registration deleted — students
// follow by ON DELETE CASCADE). A registration row therefore has 0 students
// only while an attempt is running, or if that attempt died between steps;
// the deferred trigger aivex_students_team_size forbids 1, 2 or 4.
//
// A same submissionId arriving again:
//   complete + same answers      -> 200, same reference, nothing created
//   complete + other answers     -> 409 (the reference is given back)
//   incomplete, recent           -> 409, still processing (Retry-After)
//   incomplete, older than STALE_AFTER_MS (attempt died) -> discarded, redone
// The UNIQUE index on submission_id is the final guard against races.
//
// registerV4() only talks to a small `store` interface, implemented over
// Supabase by createSupabaseRegistrationStore(). Logs carry a stage and an
// error code, never personal data, payloads or Storage paths.

import { createHash } from 'node:crypto'
import {
  AIVEX_STUDENT_COUNT, DEFAULT_DOCUMENT_STATUS, DEFAULT_REGISTRATION_STATUS, STUDENT_CARD_POLICY, STUDENT_POSITIONS,
  registrationResponsesV4, studentCardStoragePath,
} from '../../shared/aivex/contract-v4.js'
import { generateRegistrationReference } from './aivex-reference.js'

const REGISTRATIONS = 'aivex_registrations'
const STUDENTS = 'aivex_students'
// Longer than the function's maxDuration (vercel.json): an attempt still
// running is never mistaken for a dead one.
export const STALE_AFTER_MS = 3 * 60 * 1000
const MAX_INSERT_ATTEMPTS = 4
const RETRY_AFTER_SECONDS = 15

export const MESSAGES = {
  saveFailed: 'We could not save your registration. Please try again.',
  inProgress: 'This registration is still being processed. Please wait a moment, then try again.',
  conflict: (reference) => `This registration was already received (reference ${reference}) with different details. Please contact the organisers to change it.`,
}

export class StoreError extends Error {
  constructor(stage, cause) {
    super(stage)
    this.stage = stage
    this.code = cause?.code || cause?.statusCode || cause?.status
  }
}

const logFailure = (stage, error) => {
  console.error('[aivex] Registration failed', { stage: error?.stage || stage, code: error?.code })
}

// Same answers -> same fingerprint. The validated value is rebuilt with a
// fixed key order, so its JSON is canonical. Cards are not part of it (a
// browser may re-encode the same photo differently on a retry).
export const registrationFingerprint = (registration) => createHash('sha256').update(JSON.stringify(registration)).digest('hex')

// --- V4 application model -> database contract ------------------------------

export function toRegistrationRow(registration, { reference, fingerprint, source, now }) {
  const { team, activityOfficial, delegationHead, driver } = registration
  return {
    submission_id: registration.submissionId,
    submission_fingerprint: fingerprint,
    reference,
    edition: registration.edition,
    form_version: registration.formVersion,
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
    delegation_head_rfid: delegationHead.rfid,
    driver_name: driver.fullName,
    driver_phone: driver.phone,
    driver_rfid: driver.rfid,
    student_count: registration.students.length,
    consent: registration.consent,
    registration_status: DEFAULT_REGISTRATION_STATUS,
    document_status: DEFAULT_DOCUMENT_STATUS,
    current_form_revision: 0,
    source,
    submitted_at: now.toISOString(),
  }
}

// `stored` = [{ position, path, mime, size }] for the uploaded cards.
export function toStudentRows(registrationId, registration, stored) {
  return registration.students.map((student) => {
    const card = stored.find((entry) => entry.position === student.position)
    return {
      registration_id: registrationId,
      edition: registration.edition,
      position: student.position,
      full_name: student.fullName,
      phone: student.phone,
      bac_year: student.bacYear,
      rfid_number: student.rfid,
      student_card_path: card.path,
      student_card_mime: card.mime,
      student_card_size_bytes: card.size,
    }
  })
}

// Every path a registration's cards may have (any position, any type).
const possibleCardPaths = (registrationId, edition) => STUDENT_POSITIONS.flatMap((position) => (
  Object.keys(STUDENT_CARD_POLICY.types).map((mime) => studentCardStoragePath(registrationId, position, mime, edition))
))

// --- Orchestration ---------------------------------------------------------------

const failed = (status, message) => registrationResponsesV4.failed(status, message)

// Best effort: every step is attempted, only codes are logged.
async function discardRegistration(store, registrationId, paths) {
  try {
    await store.removeCards(paths)
  } catch (error) {
    logFailure('cleanup-storage', error)
  }
  try {
    await store.deleteRegistration(registrationId)
  } catch (error) {
    logFailure('cleanup-registration', error)
  }
}

// Outcome for a registration already holding this submissionId, or null
// when it was a dead attempt that has just been discarded.
async function settleExisting(store, existing, { fingerprint, edition, now }) {
  if (existing.studentCount === AIVEX_STUDENT_COUNT) {
    return existing.fingerprint === fingerprint
      ? registrationResponsesV4.replayed(existing.reference)
      : failed(409, MESSAGES.conflict(existing.reference))
  }
  const age = now.getTime() - new Date(existing.createdAt).getTime()
  if (!(age >= STALE_AFTER_MS)) return { ...failed(409, MESSAGES.inProgress), retryAfterSeconds: RETRY_AFTER_SECONDS }
  await discardRegistration(store, existing.id, possibleCardPaths(existing.id, edition))
  return null
}

async function completeRegistration(store, { id, reference }, registration, cards) {
  const stored = []
  try {
    for (const card of cards) {
      const path = studentCardStoragePath(id, card.position, card.mime, registration.edition)
      await store.uploadCard(path, card.buffer, card.mime)
      stored.push({ position: card.position, path, mime: card.mime, size: card.size })
    }
    await store.insertStudents(toStudentRows(id, registration, stored))
  } catch (error) {
    logFailure('students', error)
    await discardRegistration(store, id, stored.map((entry) => entry.path))
    return failed(500, MESSAGES.saveFailed)
  }
  return registrationResponsesV4.created(reference)
}

// `registration` is the value returned by validateRegistrationV4, `cards`
// the value returned by validateStudentCardsV4. Returns { status, body }
// (+ retryAfterSeconds for a 409 still processing).
export async function registerV4({
  store, registration, cards, source = null, now = new Date(), generateReference = generateRegistrationReference,
}) {
  const fingerprint = registrationFingerprint(registration)
  try {
    let existing = await store.findBySubmissionId(registration.submissionId)
    for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt += 1) {
      if (existing) {
        const outcome = await settleExisting(store, existing, { fingerprint, edition: registration.edition, now })
        if (outcome) return outcome
      }
      const reference = generateReference(registration.edition)
      const inserted = await store.insertRegistration(toRegistrationRow(registration, { reference, fingerprint, source, now }))
      if (inserted.ok) return await completeRegistration(store, inserted, registration, cards)
      if (!inserted.duplicate) {
        logFailure('registration', inserted)
        return failed(500, MESSAGES.saveFailed)
      }
      // Unique violation: the same submissionId committed meanwhile (settled
      // on the next turn), or a reference collision (a new one is drawn).
      existing = await store.findBySubmissionId(registration.submissionId)
    }
    logFailure('registration', { code: 'ATTEMPTS_EXHAUSTED' })
  } catch (error) {
    logFailure('lookup', error)
  }
  return failed(500, MESSAGES.saveFailed)
}

// --- Supabase implementation of the store -------------------------------------------

export function createSupabaseRegistrationStore(supabase) {
  const bucket = () => supabase.storage.from(STUDENT_CARD_POLICY.bucket)
  return {
    async findBySubmissionId(submissionId) {
      const { data, error } = await supabase
        .from(REGISTRATIONS)
        .select('id, reference, submission_fingerprint, created_at')
        .eq('submission_id', submissionId)
        .maybeSingle()
      if (error) throw new StoreError('lookup', error)
      if (!data) return null
      const { count, error: countError } = await supabase
        .from(STUDENTS)
        .select('id', { count: 'exact', head: true })
        .eq('registration_id', data.id)
      if (countError) throw new StoreError('lookup', countError)
      return {
        id: data.id,
        reference: data.reference,
        fingerprint: data.submission_fingerprint,
        createdAt: data.created_at,
        studentCount: count ?? 0,
      }
    },
    // The stored reference is read back: it is the one given to the applicant.
    async insertRegistration(row) {
      const { data, error } = await supabase.from(REGISTRATIONS).insert(row).select('id, reference').single()
      if (error) return { ok: false, duplicate: error.code === '23505', code: error.code }
      return { ok: true, id: data.id, reference: data.reference }
    },
    async uploadCard(path, buffer, mime) {
      const { error } = await bucket().upload(path, buffer, { contentType: mime, upsert: false })
      if (error) throw new StoreError('upload', error)
    },
    // The three rows in one INSERT: the deferred team-size trigger needs them together.
    async insertStudents(rows) {
      const { error } = await supabase.from(STUDENTS).insert(rows)
      if (error) throw new StoreError('students', error)
    },
    async removeCards(paths) {
      if (!paths.length) return
      const { error } = await bucket().remove(paths)
      if (error) throw new StoreError('cleanup-storage', error)
    },
    async deleteRegistration(registrationId) {
      const { error } = await supabase.from(REGISTRATIONS).delete().eq('id', registrationId)
      if (error) throw new StoreError('cleanup-registration', error)
    },
  }
}
