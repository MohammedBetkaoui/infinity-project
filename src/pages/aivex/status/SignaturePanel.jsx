import SignedDocumentDropzone from './SignedDocumentDropzone'

// The one thing to do while the official form is waiting for a signature:
// get it, sign it, send it back — as three numbered gestures in one panel,
// instead of three unrelated boxes. The numbers here are the candidate's
// to-do list; the dossier's own stages are the tracker above it.
export default function SignaturePanel({
  download, downloading, downloadError, upload, selectSignedDocument, clearSignedDocument, submitSignedDocument, t,
}) {
  return (
    <section className="axs-panel" data-tone="action" aria-labelledby="axs-next-title">
      <h2 id="axs-next-title" className="axs-panel-title">{t.nextStepTitle}</h2>
      <ol className="axs-todo">
        <li>
          <span className="axs-todo-index" aria-hidden="true">1</span>
          <div className="axs-todo-body">
            <h3>{t.stepDownloadTitle}</h3>
            <p>{t.documentReadyNote}</p>
            <button type="button" className="af-button af-button-primary" onClick={download} disabled={downloading} aria-busy={downloading}>
              {downloading ? t.downloading : t.downloadButton}
            </button>
            {downloadError && <p className="axs-inline-error" role="alert">{t.downloadError}</p>}
          </div>
        </li>
        <li>
          <span className="axs-todo-index" aria-hidden="true">2</span>
          <div className="axs-todo-body">
            <h3>{t.stepSignTitle}</h3>
            <p>{t.stepSignText}</p>
          </div>
        </li>
        <li>
          <span className="axs-todo-index" aria-hidden="true">3</span>
          <div className="axs-todo-body">
            <h3>{t.uploadSectionTitle}</h3>
            <p>{t.uploadInstructions}</p>
            <SignedDocumentDropzone upload={upload} hasExisting={false} selectSignedDocument={selectSignedDocument}
              clearSignedDocument={clearSignedDocument} submitSignedDocument={submitSignedDocument} t={t} />
          </div>
        </li>
      </ol>
    </section>
  )
}
