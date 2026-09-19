// AIVEX official document — Supabase-backed store for the generation
// pipeline (api/_lib/aivex-document-generation.js).
//
// Mirrors the shape of createSupabaseRegistrationStore in
// aivex-registration-v4.js (a small interface over one Supabase client,
// StoreError carrying a stage + code, nothing else) rather than extending
// that store directly: the registration write path is already deployed and
// tested in production, and this phase does not touch it beyond handing it
// the same `supabase` client to build this second store from.

import { WORD_VARIABLES_V4 } from '../../shared/aivex/word-mapping-v4.js'

const REGISTRATIONS = 'aivex_registrations'
const STUDENTS = 'aivex_students'
const SETTINGS = 'aivex_settings'
const DOCUMENTS = 'aivex_generated_documents'
const BUCKET = 'aivex-generated-forms'

export class DocumentStoreError extends Error {
  constructor(stage, cause) {
    super(stage)
    this.stage = stage
    this.code = cause?.code || cause?.statusCode || cause?.status
  }
}

// Column lists derived from the Word mapping itself (not retyped by hand):
// selecting exactly what resolveWordDataV4 reads, and no more.
const columnsFrom = (source) => [...new Set(WORD_VARIABLES_V4.filter((entry) => entry.source === source).map((entry) => entry.column))]
// 'reference' and 'position' are already among the mapped columns
// (registration_reference / student_N_*); 'id' and 'edition' are not Word
// variables but are needed to build the Storage path and copy edition onto
// the students query.
const REGISTRATION_COLUMNS = [...new Set(['id', 'edition', ...columnsFrom('registration')])]
const STUDENT_COLUMNS = [...new Set(['position', ...columnsFrom('student')])]
const SETTINGS_COLUMNS = columnsFrom('settings')

export function createSupabaseDocumentStore(supabase) {
  const bucket = () => supabase.storage.from(BUCKET)
  return {
    // Atomic claim: only the caller whose UPDATE ... WHERE ... RETURNING
    // flips the row to 'generating' proceeds. Claimable: not_generated or
    // generation_failed; failing that, a 'generating' claim last touched
    // before `staleBefore` (an attempt that died). Two plain UPDATEs rather
    // than one PostgREST or() filter: each is atomic on its own, a row can
    // only match one of them, and neither needs a timestamp inside an or()
    // logic tree (where ':' and '.' are reserved characters). Concurrent
    // callers, or a registration already past this point, get false.
    // The update bumps updated_at (aivex_registrations_touch_updated_at),
    // which is what dates the new claim.
    async claimGeneration(registrationId, { staleBefore }) {
      const claim = async (narrow) => {
        const query = supabase.from(REGISTRATIONS).update({ document_status: 'generating' }).eq('id', registrationId)
        const { data, error } = await narrow(query).select('id')
        if (error) throw new DocumentStoreError('claim', error)
        return data.length > 0
      }
      return await claim((query) => query.in('document_status', ['not_generated', 'generation_failed']))
        || claim((query) => query.eq('document_status', 'generating').lt('updated_at', staleBefore.toISOString()))
    },
    // Administrative retry (scripts/aivex-retry-documents.mjs): registrations
    // of an edition whose documents failed, or whose claim went stale.
    async listRetryableRegistrations({ edition, staleBefore }) {
      const list = async (narrow) => {
        const query = supabase.from(REGISTRATIONS).select('id, reference, document_status, created_at')
          .eq('edition', edition).eq('form_version', 4)
        const { data, error } = await narrow(query).order('created_at')
        if (error) throw new DocumentStoreError('list-retryable', error)
        return data
      }
      const unsettled = await list((query) => query.in('document_status', ['not_generated', 'generation_failed']))
      const stale = await list((query) => query.eq('document_status', 'generating').lt('updated_at', staleBefore.toISOString()))
      return [...unsettled, ...stale].sort((a, b) => a.created_at.localeCompare(b.created_at))
    },
    // The registration + its three students (official data only) and the
    // edition's settings row, which may not exist yet (aivex_settings has no
    // seed by design — resolveWordDataV4 renders missing fields as blanks).
    async loadRegistrationData(registrationId) {
      const { data: registration, error: registrationError } = await supabase
        .from(REGISTRATIONS).select(REGISTRATION_COLUMNS.join(', ')).eq('id', registrationId).single()
      if (registrationError || !registration) throw new DocumentStoreError('load-registration', registrationError)

      const { data: students, error: studentsError } = await supabase
        .from(STUDENTS).select(STUDENT_COLUMNS.join(', ')).eq('registration_id', registrationId).order('position')
      if (studentsError) throw new DocumentStoreError('load-students', studentsError)

      const { data: settings, error: settingsError } = await supabase
        .from(SETTINGS).select(SETTINGS_COLUMNS.join(', ')).eq('edition', registration.edition).maybeSingle()
      if (settingsError) throw new DocumentStoreError('load-settings', settingsError)

      return { registration, students: students || [], settings: settings || null }
    },
    async uploadDocument(path, buffer, mimeType) {
      // A retry overwrites its own previous attempt at the same path.
      const { error } = await bucket().upload(path, buffer, { contentType: mimeType, upsert: true })
      if (error) throw new DocumentStoreError('upload', error)
    },
    // One current row per (registration, document_type) — a retry replaces
    // it rather than accumulating history (aivex_generated_documents_
    // registration_type_key in the migration).
    async upsertDocumentRow(row) {
      const { error } = await supabase.from(DOCUMENTS).upsert(row, { onConflict: 'registration_id,document_type' })
      if (error) throw new DocumentStoreError('document-row', error)
    },
    async removeDocumentFile(path) {
      if (!path) return
      const { error } = await bucket().remove([path])
      if (error) throw new DocumentStoreError('cleanup-storage', error)
    },
    async setDocumentStatus(registrationId, status) {
      const { error } = await supabase.from(REGISTRATIONS).update({ document_status: status }).eq('id', registrationId)
      if (error) throw new DocumentStoreError('set-status', error)
    },
    // Download (api/aivex/document.js). A registration is only ever found by
    // its public reference AND the submissionId the submitting browser
    // generated — never by reference alone, which is printed on paper.
    async findRegistrationForDownload({ reference, submissionId }) {
      const { data, error } = await supabase.from(REGISTRATIONS).select('id, edition, reference')
        .eq('submission_id', submissionId).eq('reference', reference).eq('form_version', 4).maybeSingle()
      if (error) throw new DocumentStoreError('find-registration', error)
      return data
    },
    async loadDocumentRow(registrationId, documentType) {
      const { data, error } = await supabase.from(DOCUMENTS).select('generation_status, file_path, mime_type')
        .eq('registration_id', registrationId).eq('document_type', documentType).maybeSingle()
      if (error) throw new DocumentStoreError('load-document-row', error)
      return data
    },
    // Read through the service-role client and streamed back by the
    // function: no public URL, no signed URL, nothing that outlives the
    // response.
    async downloadDocument(path) {
      const { data, error } = await bucket().download(path)
      if (error || !data) throw new DocumentStoreError('download', error)
      return Buffer.from(await data.arrayBuffer())
    },
  }
}
