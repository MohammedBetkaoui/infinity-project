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
const STUDENTS = 'aivex_students'

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
    // 'Team information' or 'Activities manager' only — the patch is built
    // by the caller from readTeam/readActivityOfficial's own validated
    // output (shared/aivex/contract-v4.js), never from raw request fields.
    async updateRegistrationFields(registrationId, patch) {
      const { error } = await supabase.from(REGISTRATIONS).update(patch).eq('id', registrationId)
      if (error) throw new CorrectionStoreError('update-registration', error)
    },
    async markFieldItemSubmitted(itemId, submittedFields, now) {
      const { error } = await supabase.from(ITEMS)
        .update({ status: 'submitted', submitted_fields: submittedFields, submitted_at: now.toISOString() })
        .eq('id', itemId)
      if (error) throw new CorrectionStoreError('mark-submitted', error)
    },
    async markDocumentItemSubmitted(itemId, submittedDocumentKey, now) {
      const { error } = await supabase.from(ITEMS)
        .update({ status: 'submitted', submitted_document_key: submittedDocumentKey, submitted_at: now.toISOString() })
        .eq('id', itemId)
      if (error) throw new CorrectionStoreError('mark-submitted', error)
    },
    // Best-effort side effect of the EXISTING signed-document upload finalize
    // (api/aivex/magic-link/upload/finalize.js): if the team has an open
    // "Signed and stamped form" correction item, mark it submitted too. Never
    // throws — mirrors touchLastUsed's own "never fails the response" note.
    async markOpenItemSubmittedByLabel(registrationId, item, submittedDocumentKey, now) {
      const { data, error } = await supabase.from(ITEMS)
        .select('id').eq('registration_id', registrationId).eq('item', item).eq('status', 'open').maybeSingle()
      if (error || !data) return
      await supabase.from(ITEMS)
        .update({ status: 'submitted', submitted_document_key: submittedDocumentKey, submitted_at: now.toISOString() })
        .eq('id', data.id)
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
    async replaceStudentCard(registrationId, position, file) {
      const { error } = await supabase.from(STUDENTS)
        .update({
          student_card_path: file.path, student_card_mime: file.mime, student_card_size_bytes: file.size,
        })
        .eq('registration_id', registrationId).eq('position', position)
      if (error) throw new CorrectionStoreError('replace-student-card', error)
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
