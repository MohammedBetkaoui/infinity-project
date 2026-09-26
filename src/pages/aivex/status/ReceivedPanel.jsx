import { useEffect, useRef } from 'react'
import { Check, CircleCheck } from 'lucide-react'
import SignedDocumentDropzone from './SignedDocumentDropzone'
import { formatReceivedAt } from './statusModel'

// A signed document is on file. RECEIVED only, never "validated" (section
// 16 of the Phase 5B brief): no organiser review exists yet, and nothing on
// this page implies one has happened.
//
// The old "print, sign, stamp" instructions are deliberately gone from this
// state — the candidate has already done that — and replacing the document
// is tucked into a collapsed section, since it is the exception.
export default function ReceivedPanel({
  signedDocument, lang, download, downloading, downloadError, upload, selectSignedDocument, clearSignedDocument, submitSignedDocument, t, note,
}) {
  const receivedOn = signedDocument?.uploadedAt ? formatReceivedAt(signedDocument.uploadedAt, lang) : ''

  // The upload button this panel replaces had focus a moment ago: hand it to
  // the confirmation, so a keyboard or screen-reader user lands on it rather
  // than on nothing. Only after an upload — never on a plain page load.
  const titleRef = useRef(null)
  useEffect(() => {
    if (upload.status === 'success') titleRef.current?.focus()
  }, [upload.status])

  return (
    <section className="axs-panel axs-received" data-tone="success" aria-labelledby="axs-received-title">
      <div className="axs-received-head">
        <span className="axs-received-mark" aria-hidden="true"><Check size={20} strokeWidth={2.6} /></span>
        <div>
          <h2 id="axs-received-title" className="axs-panel-title" ref={titleRef} tabIndex={-1}>{t.uploadReceivedTitle}</h2>
          {(signedDocument || receivedOn) && (
            <p className="axs-received-meta">
              {signedDocument && <span>{t.uploadReceivedVersion({ version: signedDocument.version })}</span>}
              {receivedOn && <span>{t.uploadReceivedOn({ date: receivedOn })}</span>}
            </p>
          )}
        </div>
      </div>

      {upload.status === 'success' && (
        <p className="axs-inline-success" role="status"><CircleCheck size={16} aria-hidden="true" />{t.uploadSuccessTitle}</p>
      )}
      <p className="axs-received-note">{note || t.uploadReceivedNote}</p>

      <div className="axs-received-actions">
        <button type="button" className="af-button af-button-secondary" onClick={download} disabled={downloading} aria-busy={downloading}>
          {downloading ? t.downloading : t.downloadButton}
        </button>
        {downloadError && <p className="axs-inline-error" role="alert">{t.downloadError}</p>}
      </div>

      {/* Keyed on the version so it collapses again after each new upload. */}
      <details className="axs-more" key={signedDocument?.version ?? 0}>
        <summary>{t.newVersionTitle}</summary>
        <p>{t.newVersionHint}</p>
        <SignedDocumentDropzone upload={upload} hasExisting showSuccess={false} selectSignedDocument={selectSignedDocument}
          clearSignedDocument={clearSignedDocument} submitSignedDocument={submitSignedDocument} t={t} />
      </details>
    </section>
  )
}
