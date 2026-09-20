import { FileCheck, Hourglass, RefreshCw, TriangleAlert } from 'lucide-react'

// The informational panels for every status that cannot upload:
//   preparing  the form is not generated yet (Refresh — as before, no
//              download offered)
//   retry      generation failed (the download itself restarts it
//              server-side, exactly as before)
//   other      the file has moved beyond this page's actions (download only)
const VARIANTS = {
  preparing: { tone: 'pending', Icon: Hourglass, title: 'preparingTitle', text: 'documentPendingNote' },
  retry: { tone: 'issue', Icon: TriangleAlert, title: 'retryTitle', text: 'retryText' },
  other: { tone: 'neutral', Icon: FileCheck, title: 'officialFormTitle', text: 'documentReadyNote' },
}

export default function OfficialFormPanel({
  stage, download, downloading, downloadError, refresh, refreshing, refreshFailed, t,
}) {
  const { tone, Icon, title, text } = VARIANTS[stage] || VARIANTS.other
  return (
    <section className="axs-panel" data-tone={tone} aria-labelledby="axs-form-title">
      <div className="axs-panel-head">
        <span className="axs-panel-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.9} /></span>
        <h2 id="axs-form-title" className="axs-panel-title">{t[title]}</h2>
      </div>
      <p className="axs-panel-text">{t[text]}</p>

      <div className="axs-panel-actions">
        {stage === 'preparing' ? (
          <button type="button" className="af-button af-button-secondary" onClick={refresh} disabled={refreshing} aria-busy={refreshing}>
            <RefreshCw size={14} aria-hidden="true" data-spinning={refreshing ? '' : undefined} />
            {refreshing ? t.refreshing : t.refreshButton}
          </button>
        ) : (
          <button type="button" className={`af-button ${stage === 'retry' ? 'af-button-primary' : 'af-button-secondary'}`}
            onClick={download} disabled={downloading} aria-busy={downloading}>
            {downloading ? t.downloading : t.downloadButton}
          </button>
        )}
      </div>
      {stage === 'preparing' && refreshFailed && <p className="axs-inline-error" role="alert">{t.refreshFailed}</p>}
      {stage !== 'preparing' && downloadError && <p className="axs-inline-error" role="alert">{t.downloadError}</p>}
    </section>
  )
}
