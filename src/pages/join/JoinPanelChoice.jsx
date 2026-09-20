import { CalendarDays, Check, Code2, Palette, UsersRound, Wrench } from 'lucide-react'

const panelIcons = { member: UsersRound, staff: Wrench, 'dev-tech': Code2, 'design-content': Palette, 'management-logistics': CalendarDays }

// Keep native radio semantics and keyboard behaviour for the visual choices.
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
          const Icon = panelIcons[option.value]
          return (
            <label className="join-panel" key={option.value} data-checked={checked ? '' : undefined}>
              <input type="radio" name={name} value={option.value} checked={checked} aria-invalid={Boolean(error)} onChange={() => onChange(name, option.value)} />
              <span className="join-panel-surface">
                <span className="join-panel-top">
                  <span className="join-panel-icon" aria-hidden="true">{Icon && <Icon size={21} strokeWidth={1.6} />}</span>
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
