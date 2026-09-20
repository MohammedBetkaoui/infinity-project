import { Check, TriangleAlert } from 'lucide-react'
import { progressFor } from './statusModel'

// Where the dossier stands: four stages, each done / in progress / upcoming /
// needing attention, derived from document_status alone (statusModel.js).
// Horizontal on wide screens, a vertical timeline on phones (CSS only).
export default function ProgressTracker({ documentStatus, t }) {
  return (
    <section className="axs-progress" aria-labelledby="axs-progress-title">
      <h2 id="axs-progress-title" className="axs-section-title">{t.progressTitle}</h2>
      <ol className="axs-steps">
        {progressFor(documentStatus).map(({ id, state }) => (
          <li key={id} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="axs-step-dot" aria-hidden="true">
              {state === 'done' && <Check size={15} strokeWidth={2.8} />}
              {state === 'attention' && <TriangleAlert size={14} strokeWidth={2.4} />}
            </span>
            <span className="axs-step-text">
              <strong>{t.steps[id]}</strong>
              <small>{t.stepState[state]}</small>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
