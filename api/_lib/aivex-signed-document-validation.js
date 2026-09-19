// AIVEX Phase 5B — server-side checks for an uploaded signed document.
// Same discipline and shape as api/_lib/aivex-validation-v4.js's
// validateStudentCardsV4: nothing is trusted on its own — not the declared
// Content-Type, not the file name — and everything must agree:
//   magic bytes  -> PDF, JPEG or PNG
//   declared MIME == detected MIME
//   file name extension matches the detected type
// The client file name is never used for storage (the upload path is built
// entirely server-side — see api/_lib/aivex-signed-document-store.js).
//
// Pure apart from reading the in-memory buffer: no Storage, no database.

import { fileTypeFromBuffer } from 'file-type'
import {
  MAX_SIGNED_DOCUMENT_SIZE, SIGNED_DOCUMENT_TYPES, canonicalSignedDocumentMime, signedDocumentFileIssue,
} from '../../shared/aivex/signed-document-policy.js'

const fail = (status, message) => ({ ok: false, status, message })

const extensionOf = (filename) => /\.([a-z0-9]+)$/i.exec(typeof filename === 'string' ? filename : '')?.[1].toLowerCase() || ''

const ISSUES = {
  missing: [400, 'Please choose the signed document to upload.'],
  empty: [400, 'The uploaded file is empty.'],
  type: [415, 'The signed document must be a PDF, JPG or PNG file.'],
  size: [413, `The signed document must be ${Math.round(MAX_SIGNED_DOCUMENT_SIZE / (1024 * 1024))} MB or smaller.`],
}

// `file` is one entry of the Map produced by api/_lib/multipart.js's
// parseMultipart: { buffer, size, mimeType, filename }. Returns
// { ok: true, buffer, mime, extension, size } or { ok: false, status, message }.
export async function validateSignedDocumentUpload(file) {
  const issue = signedDocumentFileIssue(file && { type: file.mimeType, size: file.buffer?.length ?? 0 })
  if (issue) {
    const [status, message] = ISSUES[issue]
    return fail(status, message)
  }

  const detected = await fileTypeFromBuffer(file.buffer)
  const type = detected && SIGNED_DOCUMENT_TYPES[detected.mime]
  if (!type) return fail(415, 'The signed document must be a PDF, JPG or PNG file.')

  // A mismatch means a crafted request (e.g. a renamed .zip/.docx, or a
  // browser Content-Type that disagrees with the actual bytes): the
  // official upload form always labels the file correctly.
  if (canonicalSignedDocumentMime(file.mimeType) !== detected.mime) {
    return fail(415, 'The signed document file type does not match its content.')
  }
  if (!type.extensions.includes(extensionOf(file.filename))) {
    return fail(415, 'The signed document file name does not match its content.')
  }

  return { ok: true, buffer: file.buffer, mime: detected.mime, extension: type.extension, size: file.buffer.length }
}
