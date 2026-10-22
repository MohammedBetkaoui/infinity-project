import { Check, Clock3, TriangleAlert, X } from 'lucide-react'

const ICONS = { success: Check, warning: TriangleAlert, error: X }

export default function RecentScans({ scans, resultCopy, formatTime }) {
  return (
    <aside className="scanner-recent" aria-labelledby="recent-scans-title">
      <div className="scanner-recent__head">
        <div><p>Session activity</p><h2 id="recent-scans-title">Recent scans</h2></div>
        <span>{scans.length}/6</span>
      </div>
      {scans.length === 0 ? (
        <div className="scanner-recent__empty"><Clock3 aria-hidden="true" /><p>No scans yet.<br />The latest results will stay within reach.</p></div>
      ) : (
        <ol>
          {scans.map((scan) => {
            const config = resultCopy[scan.status] || resultCopy.network_error
            const Icon = ICONS[config.tone]
            return (
              <li key={scan.id} className={`is-${config.tone}`}>
                <span><Icon aria-hidden="true" /></span>
                <div><b>{scan.participantName || config.title}</b><small>{config.title}</small></div>
                <time dateTime={new Date(scan.scannedAt).toISOString()}>{formatTime(scan.scannedAt, false)}</time>
              </li>
            )
          })}
        </ol>
      )}
    </aside>
  )
}
