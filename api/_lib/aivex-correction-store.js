// AIVEX per-item correction resubmission — Supabase-backed store for the
// candidate-facing (Magic Link) side. Same small-interface-over-one-client
// shape as api/_lib/aivex-magic-link-store.js: a CorrectionStoreError
// carrying a stage + code, nothing else. The server-side glue (api/aivex/
// magic-link/verify.js's field branch, api/aivex/magic-link/upload/
// init.js + finalize.js's correction branch) always holds the service-role
// client — RLS denies anon/authenticated on both tables this file touches.
//
// Deliberately identity-card-free: only aivex_registrations' team/activity-
// official columns and aivex_students' card columns are ever written here.
// The delegation leader's and driver's identity card images are NOT
// self-serviceable via the Magic Link (see shared/aivex/correction-
// items.js's correctionCardSpec) — this file is reachable from it, and
// tests/aivex-identity-documents.test.mjs enforces that no Magic-Link-
// reachable file so much as mentions them.

const ITEMS = 'aivex_correction_items'
const REGISTRATIONS = 'aivex_registrations'

export class CorrectionStoreError extends Error {
  constructor(stage, cause) {
    super(stage)
    this.stage = stage
    this.code = cause?.code || cause?.statusCode || cause?.status
  }
}

export function createSupabaseCorrectionStore(supabase) {
  return {
    // Just enough to authorise and route the resubmission: the caller
    // cross-checks registration_id, kind and status itself before acting.
    async loadItem(itemId) {
      const { data, error } = await supabase.from(ITEMS)
        .select('id, registration_id, correction_request_id, item, kind, status')
        .eq('id', itemId)
        .maybeSingle()
      if (error) throw new CorrectionStoreError('load-item', error)
      return data
    },
    // Candidate-validated values stay pending on the correction item until
    // an administrator explicitly accepts them.
    async submitFieldItem(itemId, registrationId, submittedFields, now) {
      const { data, error } = await supabase.rpc('candidate_submit_aivex_field_correction', {
        p_item_id: itemId,
        p_registration_id: registrationId,
        p_submitted_fields: submittedFields,
        p_now: now.toISOString(),
      })
      if (error) throw new CorrectionStoreError('mark-submitted', error)
      return data
    },
    async submitStudentCardItem(itemId, registrationId, position, file, submittedDocumentKey, now) {
      const { data, error } = await supabase.rpc('candidate_submit_aivex_card_correction', {
        p_item_id: itemId,
        p_registration_id: registrationId,
        p_position: position,
        p_file_path: file.path,
        p_file_mime: file.mime,
        p_file_size: file.size,
        p_document_key: submittedDocumentKey,
        p_now: now.toISOString(),
      })
      if (error) throw new CorrectionStoreError('mark-submitted', error)
      return data
    },
    // Best-effort side effect of the EXISTING signed-document upload finalize
    // (api/aivex/magic-link/upload/finalize.js): if the team has an open
    // "Signed and stamped form" correction item, mark it submitted too. Never
    // throws — mirrors touchLastUsed's own "never fails the response" note.
    async markOpenItemSubmittedByLabel(registrationId, item, submittedDocumentKey, now) {
      if (item !== 'Signed and stamped form') return
      const { error } = await supabase.rpc('candidate_submit_aivex_signed_correction', {
        p_registration_id: registrationId,
        p_document_key: submittedDocumentKey,
        p_now: now.toISOString(),
      })
      if (error) throw new CorrectionStoreError('mark-submitted', error)
    },
    // Just enough to place a replacement student card: the edition its
    // storage path is namespaced by.
    async loadRegistrationForUpload(registrationId) {
      const { data, error } = await supabase.from(REGISTRATIONS)
        .select('id, edition')
        .eq('id', registrationId)
        .maybeSingle()
      if (error) throw new CorrectionStoreError('load-registration', error)
      return data
    },
    // A student card's final path is deterministic (shared/aivex/
    // contract-v4.js's studentCardStoragePath) and already holds the file it
    // replaces — upsert: true overwrites it in one write, no separate
    // remove-then-copy dance, and no risk of a transient "card missing"
    // state between the two.
    async writeFinalFile(bucket, path, buffer, mimeType) {
      const { error } = await supabase.storage.from(bucket).upload(path, buffer, { contentType: mimeType, upsert: true })
      if (error) throw new CorrectionStoreError('write-final-file', error)
    },
  }
}
