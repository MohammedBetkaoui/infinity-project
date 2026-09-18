// AIVEX official document generation — the workflow described in
// docs/aivex-data-contract-v4.md's Word mapping, turned into files:
//
//   registration written (registerV4) -> document_status: generating
//     -> load registration + students + edition settings
//     -> render the official DOCX from the fixed template
//     -> upload it to the private bucket aivex-generated-forms
//     -> record it in aivex_generated_documents
//     -> attempt a PDF companion (see api/_lib/aivex-document-template.js:
//        not implemented in this phase — recorded honestly as failed,
//        never faked)
//   -> document_status: awaiting_signature (docx succeeded) or
//      generation_failed (it did not)
//
// Called right after a registration is created, and again on every replay
// of the same submissionId (api/aivex/register.js) — plus by the
// administrative retry script (scripts/aivex-retry-documents.mjs).
// Idempotent: claimGeneration only lets one caller in at a time, and only
// for not_generated / generation_failed, or a 'generating' claim older than
// DOCUMENT_STALE_AFTER_MS (an attempt that died mid-way). A registration
// already at awaiting_signature or later is left alone: its existing
// documents are reused, never regenerated blindly.
//
// The registration itself is never touched here beyond document_status: a
// failure at any step leaves the registration, its students and its student
// cards exactly as they were (no rollback, no deletion — see aivex-
// registration-v4.js for that, unrelated, part of the pipeline).

import {
  AIVEX_TEMPLATE_VERSION, DOCX_MIME, PDF_MIME, convertDocxToPdf, loadRegistrationTemplate, renderRegistrationDocx,
} from './aivex-document-template.js'
import { resolveWordDataV4 } from '../../shared/aivex/word-mapping-v4.js'

const DOCUMENT_TYPES = Object.freeze({ docx: 'docx', pdf: 'pdf' })

// Same reasoning as STALE_AFTER_MS in aivex-registration-v4.js: longer than
// the function's maxDuration (60 s, vercel.json), so a claim still being
// worked on is never mistaken for a dead one.
export const DOCUMENT_STALE_AFTER_MS = 3 * 60 * 1000

const logFailure = (stage, error) => {
  console.error('[aivex] Document generation failed', { stage: error?.stage || stage, code: error?.code })
}

// Short, stable codes only — never a raw error message or stack trace, same
// discipline as the registration write path. The code names the step that
// failed (tracked by the caller), so it stays accurate whatever threw.
const errorCode = (step) => `${step}_failed`

