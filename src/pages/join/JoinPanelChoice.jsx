import { Check } from 'lucide-react'

// A radio group presented as numbered dossier panels: same native radio
// semantics and keyboard behaviour as ApplicationChoice, more room to explain.
export default function JoinPanelChoice({ formId, name, legend, legendHidden = false, description, options, value, onChange, error, variant }) {
  const errorId = `${formId}-${name}-error`
  const descriptionId = description ? `${formId}-${name}-description` : undefined
  const describedBy = [descriptionId, error ? errorId : null].filter(Boolean).join(' ') || undefined

  return (
    <fieldset className={`af-choice-group join-panels join-panels-${variant}`} aria-describedby={describedBy} data-invalid={error ? '' : undefined}>
      <legend className={legendHidden ? 'sr-only' : 'join-panels-legend'}>{legend}</legend>
      {description && <p id={descriptionId} className="join-panels-description">{description}</p>}
      <div className="join-panels-grid">
        {options.map((option) => {
          const checked = value === option.value
          return (
            <label className="join-panel" key={option.value} data-checked={checked ? '' : undefined}>
              <input type="radio" name={name} value={option.value} checked={checked} onChange={() => onChange(name, option.value)} />
              <span className="join-panel-surface">
                <span className="join-panel-top">
                  <span className="join-panel-index">
                    {option.index}{option.eyebrow && <> / <span>{option.eyebrow}</span></>}
                  </span>
                  <span className="join-panel-check" aria-hidden="true"><Check size={12} strokeWidth={2.4} /></span>
                </span>
                <strong>{option.label}</strong>
                <span className="join-panel-text">{option.description}</span>
                <small className="join-panel-meta">{option.meta}</small>
              </span>
            </label>
          )
        })}
      </div>
      {error && <p id={errorId} className="af-error" role="alert">{error}</p>}
    </fieldset>
  )
}
