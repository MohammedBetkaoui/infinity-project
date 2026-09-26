import { CheckCircle2, Clock3, FileCheck2, RefreshCw, TriangleAlert, XCircle } from 'lucide-react'
import { dossierStateFor, toneFor } from './statusModel'

const STATUS_ICONS = {
  accepted: CheckCircle2,
  received: FileCheck2,
  changes_required: TriangleAlert,
  generation_issue: TriangleAlert,
  expired: TriangleAlert,
  rejected: XCircle,
  cancelled: XCircle,
}

export default function CurrentDossierStatus({ data, onRefresh, refreshing, refreshFailed, t }) {
  const status = dossierStateFor(data.registrationStatus, data.documentStatus)
  const copy = t.dossierStatus[status.key] || t.dossierStatus.unknown
  const StatusIcon = STATUS_ICONS[status.key] || Clock3

  return (
    <section className="axs-current" data-tone={status.tone} aria-labelledby="axs-current-title" aria-live="polite">
      <header className="axs-current__top">
        <span>{t.currentStatusTitle}</span>
        <small><i aria-hidden="true" />{t.currentStatusAuto}</small>
      </header>

      <div className="axs-current__summary">
        <span className="axs-current__icon" aria-hidden="true"><StatusIcon size={22} strokeWidth={2}/></span>
        <div>
          <h2 id="axs-current-title">{copy.title}</h2>
          <p>{copy.text}</p>
        </div>
      </div>

      <dl className="axs-current__details">
        <div>
          <dt>{t.fieldRegistrationStatus}</dt>
          <dd><span className="axs-current__dot" data-tone={data.registrationStatus === 'approved' ? 'success' : ['rejected', 'cancelled'].includes(data.registrationStatus) ? 'issue' : 'pending'} aria-hidden="true" />{t.registrationStatus[data.registrationStatus] || data.registrationStatus}</dd>
        </div>
        <div>
          <dt>{t.fieldDocumentStatus}</dt>
          <dd><span className="axs-current__dot" data-tone={toneFor(data.documentStatus)} aria-hidden="true" />{t.documentStatus[data.documentStatus] || data.documentStatus}</dd>
        </div>
      </dl>

      <div className="axs-current__footer">
        <p>{t.currentStatusHint}</p>
        <button type="button" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing}>
          <RefreshCw size={14} aria-hidden="true" data-spinning={refreshing ? '' : undefined}/>
          {refreshing ? t.refreshing : t.refreshStatus}
        </button>
      </div>
      {refreshFailed && <p className="axs-inline-error" role="alert">{t.refreshFailed}</p>}
    </section>
  )
}
