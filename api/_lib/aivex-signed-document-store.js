// AIVEX Phase 5B — Supabase-backed store for signed-document uploads. Same
// small-interface-over-one-client shape as createSupabaseDocumentStore
// (api/_lib/aivex-document-store.js): a StoreError carrying a stage + code,
// nothing else. Orchestration (version allocation, retries, the
// document_status transition) lives in api/_lib/aivex-signed-document-
// upload.js, one layer up — this file is dumb CRUD only.

import { SIGNED_DOCUMENT_BUCKET } from '../../shared/aivex/signed-document-policy.js'

const REGISTRATIONS = 'aivex_registrations'
const DOCUMENTS = 'aivex_submitted_documents'

export class SignedDocumentStoreError extends Error {
  constructor(stage, cause) {
    super(stage)
    this.stage = stage
    this.code = cause?.code || cause?.statusCode || cause?.status
  }
}

// Best-effort detection of Supabase Storage's "this path already has an
// object" error under upsert: false — its exact shape isn't a stable,
// documented contract, so this stays narrow (a 409 status, or an explicit
// "already exists"/"duplicate" message) and anything it doesn't recognise
// falls through to a real, loud SignedDocumentStoreError instead of being
// silently treated as a harmless race.
const isAlreadyExists = (error) => String(error?.statusCode || error?.status || '') === '409'
  || /already exists|duplicate/i.test(error?.message || '')

// Deterministic, private, namespaced by edition and registration — same
// shape as generatedDocumentPath in api/_lib/aivex-document-generation.js.
// Never derived from the candidate's original file name.
export function signedDocumentPath(registrationId, edition, version, extension) {
  if (!Number.isInteger(edition) || edition < 1) throw new TypeError('Invalid edition.')
  if (!registrationId || !Number.isInteger(version) || version < 1) throw new TypeError('Invalid signed document path input.')
  return `edition-${edition}/${registrationId}/signed/v${version}.${extension}`
}

export function createSupabaseSignedDocumentStore(supabase) {
  const bucket = () => supabase.storage.from(SIGNED_DOCUMENT_BUCKET)
  return {
    // Just enough to authorise and place the upload: whether a document
    // already exists to be signed (document_status), and the edition the
    // storage path is namespaced by. Never students, cards or contact data.
    async loadRegistrationForUpload(registrationId) {
      const { data, error } = await supabase.from(REGISTRATIONS)
        .select('id, edition, document_status')
        .eq('id', registrationId)
        .maybeSingle()
      if (error) throw new SignedDocumentStoreError('load-registration', error)
      return data
    },
    // Idempotency lookup: the client sends one uploadId per upload attempt
    // (generated once, before the request, and resent unchanged on a
    // browser retry — the same pattern as submissionId for a registration).
    // A match means this exact attempt already succeeded; the caller
    // replays that result instead of creating another version.
    async findByUploadId(registrationId, uploadId) {
      if (!uploadId) return null
      const { data, error } = await supabase.from(DOCUMENTS)
        .select('version, uploaded_at')
        .eq('registration_id', registrationId).eq('upload_id', uploadId)
        .maybeSingle()
      if (error) throw new SignedDocumentStoreError('find-by-upload-id', error)
      return data
    },
    // Highest version on record for this registration, or 0 if none yet —
    // the caller adds 1. Never assumes versions are contiguous or that the
    // count equals the max (versions are never deleted, but reading the max
    // explicitly is one honest source of truth either way).
    async highestVersion(registrationId) {
      const { data, error } = await supabase.from(DOCUMENTS)
        .select('version')
        .eq('registration_id', registrationId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new SignedDocumentStoreError('highest-version', error)
      return data?.version ?? 0
    },
    // Returns { ok: true } or { ok: false, duplicate: true } — the same
    // shape as insertDocumentRow below — on a path already taken; throws
    // for anything else. upsert: false, so a version race that reaches the
    // upload step for the same path is reported, never silently
    // overwritten. The caller (api/_lib/aivex-signed-document-upload.js)
    // treats either a duplicate upload or a duplicate insert identically:
    // both mean "this version number just lost a race", worth retrying
    // with a fresh one; nothing else is.
    async uploadFile(path, buffer, mimeType) {
      const { error } = await bucket().upload(path, buffer, { contentType: mimeType, upsert: false })
      if (!error) return { ok: true }
      if (isAlreadyExists(error)) return { ok: false, duplicate: true }
      throw new SignedDocumentStoreError('upload', error)
    },
    async copyFile(sourcePath, path) {
      const { error } = await bucket().copy(sourcePath, path)
      if (!error) return { ok: true }
      if (isAlreadyExists(error)) return { ok: false, duplicate: true }
      throw new SignedDocumentStoreError('copy', error)
    },
    async removeFile(path) {
      if (!path) return
      const { error } = await bucket().remove([path])
      if (error) throw new SignedDocumentStoreError('cleanup-storage', error)
    },
    // Returns { ok: true } or { ok: false, duplicate: true } on a unique-
    // constraint hit (registration_id+version, or upload_id) — the caller
    // decides whether that means "retry with a fresh version" or "this
    // exact attempt already exists".
    async insertDocumentRow(row) {
      const { error } = await supabase.from(DOCUMENTS).insert(row)
      if (error) {
        if (error.code === '23505') return { ok: false, duplicate: true }
        throw new SignedDocumentStoreError('document-row', error)
      }
      return { ok: true }
    },
    async setDocumentStatus(registrationId, status) {
      const { error } = await supabase.from(REGISTRATIONS).update({ document_status: status }).eq('id', registrationId)
      if (error) throw new SignedDocumentStoreError('set-status', error)
    },
    // The candidate status page's own view of "was a signed document
    // received" (api/aivex/magic-link/verify.js) — version + timestamp
    // only, never the storage path or the file itself.
    async latestForCandidate(registrationId) {
      const { data, error } = await supabase.from(DOCUMENTS)
        .select('version, uploaded_at')
        .eq('registration_id', registrationId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new SignedDocumentStoreError('latest-for-candidate', error)
      return data
    },
  }
}
