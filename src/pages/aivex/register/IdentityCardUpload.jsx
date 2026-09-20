import { useRef, useState } from 'react'
import { IdCard } from 'lucide-react'
import { IDENTITY_CARD_POLICY } from '../../../../shared/aivex/contract-v4.js'
import { IDENTITY_CARD_TYPES, checkIdentityFile, describeCardFile } from './registrationModel'

// The identity card image of ONE person of the delegation (head of delegation
// or driver). Same behaviour as the student card picker, with two deliberate
// differences:
//   - the image is NOT previewed. An identity document has no reason to be
//     drawn on screen (or turned into an object URL): the file name, type and
//     size are enough to confirm the right file was picked.
//   - only JPG/PNG are accepted (IDENTITY_CARD_POLICY, same rule as the API).
// Every check here is a UX hint: the server reads the real bytes again.
//
// Accessible by construction: the native <input type="file"> carries the
// <label>, the hint and the error (aria-describedby); the drop area is only a
// larger click/drop target and is hidden from assistive technology.
export default function IdentityCardUpload({ inputId, label, file, dropped, error, onChange, t }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  // A picked file that failed the checks: shown, never kept in the form.
  const [rejected, setRejected] = useState(null)
  const shownError = rejected?.message || error
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`

  const accept = (candidate) => {
    const problem = checkIdentityFile(candidate, t)
    setRejected(problem ? { name: candidate.name, details: describeCardFile(candidate, IDENTITY_CARD_POLICY), message: problem } : null)
    if (!problem) onChange(candidate)
  }

  const handleInput = (event) => {
    const [picked] = event.target.files || []
    // Cleared so that picking the same file again after an error still fires.
    event.target.value = ''
    if (picked) accept(picked)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    const [droppedFile] = event.dataTransfer.files || []
    if (droppedFile) accept(droppedFile)
  }

  const remove = () => {
    setRejected(null)
    onChange(null)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  const state = shownError ? 'invalid' : file ? 'filled' : dragging ? 'dragging' : 'empty'

  return (
    <div className="axr-upload axr-id-upload" data-state={state}>
      <div className="axr-upload-head">
        <label htmlFor={inputId}>{label}</label>
        <span aria-hidden="true">{file ? t.uploadAttached : t.uploadRequired}</span>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        className="axr-upload-input"
        type="file"
        accept={IDENTITY_CARD_TYPES.join(',')}
        tabIndex={file ? -1 : 0}
        aria-required="true"
        aria-invalid={Boolean(shownError)}
        aria-describedby={shownError ? errorId : hintId}
        onChange={handleInput}
      />

      {file ? (
        <div className="axr-upload-file axr-id-file">
          <span className="axr-id-file-icon" aria-hidden="true"><IdCard size={22} strokeWidth={1.6} /></span>
          <div className="axr-upload-info">
            <span className="axr-upload-status">{t.uploadedOk}</span>
            <strong title={file.name}>{file.name}</strong>
            <small>{describeCardFile(file, IDENTITY_CARD_POLICY)}</small>
            <div className="axr-upload-actions">
              <button type="button" onClick={() => inputRef.current?.click()}>{t.replace}</button>
              <button type="button" onClick={remove}>{t.remove}</button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="axr-upload-drop axr-id-drop"
          aria-hidden="true"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
          onDrop={handleDrop}
        >
          <span className="axr-upload-tag">{t.idUploadTag}</span>
          <span className="axr-upload-frame">
            <strong>{dragging ? t.dropRelease : t.idDropDefault}</strong>
            <span>{t.orSelectPrefix} <u>{t.orSelectLink}</u></span>
          </span>
          <small>{t.idSpec}</small>
        </div>
      )}

      <div className="af-field-meta">
        {shownError
          ? (
            <span id={errorId} className="af-error" role="alert">
              {rejected && <>{t.fileRejected({ name: rejected.name, details: rejected.details })} </>}
              {shownError}
            </span>
          )
          : <span id={hintId} className="af-hint">{dropped && !file ? t.idDroppedReload : t.idHint}</span>}
      </div>
    </div>
  )
}
