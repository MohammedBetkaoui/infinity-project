import { X } from 'lucide-react'
import useDismissable from '../hooks/useDismissable'

export default function SidePanel({ title, eyebrow, onClose, footer, children }) {
  const surfaceRef = useDismissable(onClose)

  return (
    <>
      <div className="ad-overlay" onClick={onClose} aria-hidden="true" />
      <aside ref={surfaceRef} className="ad-panel-side" role="dialog" aria-modal="true"
        aria-labelledby="ad-side-title" tabIndex={-1}>
        <header className="ad-panel-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            {eyebrow && <p className="ad-eyebrow">{eyebrow}</p>}
            <h2 id="ad-side-title">{title}</h2>
          </div>
          <button type="button" className="ad-icon-btn" onClick={onClose} aria-label="Fermer le panneau">
            <X size={16} />
          </button>
        </header>
        <div className="ad-panel-body">{children}</div>
        {footer && <footer className="ad-panel-foot">{footer}</footer>}
      </aside>
    </>
  )
}
