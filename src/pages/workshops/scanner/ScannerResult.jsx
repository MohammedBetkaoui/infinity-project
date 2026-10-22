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
        <span className="scanner-result__idle"><CheckCircle2 aria-hidden="true" /></span>
        <div><small>Last scan</small><p>Results will appear here.</p></div>
      </section>
    )
  }

  const tone = config?.tone || 'error'
  const Icon = result.status === 'network_error' ? WifiOff : ICONS[tone]
  return (
    <section className={`scanner-result is-${tone}`} role={tone === 'error' ? 'alert' : 'status'} aria-live="assertive">
      <span className="scanner-result__icon"><Icon aria-hidden="true" /></span>
      <div className="scanner-result__copy">
        <small>Last scan</small>
        <h2>{config?.title || 'Unable to check in'}</h2>
        {result.participantName && <p>{result.participantName}</p>}
        <span>{config?.description}</span>
        {result.checkedInAt && <time dateTime={result.checkedInAt}>{formatTime(result.checkedInAt)}</time>}
        {result.message && result.message !== config?.description && <em>{result.message}</em>}
      </div>
    </section>
  )
}
