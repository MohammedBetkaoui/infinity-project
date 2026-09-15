export default function ApplicationField({
  formId,
  name,
  label,
  value,
  onChange,
  error,
  hint,
  optional = false,
  as = 'input',
  options = [],
  maxLength,
  ...controlProps
}) {
  const id = `${formId}-${name}`
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const sharedProps = {
    id,
    name,
    value,
    maxLength,
    'aria-invalid': Boolean(error),
    'aria-describedby': describedBy,
    onChange: (event) => onChange(name, event.target.value),
    ...controlProps,
  }

  let control
  if (as === 'select') {
    control = (
      <select {...sharedProps}>
        {options.map(({ value: optionValue, label: optionLabel }) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    )
  } else if (as === 'textarea') {
    control = <textarea {...sharedProps} />
  } else {
    control = <input {...sharedProps} />
  }

  return (
    <div className="af-field" data-invalid={error ? '' : undefined}>
      <label htmlFor={id}>
        <span>{label}</span>
        {optional && <small>Optional</small>}
      </label>
      {control}
      <div className="af-field-meta">
        <span id={errorId} className="af-error" role={error ? 'alert' : undefined}>{error}</span>
        {hint && !error && <span id={hintId} className="af-hint">{hint}</span>}
        {maxLength && <span className="af-count" aria-hidden="true">{String(value).length}/{maxLength}</span>}
      </div>
    </div>
  )
}
