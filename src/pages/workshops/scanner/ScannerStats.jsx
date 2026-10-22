import { RefreshCw } from 'lucide-react'

export default function ScannerStats({ context, refreshing, onRefresh }) {
  const registered = Number(context.registered || 0)
  const present = Number(context.present || 0)
  const attendanceRate = registered > 0 ? Math.round((present / registered) * 100) : 0

  return (
    <section className="scanner-overview" aria-label="Check-in statistics">
      <div className="scanner-stats">
        <div><b>{registered}</b><span>Registered</span></div>
        <div className="is-present"><b>{present}</b><span>Present</span></div>
        <div><b>{context.remaining}</b><span>Remaining</span></div>
      </div>
      <div className="scanner-progress">
        <div className="scanner-progress__head">
          <span>Check-in progress</span>
          <b>{attendanceRate}%</b>
        </div>
        <div
          className="scanner-progress__track"
          role="progressbar"
          aria-label="Check-in progress"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={attendanceRate}
        >
          <span style={{ width: `${Math.min(100, attendanceRate)}%` }} />
        </div>
        <div className="scanner-progress__meta">
          <span><i aria-hidden="true" />Live · Updated just now</span>
          <span>{present} of {registered} admitted</span>
          <button type="button" onClick={onRefresh} disabled={refreshing} aria-label="Refresh statistics" title="Refresh statistics">
            <RefreshCw className={refreshing ? 'is-spinning' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}
