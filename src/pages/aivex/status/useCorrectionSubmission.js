import { useState } from 'react'
import { createSubmissionId } from '../../../../shared/aivex/contract-v4.js'
import { correctionCardSpec } from '../../../../shared/aivex/correction-items.js'
import { postCandidateJson, uploadToSignedStorage } from '../../../lib/directStorageUpload'

// Per-item correction resubmission (CorrectionRequestPanel), one open item
// at a time per team but potentially several open items at once (e.g. two
// student cards flagged together) — so every piece of state here is keyed
// by itemId, unlike useAivexStatus's single `upload` (the signed form is
// always at most one open action).
//
// Same discipline as useAivexStatus.js: the token lives only in memory, read
// once from the caller (AivexStatusPage already reads it for every other
// candidate action); nothing here is ever written to storage.

// Field corrections share /verify (a { itemId, fields } body switches it
// into a mutation, see that file's header); document corrections share the
// signed-document upload pair ({ itemId } in the init body, and the session
// itself, decide the branch server-side) — three would-be new endpoints
// folded into three existing ones to stay within the Vercel Hobby plan's
// 12-Function ceiling (see tests/admin-auth.test.mjs).
const FIELD_ENDPOINT = '/api/aivex/magic-link/verify'
const UPLOAD_INIT_ENDPOINT = '/api/aivex/magic-link/upload/init'
const UPLOAD_FINALIZE_ENDPOINT = '/api/aivex/magic-link/upload/finalize'
const REQUEST_TIMEOUT_MS = 12000
const UPLOAD_TIMEOUT_MS = REQUEST_TIMEOUT_MS * 10

const BLANK_UPLOAD = { file: null, uploadId: null, issue: '', status: 'idle', message: '', progress: 0 }

// Same 'missing' | 'type' | 'empty' | 'size' shape as the signed-document
// hint (shared/aivex/signed-document-policy.js's signedDocumentFileIssue) —
// a UX hint only, the server re-checks the real bytes.
function correctionFileIssue(item, file) {
  const spec = correctionCardSpec(item)
  if (!file) return 'missing'
  if (!spec.policy.types[spec.policy.mimeAliases[file.type] || file.type]) return 'type'
  if (!(file.size > 0)) return 'empty'
  if (file.size > spec.policy.maxBytes) return 'size'
  return ''
}

export default function useCorrectionSubmission(token, onSubmitted) {
  const [uploads, setUploads] = useState({})
  const [fieldForms, setFieldForms] = useState({})

  const uploadFor = (itemId) => uploads[itemId] || BLANK_UPLOAD
  const fieldFor = (itemId, initialValues = {}) => fieldForms[itemId] || { values: initialValues, error: '', errorMessage: '', saving: false }

  const selectFile = (itemId, item, file) => {
    setUploads((previous) => ({
      ...previous,
      [itemId]: { ...BLANK_UPLOAD, file, uploadId: createSubmissionId(), issue: correctionFileIssue(item, file) },
    }))
  }
  const clearFile = (itemId) => setUploads((previous) => {
    const current = previous[itemId]
    if (current && ['preparing', 'uploading', 'verifying'].includes(current.status)) return previous
    return { ...previous, [itemId]: BLANK_UPLOAD }
  })

  const submitFile = async (itemId) => {
    const current = uploadFor(itemId)
    if (!token || !current.file || current.issue || ['preparing', 'uploading', 'verifying'].includes(current.status)) return
    setUploads((previous) => ({ ...previous, [itemId]: { ...previous[itemId], status: 'preparing', message: '', progress: 0 } }))
    try {
      const initialized = await postCandidateJson(UPLOAD_INIT_ENDPOINT, {
        token, itemId, uploadId: current.uploadId,
        file: { name: current.file.name, mime: current.file.type, size: current.file.size },
      })
      setUploads((previous) => ({ ...previous, [itemId]: { ...previous[itemId], status: 'uploading', progress: 0 } }))
      if (!initialized.upload?.alreadyUploaded) {
        await uploadToSignedStorage({
          signedUrl: initialized.upload.signedUrl,
          file: current.file,
          timeoutMs: UPLOAD_TIMEOUT_MS,
          onProgress: (loaded, total) => {
            const progress = total ? Math.min(99, Math.round((loaded / total) * 100)) : 0
            setUploads((previous) => (previous[itemId]?.status === 'uploading' ? { ...previous, [itemId]: { ...previous[itemId], progress } } : previous))
          },
        })
      }
      setUploads((previous) => ({ ...previous, [itemId]: { ...previous[itemId], status: 'verifying', progress: 100 } }))
      await postCandidateJson(UPLOAD_FINALIZE_ENDPOINT, { token, uploadSessionId: initialized.uploadSessionId }, UPLOAD_TIMEOUT_MS)
      setUploads((previous) => ({ ...previous, [itemId]: { ...BLANK_UPLOAD, status: 'success' } }))
      onSubmitted?.()
    } catch (error) {
      setUploads((previous) => ({ ...previous, [itemId]: { ...previous[itemId], status: 'error', message: error?.status || 'error', progress: 0 } }))
    }
  }

  const updateFieldValue = (itemId, key, value, initialValues = {}) => {
    setFieldForms((previous) => ({
      ...previous,
      [itemId]: { ...fieldFor(itemId, initialValues), values: { ...fieldFor(itemId, initialValues).values, [key]: value }, error: '', errorMessage: '' },
    }))
  }

  const submitField = async (itemId, fields) => {
    if (!token || fieldFor(itemId).saving) return
    setFieldForms((previous) => ({ ...previous, [itemId]: { ...fieldFor(itemId), saving: true, error: '', errorMessage: '' } }))
    try {
      await postCandidateJson(FIELD_ENDPOINT, { token, itemId, fields }, REQUEST_TIMEOUT_MS)
      setFieldForms((previous) => ({ ...previous, [itemId]: { values: {}, error: '', errorMessage: '', saving: false } }))
      onSubmitted?.()
    } catch (error) {
      // The server's own message (e.g. "Team: enter a team name (2 to 120
      // characters).") is already a precise, safe-to-show sentence
      // (shared/aivex/contract-v4.js's readTeam/readActivityOfficial) —
      // shown as-is, with a generic fallback only when none came through.
      setFieldForms((previous) => ({
        ...previous, [itemId]: { ...fieldFor(itemId), saving: false, error: error?.status || 'error', errorMessage: error?.message || '' },
      }))
    }
  }

  return { uploadFor, selectFile, clearFile, submitFile, fieldFor, updateFieldValue, submitField }
}
