import { CheckCircle2, TriangleAlert, WifiOff, XCircle } from 'lucide-react'

const ICONS = {
  success: CheckCircle2,
  warning: TriangleAlert,
  error: XCircle,
}

export default function ScannerResult({ result, config, formatTime }) {
  if (!result) {
    return (
      <section className="scanner-result is-empty" aria-live="polite">
        <header><small>Last check-in</small><span>Waiting</span></header>
        <div className="scanner-result__empty-state">
          <span className="scanner-result__idle"><CheckCircle2 aria-hidden="true" /></span>
          <div><h2>Ready for the first scan</h2><p>The participant name and status will appear here.</p></div>
        </div>
      </section>
    )
  }

  const tone = config?.tone || 'error'
  const Icon = result.status === 'network_error' ? WifiOff : ICONS[tone]
  return (
    <section className={`scanner-result is-${tone}`} role={tone === 'error' ? 'alert' : 'status'} aria-live="assertive">
      <header>
        <small>Last check-in</small>
        {result.checkedInAt && <time dateTime={result.checkedInAt}>{formatTime(result.checkedInAt)}</time>}
      </header>
      <div className="scanner-result__body">
        <span className="scanner-result__icon"><Icon aria-hidden="true" /></span>
        <div className="scanner-result__copy">
          <span className="scanner-result__status">{config?.title || 'Unable to check in'}</span>
          <h2>{result.participantName || config?.description}</h2>
          {result.participantName && result.universitySpeciality
            && <small className="scanner-result__speciality">{result.universitySpeciality}</small>}
          {result.participantName && <p>{config?.description}</p>}
          {result.message && result.message !== config?.description && <em>{result.message}</em>}
        </div>
      </div>
    </section>
  )
}
