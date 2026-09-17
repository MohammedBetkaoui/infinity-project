import { useRef, useState } from 'react'
import { CARD_SPEC, CARD_TYPES, checkCardFile, formatBytes } from './registrationModel'
import useObjectUrl from './useObjectUrl'

const EXTENSIONS = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP' }

export default function StudentCardUpload({ inputId, file, droppedCard, error, ownerName, onChange }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState('')
  const preview = useObjectUrl(file)
  const shownError = fileError || error
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`

  const accept = (candidate) => {
    const problem = checkCardFile(candidate)
    setFileError(problem)
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
    setFileError('')
    onChange(null)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  const state = shownError ? 'invalid' : file ? 'filled' : dragging ? 'dragging' : 'empty'

  return (
    <div className="axr-upload" data-state={state}>
      <div className="axr-upload-head">
        <label htmlFor={inputId}>Student card — Front side</label>
        <span aria-hidden="true">{file ? 'Attached' : 'Required'}</span>
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
            {preview && <img src={preview} alt={`Front of ${ownerName ? `${ownerName}’s` : 'the'} student card`} />}
          </figure>
          <div className="axr-upload-info">
            <span className="axr-upload-status">Uploaded ✓</span>
            <strong title={file.name}>{file.name}</strong>
            <small>{EXTENSIONS[file.type] || 'Image'} · {formatBytes(file.size)}</small>
            <div className="axr-upload-actions">
              <button type="button" onClick={() => inputRef.current?.click()}>Replace</button>
              <button type="button" onClick={remove}>Remove</button>
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
          <span className="axr-upload-tag">Student ID / Front</span>
          <span className="axr-upload-frame">
            <strong>{dragging ? 'Release to attach' : 'Drop student card here'}</strong>
            <span>or <u>select from device</u></span>
          </span>
          <small>{CARD_SPEC}</small>
        </div>
      )}

      <div className="af-field-meta">
        {shownError
          ? <span id={errorId} className="af-error" role="alert">{shownError}</span>
          : (
            <span id={hintId} className="af-hint">
              {droppedCard && !file
                ? `“${droppedCard}” was not kept after the page reloaded. Attach it again.`
                : 'A clear photo of the front side, with the name and registration number readable.'}
            </span>
          )}
      </div>
    </div>
  )
}
