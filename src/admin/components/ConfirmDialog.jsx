import { TriangleAlert } from 'lucide-react'
import useDismissable from '../hooks/useDismissable'

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'danger',
  icon: Icon = TriangleAlert,
  busy = false,
  onConfirm,
  onClose,
}) {
  const surfaceRef = useDismissable(onClose)

  return (
    <>
      <div className="ad-overlay" onClick={onClose} aria-hidden="true" />
      <div ref={surfaceRef} className="ad-modal" role="alertdialog" aria-modal="true"
        aria-labelledby="ad-confirm-title" aria-describedby="ad-confirm-text" tabIndex={-1}>
        <div className="ad-modal-icon" data-tone={tone} aria-hidden="true"><Icon size={19} strokeWidth={1.7} /></div>
        <h2 id="ad-confirm-title">{title}</h2>
        <p id="ad-confirm-text">{message}</p>
        <div className="ad-modal-actions">
          <button type="button" className="ad-btn" onClick={onClose}>{cancelLabel}</button>
          <button type="button" className="ad-btn" data-variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm} disabled={busy}>
            {busy ? 'En cours...' : confirmLabel}
          </button>
        </div>
      </div>
    </>
  )
}
