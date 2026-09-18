import { useRef, useState } from 'react'
import { STUDENT_CARD_POLICY, canonicalCardMime } from '../../../../shared/aivex/contract-v4.js'
import { CARD_TYPES, checkCardFile, formatBytes } from './registrationModel'
import useObjectUrl from './useObjectUrl'

// "JPG · 1.2 MB" for an accepted type, the raw MIME type otherwise.
const describe = (file) => `${STUDENT_CARD_POLICY.types[canonicalCardMime(file.type)]?.label || file.type || '?'} · ${formatBytes(file.size)}`

export default function StudentCardUpload({ inputId, studentLabel, file, droppedCard, error, ownerName, onChange, t }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  // A picked file that failed the checks: shown, never kept in the form.
  const [rejected, setRejected] = useState(null)
  const preview = useObjectUrl(file)
  const shownError = rejected?.message || error
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`

  const accept = (candidate) => {
    const problem = checkCardFile(candidate, t)
    setRejected(problem ? { name: candidate.name, details: describe(candidate), message: problem } : null)
    if (!problem) onChange(candidate)
  }

  const handleInput = (event) => {
    const [picked] = event.target.files || []
    event.target.value = ''
    if (picked) accept(picked)
  }

  const handleDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    const [dropped] = event.dataTransfer.files || []
    if (dropped) accept(dropped)
  }

  const remove = () => {
    setRejected(null)
    onChange(null)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  const state = shownError ? 'invalid' : file ? 'filled' : dragging ? 'dragging' : 'empty'

  return (
    <div className="axr-upload" data-state={state}>
      <div className="axr-upload-head">
        <label htmlFor={inputId}>{studentLabel ? `${studentLabel} · ${t.uploadTitle}` : t.uploadTitle}</label>
        <span aria-hidden="true">{file ? t.uploadAttached : t.uploadRequired}</span>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        className="axr-upload-input"
        type="file"
        accept={CARD_TYPES.join(',')}
        tabIndex={file ? -1 : 0}
        aria-invalid={Boolean(shownError)}
        aria-describedby={shownError ? errorId : hintId}
        onChange={handleInput}
      />

      {file ? (
        <div className="axr-upload-file">
          <figure className="axr-upload-preview">
            {preview && <img src={preview} alt={t.cardAlt({ name: ownerName })} />}
          </figure>
          <div className="axr-upload-info">
            <span className="axr-upload-status">{t.uploadedOk}</span>
            <strong title={file.name}>{file.name}</strong>
            <small>{describe(file)}</small>
            <div className="axr-upload-actions">
              <button type="button" onClick={() => inputRef.current?.click()}>{t.replace}</button>
              <button type="button" onClick={remove}>{t.remove}</button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="axr-upload-drop"
          aria-hidden="true"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
          onDrop={handleDrop}
        >
          <span className="axr-upload-tag">{t.uploadTag}</span>
          <span className="axr-upload-frame">
            <strong>{dragging ? t.dropRelease : t.dropDefault}</strong>
            <span>{t.orSelectPrefix} <u>{t.orSelectLink}</u></span>
          </span>
          <small>{t.cardSpec}</small>
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
          : (
            <span id={hintId} className="af-hint">
              {droppedCard && !file
                ? t.droppedReload({ name: droppedCard })
                : t.uploadHint}
            </span>
          )}
      </div>
    </div>
  )
}
