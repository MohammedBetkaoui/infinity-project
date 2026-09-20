// Server-side checks for the image files of an AIVEX form v4 registration
// (INTERNAL VERIFICATION DATA): the three student cards, and the identity
// card image of the head of delegation and of the driver.
//
// The JSON payload is checked by validateRegistrationV4 (shared contract).
// Here the API re-runs the exact rule the form applied to each picked file
// (imageFileIssue: present, allowed type, 1 byte to 5 MB), then adds what
// only the server can do. Nothing is trusted on its own — not the declared
// Content-Type, not the file name — and everything must agree:
//   magic bytes  -> an allowed image type (JPEG/PNG/WEBP for a student card,
//                   JPEG/PNG for an identity card)
//   declared MIME == detected MIME
//   file name extension matches the detected type
// The client file name is never used for storage (see studentCardStoragePath
// and identityCardStoragePath).
//
// For an identity card the SHA-256 of the exact received bytes is computed
// here, once everything else has passed: a checksum sent by the client would
// be ignored (the request has no such field).
//
// Pure apart from reading the in-memory buffers: no Storage, no database.

import { createHash } from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import {
  IDENTITY_CARD_FIELDS, IDENTITY_CARD_POLICY, IDENTITY_CARD_SUBJECTS, REGISTRATION_FILE_FIELDS, STUDENT_CARD_FIELDS,
  STUDENT_CARD_POLICY, canonicalCardMime, identityCardField, imageFileIssue, studentCardField,
} from '../../shared/aivex/contract-v4.js'

const fail = (status, message, field) => ({ ok: false, status, message, field })

const extensionOf = (filename) => /\.([a-z0-9]+)$/i.exec(typeof filename === 'string' ? filename : '')?.[1].toLowerCase() || ''

const sha256Hex = (buffer) => createHash('sha256').update(buffer).digest('hex')

// The wording of each refusal, per kind of file. Status: 400 absent/empty,
// 413 too large, 415 type refused or not what it claims to be.
const WORDS = {
  studentCard: {
    missing: 'the student card is missing.',
    empty: 'the student card file is empty.',
    type: 'the student card must be a JPG, PNG or WEBP image.',
    size: 'the student card must be 5 MB or smaller.',
    mismatch: 'the student card file type does not match its content.',
    name: 'the student card file name does not match its content.',
  },
  identityCard: {
    missing: 'the identity card image is missing.',
    empty: 'the identity card image is empty.',
    type: 'the identity card must be a JPG or PNG image.',
    size: 'the identity card image must be 5 MB or smaller.',
    mismatch: 'the identity card file type does not match its content.',
    name: 'the identity card file name does not match its content.',
  },
}
const STATUS = { missing: 400, empty: 400, type: 415, size: 413, mismatch: 415, name: 415 }

// One received image part. `file` is one entry of the Map produced by
// parseMultipart: { buffer, size, mimeType, filename }.
// Returns { ok: true, mime, extension, size } or { ok: false, status, message, field }.
async function checkImagePart({ file, policy, words, label, field }) {
  const refuse = (kind) => fail(STATUS[kind], `${label}: ${words[kind]}`, field)
  const size = file?.buffer?.length ?? 0

  const issue = imageFileIssue(policy, file && { type: file.mimeType, size })
  if (issue) return refuse(issue)

  const detected = await fileTypeFromBuffer(file.buffer)
  const type = detected && policy.types[detected.mime]
  if (!type) return refuse('type')

  // A mismatch means a crafted request: the form always labels files correctly.
  if (canonicalCardMime(file.mimeType) !== detected.mime) return refuse('mismatch')
  if (!type.extensions.includes(extensionOf(file.filename))) return refuse('name')

  return { ok: true, mime: detected.mime, extension: type.extension, size }
}

async function checkStudentCards(students, files) {
  const cards = []
  for (const { position } of students) {
    const field = studentCardField(position)
    const file = files.get(field)
    const checked = await checkImagePart({ file, policy: STUDENT_CARD_POLICY, words: WORDS.studentCard, label: `Student ${position}`, field })
    if (!checked.ok) return checked
    cards.push({ position, field, buffer: file.buffer, mime: checked.mime, extension: checked.extension, size: checked.size })
  }
  return { ok: true, cards }
}

const IDENTITY_LABELS = { delegationHead: 'Head of delegation', driver: 'Driver' }

async function checkIdentityCards(files) {
  const cards = []
  for (const subject of IDENTITY_CARD_SUBJECTS) {
    const field = identityCardField(subject)
    const file = files.get(field)
    const checked = await checkImagePart({ file, policy: IDENTITY_CARD_POLICY, words: WORDS.identityCard, label: IDENTITY_LABELS[subject], field })
    if (!checked.ok) return checked
    cards.push({
      subject, field, buffer: file.buffer, mime: checked.mime, extension: checked.extension, size: checked.size, sha256: sha256Hex(file.buffer),
    })
  }
  return { ok: true, cards }
}

const unexpectedFile = (files, allowed) => {
  for (const name of files.keys()) {
    if (!allowed.includes(name)) return fail(400, 'Unexpected file in this registration.', name)
  }
  return null
}

// `students` is the validated v4 list (positions 1..3); `files` is the Map
// produced by parseMultipart. Returns { ok: true, cards } where cards[i] =
// { position, field, buffer, mime, extension, size } for students[i], or
// { ok: false, status, message, field }.
export async function validateStudentCardsV4(students, files) {
  return unexpectedFile(files, STUDENT_CARD_FIELDS) || checkStudentCards(students, files)
}

// The two identity cards only. Returns { ok: true, cards } where cards =
// [{ subject, field, buffer, mime, extension, size, sha256 }] for the head of
// delegation then the driver, or { ok: false, status, message, field }.
export async function validateIdentityCardsV4(files) {
  return unexpectedFile(files, IDENTITY_CARD_FIELDS) || checkIdentityCards(files)
}

// Everything a registration request may carry: exactly the five image parts
// and nothing else, checked in the order the form asks for them (delegation
// documents, then the students). Returns { ok: true, cards, identityCards }
// or { ok: false, status, message, field } for the first problem found.
export async function validateRegistrationFilesV4(students, files) {
  const unexpected = unexpectedFile(files, REGISTRATION_FILE_FIELDS)
  if (unexpected) return unexpected
  const identity = await checkIdentityCards(files)
  if (!identity.ok) return identity
  const studentCards = await checkStudentCards(students, files)
  if (!studentCards.ok) return studentCards
  return { ok: true, cards: studentCards.cards, identityCards: identity.cards }
}
