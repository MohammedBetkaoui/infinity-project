// AIVEX form v4 — write path: validated registration -> PostgreSQL + private
// Storage, idempotent on submissionId.
//
//   1. look up submission_id (idempotency)
//   2. INSERT aivex_registrations (server reference, statuses, edition) —
//      with the server-generated registration id and the metadata of the two
//      identity cards (private path, mime, size, sha256), so the row already
//      says which files this attempt is about to create
//   3. upload the three student cards, then the two identity cards, each to
//      its own private bucket
//   4. INSERT the three aivex_students rows in ONE statement
//   5. 201 { success, reference }
//
// Step 4 is the completion marker, and it is deliberately LAST: a registration
// is complete only when its three students exist, and they are only inserted
// once all five files are safely stored. So a registration can never look
// finished while a required document is missing.
//
// Storage and PostgreSQL share no transaction: a failure after step 2 is
// compensated (uploaded files removed, registration deleted — students
// follow by ON DELETE CASCADE). If a file could NOT be removed, the
// registration row is kept (incomplete) instead: it still records where the
// identity cards are, so the next attempt or an operator can remove them
// rather than leave sensitive files orphaned with nothing pointing at them.
// A registration row therefore has 0 students only while an attempt is
// running, or if that attempt died between steps; the deferred trigger
// aivex_students_team_size forbids 1, 2 or 4.
//
// A same submissionId arriving again:
//   complete + same answers      -> 200, same reference, nothing created
//                                   (no file is stored a second time)
//   complete + other answers     -> 409 (the reference is given back)
//   incomplete, recent           -> 409, still processing (Retry-After)
//   incomplete, older than STALE_AFTER_MS (attempt died) -> its files
//                                   (student cards by rule, identity cards by
//                                   the paths recorded in the row) and the
//                                   row are discarded, then redone
// The UNIQUE index on submission_id is the final guard against races.
//
// registerV4() only talks to a small `store` interface, implemented over
// Supabase by createSupabaseRegistrationStore(). Logs carry a stage and an
// error code, never personal data, payloads or Storage paths.
//
// The two success outcomes (created, replayed-with-matching-fingerprint)
// also carry a `registrationId` sibling field next to `status`/`body` — the
// internal uuid, for the caller to kick off document generation with
// (api/_lib/aivex-document-generation.js). It is never part of `body`, so it
// never reaches the HTTP response.

