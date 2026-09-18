// Server-side checks for the three student card files of an AIVEX form v4
// registration (INTERNAL VERIFICATION DATA).
//
// The JSON payload is checked by validateRegistrationV4 (shared contract).
// This module adds what only the server can do: read each file's real type
// from its bytes. Nothing is trusted on its own — not the declared
// Content-Type, not the file name — and everything must agree:
//   magic bytes  -> JPEG, PNG or WEBP
//   declared MIME == detected MIME
//   file name extension matches the detected type
//   1 byte <= size <= STUDENT_CARD_POLICY.maxBytes
//
// Pure apart from reading the in-memory buffers: no Storage, no database.
// Not wired into api/aivex/register.js yet (the v4 write path is Phase 2).

import { fileTypeFromBuffer } from 'file-type'
import { STUDENT_CARD_FIELDS, STUDENT_CARD_POLICY, studentCardField } from '../../shared/aivex/contract-v4.js'

const fail = (status, message, field) => ({ ok: false, status, message, field })

const extensionOf = (filename) => /\.([a-z0-9]+)$/i.exec(typeof filename === 'string' ? filename : '')?.[1].toLowerCase() || ''

// `students` is the validated v4 list (positions 1..3); `files` is the Map
// produced by parseMultipart. Returns { ok: true, cards } where cards[i] =
// { position, field, buffer, mime, extension, size } for students[i], or
// { ok: false, status, message, field }.
export async function validateStudentCardsV4(students, files) {
  for (const name of files.keys()) {
    if (!STUDENT_CARD_FIELDS.includes(name)) return fail(400, 'Unexpected file in this registration.', name)
  }

  const cards = []
  for (const { position } of students) {
    const field = studentCardField(position)
    const label = `Student ${position}`
    const file = files.get(field)
    if (!file) return fail(400, `${label}: the student card is missing.`, field)

    const size = file.buffer?.length ?? 0
    if (!size) return fail(400, `${label}: the student card file is empty.`, field)
    if (size > STUDENT_CARD_POLICY.maxBytes) return fail(413, `${label}: the student card must be 5 MB or smaller.`, field)

    const detected = await fileTypeFromBuffer(file.buffer)
    const type = detected && STUDENT_CARD_POLICY.types[detected.mime]
    if (!type) return fail(415, `${label}: the student card must be a JPG, PNG or WEBP image.`, field)

    // A mismatch means a crafted request: the form always labels files correctly.
    const declared = String(file.mimeType || '').toLowerCase()
    if ((STUDENT_CARD_POLICY.mimeAliases[declared] || declared) !== detected.mime) {
      return fail(415, `${label}: the student card file type does not match its content.`, field)
    }
    if (!type.extensions.includes(extensionOf(file.filename))) {
      return fail(415, `${label}: the student card file name does not match its content.`, field)
    }

    cards.push({ position, field, buffer: file.buffer, mime: detected.mime, extension: type.extension, size })
  }
  return { ok: true, cards }
}
