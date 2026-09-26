// AIVEX per-item correction — student card resubmission orchestration, one
// layer above api/_lib/aivex-correction-store.js (dumb CRUD), same split as
// api/_lib/aivex-signed-document-upload.js sits over aivex-signed-document-
// store.js. Handles the one thing a single "insert a row" can't do safely:
// only marking the correction item submitted AFTER the file is actually
// stored under the registration's real path — never before, never on a
// partial failure.
//
// Student cards only — never an identity document (delegation leader's or
// driver's national ID card image): those are deliberately not
// self-serviceable via the Magic Link (shared/aivex/correction-items.js's
// correctionCardSpec never maps one here, and this file must stay
// identity-card-free for tests/aivex-identity-documents.test.mjs's own
// invariant, since it is reachable from the Magic Link).
//
// Unlike the signed document, a card correction is never versioned: the
// final path is the SAME deterministic path the original card lives at
// (shared/aivex/contract-v4.js's studentCardStoragePath). There is no
// version race to retry here: this registration's one open item for this
// card is the only writer, enforced by the item's own 'open' status check
// below (a second finalize of the same item, e.g. a client retry, finds it
// already 'submitted' and is refused — see the caller for the idempotent
// early-return on a repeat request).

import { studentCardStoragePath } from '../../shared/aivex/contract-v4.js'

const logFailure = (stage, error) => {
  console.error('[aivex] Correction document upload failed', { stage: error?.stage || stage, code: error?.code })
}

// `file` = the already-validated result of validateCorrectionCardV4
// (buffer, mime, size, position) plus `sourcePath`/`bucket` from
// verifyCorrectionUploadStaging.
//
// Returns:
//   { ok: true, documentKey } on success;
//   { ok: false, reason: 'correction_item_not_ready' } when the item is not
//     currently an open document-kind item of this registration (already
//     submitted/verified, wrong kind, or belongs to another registration);
//   { ok: false, reason: 'registration_not_found' };
//   throws on a real store failure (the caller logs it).
export async function uploadCorrectionDocument({ store, itemId, registrationId, file, now = new Date() }) {
  const item = await store.loadItem(itemId)
  if (!item || item.registration_id !== registrationId || item.kind !== 'document' || item.status !== 'open') {
    return { ok: false, reason: 'correction_item_not_ready' }
  }

  const registration = await store.loadRegistrationForUpload(registrationId)
  if (!registration) return { ok: false, reason: 'registration_not_found' }

  const finalPath = studentCardStoragePath(registrationId, file.position, file.mime, registration.edition)
  const documentKey = `student-${file.position}`

  try {
    await store.writeFinalFile(file.bucket, finalPath, file.buffer, file.mime)
  } catch (error) {
    logFailure('write-final-file', error)
    throw error
  }

  try {
    await store.submitStudentCardItem(
      itemId, registrationId, file.position,
      { path: finalPath, mime: file.mime, size: file.size },
      documentKey, now,
    )
  } catch (error) {
    // The new file is already live (writeFinalFile succeeded); a failure
    // past this point never leaves the candidate believing nothing happened
    // — it is thrown, logged with a stage, and the caller answers a real
    // error rather than a false success. Nothing here can "half apply": the
    // uploaded bytes are correct even if the item-status write below them
    // failed, so a retry finalize (the client's normal error recovery) will
    // simply resend the same buffer and mark the item submitted on success.
    logFailure('apply-correction', error)
    throw error
  }

  return { ok: true, documentKey }
}
