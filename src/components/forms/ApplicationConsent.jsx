import { Check } from 'lucide-react'

export default function ApplicationConsent({ formId, name, checked, onChange, error, children }) {
  const id = `${formId}-${name}`
  const errorId = `${id}-error`

  return (
    <div className="af-consent-wrap" data-invalid={error ? '' : undefined}>
      <label className="af-consent" htmlFor={id}>
        <input id={id} name={name} type="checkbox" checked={checked}
          aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined}
          onChange={(event) => onChange(name, event.target.checked)} />
        <span className="af-consent-check" aria-hidden="true"><Check size={14} strokeWidth={2.2} /></span>
        <span>{children}</span>
      </label>
      {error && <p id={errorId} className="af-error" role="alert">{error}</p>}
    </div>
  )
}
