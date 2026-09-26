import { TriangleAlert } from 'lucide-react'
import { formatCorrectionDeadline } from './statusModel'

// The real correction the organisers recorded for this team — not a generic
// "changes required" placeholder. `correctionRequest` comes straight from
// the admin dashboard's request_corrections action (aivex_correction_requests),
// via the Magic Link verify endpoint: the exact items checked, the deadline,
// and the message sent to the team.
export default function CorrectionRequestPanel({ correctionRequest, lang, t }) {
  const items = Array.isArray(correctionRequest?.items) ? correctionRequest.items : []
  const deadline = correctionRequest?.deadline ? formatCorrectionDeadline(correctionRequest.deadline, lang) : ''

  return (
    <section className="axs-panel axs-correction" data-tone="issue" aria-labelledby="axs-correction-title">
      <div className="axs-panel-head">
        <span className="axs-panel-icon" aria-hidden="true"><TriangleAlert size={18} strokeWidth={2}/></span>
        <h2 id="axs-correction-title" className="axs-panel-title">{t.correctionsTitle}</h2>
      </div>

      {items.length > 0 && (
        <ul className="axs-correction-list">
          {items.map((item) => <li key={item}>{t.correctionItemLabels[item] || item}</li>)}
        </ul>
      )}

      {deadline && <p className="axs-correction-deadline">{t.correctionsDeadline({ date: deadline })}</p>}
      {correctionRequest?.message && <p className="axs-panel-text">{correctionRequest.message}</p>}
    </section>
  )
}