// --- Document presentation ----------------------------------------------------
//
// resolveWordDataV4 hands over raw column values on purpose ("presentation
// is decided with the template"). Dates are the one case where raw is not
// printable: aivex_settings.submission_deadline is a timestamptz, which
// Supabase returns as "2026-11-30T23:00:00+00:00". It is shown as its
// calendar date where the event takes place, in the same YYYY-MM-DD form as
// the two event dates (`date` columns, already "YYYY-MM-DD"). The display
// format itself (ISO vs Arabic month names) is still an open decision.
const DATE_VARIABLES = ['event_start_date', 'event_end_date', 'submission_deadline']
export const EVENT_TIME_ZONE = 'Africa/Algiers'
const calendarDate = new Intl.DateTimeFormat('en-CA', { timeZone: EVENT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

export function formatDocumentDate(value) {
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const instant = new Date(value)
  return Number.isNaN(instant.getTime()) ? value : calendarDate.format(instant)
}

const presentForDocument = (data) => ({
  ...data,
  ...Object.fromEntries(DATE_VARIABLES.map((key) => [key, formatDocumentDate(data[key])])),
})

// Deterministic, private, and namespaced by edition and document type —
// mirrors studentCardStoragePath's shape in shared/aivex/contract-v4.js,
// kept separate because this bucket and this path never reach the browser.
export function generatedDocumentPath(registrationId, edition, reference, type) {
  if (!Number.isInteger(edition) || edition < 1) throw new TypeError('Invalid edition.')
  if (!registrationId || !reference || !DOCUMENT_TYPES[type]) throw new TypeError('Invalid document path input.')
  return `edition-${edition}/${registrationId}/${reference}.${type}`
}

async function generateDocx(store, { registrationId, registration, data }) {
  const path = generatedDocumentPath(registrationId, registration.edition, registration.reference, DOCUMENT_TYPES.docx)
  let step = 'template_load'
  try {
    const template = await loadRegistrationTemplate()
    step = 'render'
    const buffer = await renderRegistrationDocx(template, data)
    step = 'upload'
    await store.uploadDocument(path, buffer, DOCX_MIME)
    step = 'record'
    await store.upsertDocumentRow({
      registration_id: registrationId, edition: registration.edition, document_type: DOCUMENT_TYPES.docx,
      generation_status: 'generated', file_path: path, mime_type: DOCX_MIME, file_size_bytes: buffer.length,
      template_version: AIVEX_TEMPLATE_VERSION, error_code: null,
    })
    return { ok: true, buffer }
  } catch (error) {
    logFailure(`docx-${step}`, error)
    // Best effort: an upload that succeeded before a later step failed
    // should not leave an orphaned file behind.
    if (step === 'record') await store.removeDocumentFile(path).catch(() => {})
    await store.upsertDocumentRow({
      registration_id: registrationId, edition: registration.edition, document_type: DOCUMENT_TYPES.docx,
      generation_status: 'failed', template_version: AIVEX_TEMPLATE_VERSION, error_code: errorCode(step),
    }).catch((rowError) => logFailure('docx-row', rowError))
    return { ok: false }
  }
}

// Isolated on purpose (see aivex-document-template.js): today this always
// records an honest 'failed' row with a distinct, non-alarming reason
// instead of a fabricated PDF. The docx outcome alone decides document_status.
// Never attempted without a source docx: there is nothing to convert.
async function generatePdf(store, { registrationId, registration, docxBuffer }) {
  if (!docxBuffer) {
    await store.upsertDocumentRow({
      registration_id: registrationId, edition: registration.edition, document_type: DOCUMENT_TYPES.pdf,
      generation_status: 'failed', template_version: AIVEX_TEMPLATE_VERSION, error_code: 'docx_generation_failed',
    }).catch((rowError) => logFailure('pdf-row', rowError))
    return { ok: false }
  }
  let step = 'pdf_conversion'
  try {
    const outcome = await convertDocxToPdf(docxBuffer)
    if (!outcome.available) {
      await store.upsertDocumentRow({
        registration_id: registrationId, edition: registration.edition, document_type: DOCUMENT_TYPES.pdf,
        generation_status: 'failed', template_version: AIVEX_TEMPLATE_VERSION, error_code: outcome.reason,
      })
      return { ok: false }
    }
    const path = generatedDocumentPath(registrationId, registration.edition, registration.reference, DOCUMENT_TYPES.pdf)
    step = 'pdf_upload'
    await store.uploadDocument(path, outcome.buffer, PDF_MIME)
    step = 'pdf_record'
    await store.upsertDocumentRow({
      registration_id: registrationId, edition: registration.edition, document_type: DOCUMENT_TYPES.pdf,
      generation_status: 'generated', file_path: path, mime_type: PDF_MIME, file_size_bytes: outcome.buffer.length,
      template_version: AIVEX_TEMPLATE_VERSION, error_code: null,
    })
    return { ok: true }
  } catch (error) {
    logFailure(step, error)
    await store.upsertDocumentRow({
      registration_id: registrationId, edition: registration.edition, document_type: DOCUMENT_TYPES.pdf,
      generation_status: 'failed', template_version: AIVEX_TEMPLATE_VERSION, error_code: errorCode(step),
    }).catch((rowError) => logFailure('pdf-row', rowError))
    return { ok: false }
  }
}

// Best-effort, never throws: a failure here must never surface as a failure
// of the registration itself (see api/aivex/register.js). Returns a small
// diagnostic object for logs/tests, not part of the HTTP response contract.
export async function generateOfficialDocuments({ store, registrationId, now = new Date() }) {
  let claimed
  try {
    claimed = await store.claimGeneration(registrationId, { staleBefore: new Date(now.getTime() - DOCUMENT_STALE_AFTER_MS) })
  } catch (error) {
    logFailure('claim', error)
    return { attempted: false, reason: 'claim_failed' }
  }
  if (!claimed) return { attempted: false, reason: 'already_settled_or_in_progress' }

  try {
    const { registration, students, settings } = await store.loadRegistrationData(registrationId)
    const data = presentForDocument(resolveWordDataV4({ settings, registration, students }))

    const docx = await generateDocx(store, { registrationId, registration, data })
    const pdf = await generatePdf(store, { registrationId, registration, docxBuffer: docx.buffer })

    await store.setDocumentStatus(registrationId, docx.ok ? 'awaiting_signature' : 'generation_failed')
    return { attempted: true, docx: docx.ok, pdf: pdf.ok, at: now.toISOString() }
  } catch (error) {
    logFailure('generation', error)
    await store.setDocumentStatus(registrationId, 'generation_failed').catch((statusError) => logFailure('set-status', statusError))
    return { attempted: true, docx: false, pdf: false, error: true }
  }
}
