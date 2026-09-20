import { useState } from 'react'
import { CircleCheck, CloudUpload, FileImage, FileText, X } from 'lucide-react'
import { formatFileSize, isImageFile } from './statusModel'

// The signed-document upload control: drop zone -> chosen file -> progress.
//
// Everything checked here (extension, size — upload.issue) is a UX hint
// only; the server re-validates all of it, including the magic bytes a
// browser cannot read (Phase 5B brief, §18). The token, the per-file
// uploadId and the request itself live in useAivexStatus.js.
//
// showSuccess: the panel that hosts a second dropzone (ReceivedPanel) already
// confirms a successful upload where the candidate is looking; it turns this
// off so the same message is not shown twice.
export default function SignedDocumentDropzone({
  upload, hasExisting, showSuccess = true, selectSignedDocument, clearSignedDocument, submitSignedDocument, t,
}) {
  const [dragging, setDragging] = useState(false)
  const busy = upload.status === 'uploading'
  const processing = busy && upload.progress >= 100

  const pick = (file) => {
    if (file && !busy) selectSignedDocument(file)
  }
  const handleChange = (event) => {
    pick(event.target.files?.[0])
    event.target.value = '' // allow picking the exact same file again after an error
  }
  const handleDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    pick(event.dataTransfer.files?.[0])
  }
  // dragleave also fires when the pointer moves onto a child of the zone;
  // only a real exit should switch the highlight off.
  const handleDragLeave = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false)
  }

  return (
    <div className="axs-upload">
      {!upload.file && (
        <label className="axs-drop" data-dragging={dragging ? '' : undefined}
          onDragEnter={() => setDragging(true)} onDragOver={(event) => event.preventDefault()}
          onDragLeave={handleDragLeave} onDrop={handleDrop}>
          <input type="file" className="axs-drop-input" onChange={handleChange}
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" />
          <CloudUpload size={28} strokeWidth={1.7} aria-hidden="true" />
          <strong>{dragging ? t.uploadDropActive : t.uploadDropTitle}</strong>
          <span className="axs-drop-or">{t.uploadDropOr}</span>
          <span className="axs-drop-browse">{hasExisting ? t.uploadReplaceFile : t.uploadChooseFile}</span>
          <small>{t.uploadSupportedFormats} · {t.uploadMaxSize}</small>
        </label>
      )}

      {upload.file && (
        <div className="axs-file" data-invalid={upload.issue ? '' : undefined}>
          <span className="axs-file-icon" aria-hidden="true">
            {isImageFile(upload.file) ? <FileImage size={20} strokeWidth={1.7} /> : <FileText size={20} strokeWidth={1.7} />}
          </span>
          <span className="axs-file-meta">
            <strong title={upload.file.name}>{upload.file.name}</strong>
            <small>{formatFileSize(upload.file.size, t)}</small>
          </span>
          <button type="button" className="axs-file-remove" onClick={clearSignedDocument} disabled={busy} aria-label={t.uploadRemove}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {upload.issue && <p className="axs-inline-error" role="alert">{t.uploadFileIssues[upload.issue] || t.uploadFileIssues.missing}</p>}

      {busy && (
        <div className="axs-sending" aria-live="polite">
          <div className="axs-bar" role="progressbar" aria-label={t.uploadSubmitting} aria-valuemin={0} aria-valuemax={100}
            aria-valuenow={upload.progress} data-processing={processing ? '' : undefined}>
            <span style={{ inlineSize: `${upload.progress}%` }} />
          </div>
          <p>{processing ? t.uploadProcessing : `${t.uploadSubmitting} ${upload.progress}%`}</p>
        </div>
      )}

      {upload.file && !upload.issue && (
        <button type="button" className="af-button af-button-primary axs-send" onClick={submitSignedDocument} disabled={busy} aria-busy={busy}>
          {busy ? t.uploadSubmitting : t.uploadSubmit}
        </button>
      )}

      {upload.status === 'error' && <p className="axs-inline-error" role="alert">{t.uploadErrors[upload.message] || t.uploadErrors.error}</p>}
      {showSuccess && upload.status === 'success' && (
        <p className="axs-inline-success" role="status"><CircleCheck size={16} aria-hidden="true" />{t.uploadSuccessTitle}</p>
      )}
    </div>
  )
}
