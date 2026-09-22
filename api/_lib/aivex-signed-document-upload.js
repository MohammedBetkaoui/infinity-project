// AIVEX Phase 5B — signed-document upload orchestration, one layer above
// api/_lib/aivex-signed-document-store.js (dumb CRUD), same split as
// api/_lib/aivex-document-generation.js sits over aivex-document-store.js.
//
// Handles the three things a single "insert a row" can't do safely on its
// own:
//   - idempotency: a browser retry of the exact same upload attempt (same
//     uploadId) must replay the first result, never create a second version;
//   - version allocation: two concurrent uploads must never receive the
//     same version number (retried on a unique-constraint hit, the same
//     collision-retry shape api/_lib/aivex-registration-v4.js already uses
//     for a reference collision);
//   - the document_status transition only happens after the file is
//     actually stored AND its metadata row actually exists — never before,
//     never on a partial failure (an uploaded-but-unrecorded file is
//     cleaned up, never left to imply a success that didn't fully happen).

import { createHash } from 'node:crypto'
import { UPLOAD_ELIGIBLE_DOCUMENT_STATUSES } from '../../shared/aivex/signed-document-policy.js'
import { signedDocumentPath } from './aivex-signed-document-store.js'

const MAX_VERSION_ATTEMPTS = 5

const logFailure = (stage, error) => {
  console.error('[aivex] Signed document upload failed', { stage: error?.stage || stage, code: error?.code })
}

// Metadata only — never used to build the Storage path (section 11 of the
// brief). Strips control characters (including a null byte) and path
// separators, and caps length to what the migration's own check allows.
// Filters code points rather than a control-character regex literal (which
// ESLint's no-control-regex rule flags on sight, control characters or not).
export function sanitizeOriginalFileName(name) {
  const cleaned = Array.from(String(name ?? ''))
    .filter((char) => {
      const code = char.codePointAt(0)
      return code > 0x1f && code !== 0x7f
    })
    .join('')
    .replace(/[/\\]/g, '_')
    .trim()
    .slice(0, 255)
  return cleaned || 'document'
}

// `file` = the already-validated result of validateSignedDocumentUpload
// (buffer, mime, extension, size). `uploadId` is a UUID the candidate's
// browser generates once per upload attempt and resends unchanged on a
// retry — the same idempotency shape as a registration's submissionId.
// Returns:
//   { ok: true, version, replayed } on success (replayed = true when this
//     was an idempotent replay of an already-completed attempt, not a new
//     write);
//   { ok: false, reason: 'document_not_ready' } when the registration's
//     document_status does not currently accept an upload;
//   { ok: false, reason: 'registration_not_found' };
//   throws on a real store failure (the caller logs it — never awaited
//   into a false "received" state for the candidate).
export async function uploadSignedDocument({ store, registrationId, uploadId, file, now = new Date() }) {
  if (uploadId) {
    const existing = await store.findByUploadId(registrationId, uploadId)
    if (existing) return { ok: true, version: existing.version, replayed: true }
  }

  const registration = await store.loadRegistrationForUpload(registrationId)
  if (!registration) return { ok: false, reason: 'registration_not_found' }
  if (!UPLOAD_ELIGIBLE_DOCUMENT_STATUSES.includes(registration.document_status)) {
    return { ok: false, reason: 'document_not_ready' }
  }

  const checksum = createHash('sha256').update(file.buffer).digest('hex')
  const originalFileName = sanitizeOriginalFileName(file.filename)

  // A version race can surface at either step, reported the same way by
  // the store (a clean { ok: false, duplicate: true }, the same shape
  // api/_lib/aivex-registration-v4.js already uses for a reference
  // collision) — never a thrown exception for that specific case, so a
  // genuine failure (storage down, DB unreachable) is never confused with
  // "this version number just lost a race" and blindly retried five times.
  // On a duplicate: if a concurrent request sharing this exact uploadId
  // has already finished, replay its result (never a spurious failure for
  // a candidate whose upload, under the other request, actually already
  // succeeded); otherwise retry with a freshly read version. The
  // registration_id+version and upload_id UNIQUE constraints in the
  // migration are the actual, final safety net — this loop is what makes a
  // race resolve into a working response instead of an avoidable error,
  // not what makes it safe.
  for (let attempt = 0; attempt < MAX_VERSION_ATTEMPTS; attempt += 1) {
    const version = (await store.highestVersion(registrationId)) + 1
    const path = signedDocumentPath(registrationId, registration.edition, version, file.extension)

    const uploaded = file.sourcePath && store.copyFile
      ? await store.copyFile(file.sourcePath, path)
      : await store.uploadFile(path, file.buffer, file.mime)
    if (!uploaded.ok) {
      const winner = uploadId && await store.findByUploadId(registrationId, uploadId)
      if (winner) return { ok: true, version: winner.version, replayed: true }
      continue // a version race at the Storage step — retry with a freshly read version
    }

    try {
      const inserted = await store.insertDocumentRow({
        registration_id: registrationId,
        edition: registration.edition,
        version,
        file_path: path,
        original_file_name: originalFileName,
        mime_type: file.mime,
        size_bytes: file.size,
        checksum_sha256: checksum,
        upload_id: uploadId || null,
        uploaded_at: now.toISOString(),
      })
      if (!inserted.ok) {
        await store.removeFile(path).catch((error) => logFailure('cleanup-after-conflict', error))
        const winner = uploadId && await store.findByUploadId(registrationId, uploadId)
        if (winner) return { ok: true, version: winner.version, replayed: true }
        continue // a version race at the DB step — retry with a freshly read version
      }

      await store.setDocumentStatus(registrationId, 'signed_document_uploaded')
      return { ok: true, version }
    } catch (error) {
      // A real failure after a real upload: clean up the now-orphaned file
      // and surface it immediately — never retried blindly, and never left
      // to imply a success that did not fully happen.
      await store.removeFile(path).catch((cleanupError) => logFailure('cleanup-after-failure', cleanupError))
      throw error
    }
  }
  throw Object.assign(new Error('version_attempts_exhausted'), { stage: 'version-allocation' })
}