import { createHash, randomUUID } from 'node:crypto'
import {
  AIVEX_STUDENT_COUNT, DEFAULT_DOCUMENT_STATUS, DEFAULT_REGISTRATION_STATUS, IDENTITY_CARD_POLICY, IDENTITY_CARD_SUBJECTS,
  STUDENT_CARD_POLICY, STUDENT_POSITIONS, identityCardStoragePath, registrationResponsesV4, studentCardStoragePath,
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
  identityMissing: 'The identity card images of the head of delegation and of the driver are required.',
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

// subject -> column prefix. The four columns of a card: _path, _mime, _size,
// _sha256 — metadata only, never the image, a URL, or anything read from it.
const IDENTITY_COLUMN_PREFIX = { delegationHead: 'delegation_head_id_card', driver: 'driver_id_card' }

// `identityCards` = planned cards: [{ subject, path, mime, size, sha256 }].
function identityCardColumns(identityCards) {
  const columns = {}
  for (const card of identityCards) {
    const prefix = IDENTITY_COLUMN_PREFIX[card.subject]
    columns[`${prefix}_path`] = card.path
    columns[`${prefix}_mime`] = card.mime
    columns[`${prefix}_size`] = card.size
    columns[`${prefix}_sha256`] = card.sha256
  }
  return columns
}

// `id` (the registration's UUID, generated by the server so the identity card
// paths can name it) and `identityCards` are given by registerV4; without
// them the row is the plain v4 row of before (the database default assigns
// the id and the identity columns stay NULL).
export function toRegistrationRow(registration, { reference, fingerprint, source, now, id, identityCards }) {
  const { team, activityOfficial, delegationHead, driver } = registration
  return {
    ...(id ? { id } : {}),
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
    ...(identityCards ? identityCardColumns(identityCards) : {}),
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

const SHA256_RE = /^[0-9a-f]{64}$/

// Exactly one validated identity card per subject (validateIdentityCardsV4):
// a registration is never written without both.
const hasIdentityCards = (identityCards) => Array.isArray(identityCards)
  && identityCards.length === IDENTITY_CARD_SUBJECTS.length
  && IDENTITY_CARD_SUBJECTS.every((subject) => identityCards.some((card) => card.subject === subject
    && ((Buffer.isBuffer(card.buffer) && card.buffer.length > 0 && card.size === card.buffer.length) || typeof card.sourcePath === 'string')
    && Boolean(IDENTITY_CARD_POLICY.types[card.mime]) && SHA256_RE.test(card.sha256)))

// The private path of every identity card, generated NOW, by the server:
// nothing the client sent is part of it. Returns the cards with their `path`.
const planIdentityCards = (registrationId, edition, identityCards, createId) => identityCards.map((card) => ({
  ...card,
  path: identityCardStoragePath(registrationId, card.subject, card.mime, createId(), edition),
}))

// Best effort: every removal is attempted, only codes are logged. Returns
// true when the registration row is gone. If a FILE could not be removed the
// row is kept: it is the only thing that still records where the identity
// cards are (see the header), and deleting it would orphan them.
async function discardRegistration(store, registrationId, { cardPaths = [], identityPaths = [] } = {}) {
  let filesRemoved = true
  try {
    await store.removeCards(cardPaths)
  } catch (error) {
    filesRemoved = false
    logFailure('cleanup-storage', error)
  }
  try {
    await store.removeIdentityCards(identityPaths)
  } catch (error) {
    filesRemoved = false
    logFailure('cleanup-identity-storage', error)
  }
  if (!filesRemoved) return false
  try {
    await store.deleteRegistration(registrationId)
    return true
  } catch (error) {
    logFailure('cleanup-registration', error)
    return false
  }
}

// Outcome for a registration already holding this submissionId, or null
// when it was a dead attempt that has just been discarded.
async function settleExisting(store, existing, { fingerprint, edition, now }) {
  if (existing.studentCount === AIVEX_STUDENT_COUNT) {
    return existing.fingerprint === fingerprint
      ? { ...registrationResponsesV4.replayed(existing.reference), registrationId: existing.id }
      : failed(409, MESSAGES.conflict(existing.reference))
  }
  const age = now.getTime() - new Date(existing.createdAt).getTime()
  if (!(age >= STALE_AFTER_MS)) return { ...failed(409, MESSAGES.inProgress), retryAfterSeconds: RETRY_AFTER_SECONDS }
  await discardRegistration(store, existing.id, {
    cardPaths: possibleCardPaths(existing.id, edition),
    identityPaths: existing.identityCardPaths || [],
  })
  return null
}

async function completeRegistration(store, { id, reference }, registration, cards, identityCards) {
  const stored = []
  try {
    for (const card of cards) {
      const path = studentCardStoragePath(id, card.position, card.mime, registration.edition)
      if (card.sourcePath && store.copyCard) await store.copyCard(card.sourcePath, path)
      else await store.uploadCard(path, card.buffer, card.mime)
      stored.push({ position: card.position, path, mime: card.mime, size: card.size })
    }
    for (const card of identityCards) {
      if (card.sourcePath && store.copyIdentityCard) await store.copyIdentityCard(card.sourcePath, card.path)
      else await store.uploadIdentityCard(card.path, card.buffer, card.mime)
    }
    // The completion marker: nothing above may be missing when this succeeds.
    await store.insertStudents(toStudentRows(id, registration, stored))
  } catch (error) {
    logFailure('students', error)
    // Every planned identity path is removed, uploaded or not: an upload that
    // timed out on our side may still have landed (removing a path that does
    // not exist is a no-op).
    await discardRegistration(store, id, {
      cardPaths: stored.map((entry) => entry.path),
      identityPaths: identityCards.map((card) => card.path),
    })
    return failed(500, MESSAGES.saveFailed)
  }
  return { ...registrationResponsesV4.created(reference), registrationId: id }
}

// `registration` is the value returned by validateRegistrationV4; `cards` and
// `identityCards` come from validateRegistrationFilesV4 (student cards, and
// the identity card of the head of delegation and of the driver). Returns
// { status, body } (+ retryAfterSeconds for a 409 still processing).
export async function registerV4({
  store, registration, cards, identityCards, source = null, now = new Date(),
  generateReference = generateRegistrationReference, createId = randomUUID,
}) {
  if (!hasIdentityCards(identityCards)) {
    logFailure('identity', { code: 'IDENTITY_CARDS_MISSING' })
    return failed(400, MESSAGES.identityMissing)
  }
  const fingerprint = registrationFingerprint(registration)
  try {
    let existing = await store.findBySubmissionId(registration.submissionId)
    for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt += 1) {
      if (existing) {
        const outcome = await settleExisting(store, existing, { fingerprint, edition: registration.edition, now })
        if (outcome) return outcome
      }
      const reference = generateReference(registration.edition)
      const registrationId = createId()
      const planned = planIdentityCards(registrationId, registration.edition, identityCards, createId)
      const inserted = await store.insertRegistration(toRegistrationRow(registration, {
        reference, fingerprint, source, now, id: registrationId, identityCards: planned,
      }))
      if (inserted.ok) {
        if (inserted.id !== registrationId) {
          // The identity card paths name the id this attempt generated: a
          // store that stored another one would break that link.
          logFailure('registration', { code: 'ID_MISMATCH' })
          await discardRegistration(store, inserted.id, { identityPaths: planned.map((card) => card.path) })
          return failed(500, MESSAGES.saveFailed)
        }
        return await completeRegistration(store, inserted, registration, cards, planned)
      }
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
  // A different, private bucket: access to identity documents is granted
  // (and audited) separately from the student cards.
  const identityBucket = () => supabase.storage.from(IDENTITY_CARD_POLICY.bucket)
  return {
    async findBySubmissionId(submissionId) {
      const { data, error } = await supabase
        .from(REGISTRATIONS)
        .select('id, reference, submission_fingerprint, created_at, delegation_head_id_card_path, driver_id_card_path')
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
        // Where the identity cards of an unfinished attempt were going: what
        // its cleanup has to remove. Paths stay server-side, never in a response.
        identityCardPaths: [data.delegation_head_id_card_path, data.driver_id_card_path].filter(Boolean),
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
    async copyCard(sourcePath, path) {
      const { error } = await bucket().copy(sourcePath, path)
      if (error) throw new StoreError('copy', error)
    },
    async uploadIdentityCard(path, buffer, mime) {
      const { error } = await identityBucket().upload(path, buffer, { contentType: mime, upsert: false })
      if (error) throw new StoreError('upload-identity', error)
    },
    async copyIdentityCard(sourcePath, path) {
      const { error } = await identityBucket().copy(sourcePath, path)
      if (error) throw new StoreError('copy-identity', error)
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
    async removeIdentityCards(paths) {
      if (!paths.length) return
      const { error } = await identityBucket().remove(paths)
      if (error) throw new StoreError('cleanup-identity-storage', error)
    },
    async deleteRegistration(registrationId) {
      const { error } = await supabase.from(REGISTRATIONS).delete().eq('id', registrationId)
      if (error) throw new StoreError('cleanup-registration', error)
    },
  }
}
