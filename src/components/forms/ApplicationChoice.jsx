import { motion } from 'framer-motion'

export default function ApplicationChoice({ formId, name, legend, value, options, onChange, error }) {
  const errorId = `${formId}-${name}-error`

  return (
    <fieldset className="af-choice-group" aria-describedby={error ? errorId : undefined} data-invalid={error ? '' : undefined}>
      <legend>{legend}</legend>
      <div className="af-choice-grid">
        {options.map((option) => (
          <label className="af-choice" key={option.value}>
            <input type="radio" name={name} value={option.value} checked={value === option.value}
              onChange={() => onChange(name, option.value)} />
            <motion.span className="af-choice-surface" whileTap={{ scale: .985 }}>
              <strong>{option.label}</strong>
              {option.description && <small>{option.description}</small>}
            </motion.span>
          </label>
        ))}
      </div>
      {error && <p id={errorId} className="af-error" role="alert">{error}</p>}
    </fieldset>
  )
}
