// AIVEX Phase 5B — signed-document upload policy, shared by the candidate
// status page (client-side hints only) and the server (authoritative
// checks). Same discipline as shared/aivex/contract-v4.js: pure, no React,
// window, document, Supabase, process.env or network.
//
// Deliberately its own module, not an addition to contract-v4.js: the
// signed document is a printed-and-stamped copy of the official DOCX, not a
// V4 registration field, and the V4 contract module is not touched by this
// phase (see docs/aivex-data-contract-v4.md's own "do not touch" list).

const frozen = (list) => Object.freeze([...list])

// Server-authoritative; the client may only use this to show a hint before
// sending anything (section 18 of the Phase 5B brief) — a value here never
// substitutes for the server's own check of the same limit.
export const MAX_SIGNED_DOCUMENT_SIZE = 10 * 1024 * 1024 // 10 MB

export const SIGNED_DOCUMENT_BUCKET = 'aivex-signed-forms'

// Same shape as STUDENT_CARD_POLICY.types in contract-v4.js (extension for
// the storage path, extensions for the client-filename cross-check, label
// for display) — PDF added, WEBP dropped (a signed document is either a
// scan/photo or already a PDF; WEBP was never asked for here).
export const SIGNED_DOCUMENT_TYPES = Object.freeze({
  'application/pdf': Object.freeze({ extension: 'pdf', extensions: frozen(['pdf']), label: 'PDF' }),
  'image/jpeg': Object.freeze({ extension: 'jpg', extensions: frozen(['jpg', 'jpeg']), label: 'JPG' }),
  'image/png': Object.freeze({ extension: 'png', extensions: frozen(['png']), label: 'PNG' }),
})
export const SIGNED_DOCUMENT_MIME_ALIASES = Object.freeze({ 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg' })

export const canonicalSignedDocumentMime = (mime) => {
  const type = String(mime || '').toLowerCase()
  return SIGNED_DOCUMENT_MIME_ALIASES[type] || type
}

// Same 'missing' | 'type' | 'empty' | 'size' shape as studentCardFileIssue
// in contract-v4.js, reused here for the client-side hint only — the server
// (api/_lib/aivex-signed-document-validation.js) re-checks all of this
// itself from the real bytes, which a browser cannot inspect reliably.
export function signedDocumentFileIssue(file) {
  if (!file) return 'missing'
  if (!SIGNED_DOCUMENT_TYPES[canonicalSignedDocumentMime(file.type)]) return 'type'
  if (!(file.size > 0)) return 'empty'
  if (file.size > MAX_SIGNED_DOCUMENT_SIZE) return 'size'
  return ''
}

// Document-status values that mean "a signed document may be uploaded now":
// the official DOCX exists (awaiting_signature), or one was already
// received and a newer version may replace it (signed_document_uploaded).
// Any other status (no DOCX yet, or a future admin state this phase never
// produces) refuses the upload — see api/_lib/aivex-signed-document-upload.js.
export const UPLOAD_ELIGIBLE_DOCUMENT_STATUSES = frozen(['awaiting_signature', 'signed_document_uploaded'])
