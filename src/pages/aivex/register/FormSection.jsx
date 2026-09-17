import { useId } from 'react'

// A titled group of fields on the sheet: one legend, an optional note.
export default function FormSection({ index, title, note, children }) {
  const noteId = useId()
  return (
    <fieldset className="axr-form-section" aria-describedby={note ? noteId : undefined}>
      <legend><span aria-hidden="true">{index}</span>{title}</legend>
      {note && <p id={noteId} className="axr-form-section-note">{note}</p>}
      <div className="af-fields">{children}</div>
    </fieldset>
  )
}
