import { useEffect, useRef, useState } from 'react'
import { isApplicationDeliveryConfigured, submitApplication } from '../lib/applicationSubmission'

const pause = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration))

// Never display stack traces, SQL, Supabase internals, or secrets.
// submitApplication already sanitizes, this is a second line of defense
// for unexpected errors (network, browser, JSON...).
const toUserMessage = (error) => {
  if (error?.name === 'AbortError') return 'The request timed out. Please try again.'
  const raw = typeof error?.message === 'string' ? error.message.trim() : ''
  if (raw && !/(stack trace|supabase|sb_secret|service_role|postgres|password|secret|api[_-]?key|select\s+.*\s+from\s+|at\s+https?:|node_modules)/i.test(raw)) {
    return raw.slice(0, 300)
  }
  return 'We could not send the form. Your answers are still saved in this tab.'
}

const readDraft = (storageKey) => {
  try {
    const draft = window.sessionStorage.getItem(storageKey)
    return draft ? JSON.parse(draft) : null
  } catch {
    return null
  }
}

const containsAnswers = (values) => Object.entries(values || {}).some(([name, value]) => (
  !['website', 'consent'].includes(name) && String(value || '').trim().length > 0
))

export default function useApplicationForm({ kind, storageKey, initialValues, steps, validators }) {
  const [storedDraft] = useState(() => readDraft(storageKey))
  const [values, setValues] = useState(() => ({ ...initialValues, ...storedDraft?.values }))
  const [step, setStep] = useState(() => Math.min(storedDraft?.step || 0, steps.length - 1))
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)
  const submittingRef = useRef(false)
  const endpointConfigured = isApplicationDeliveryConfigured(kind)
  const hasDraft = containsAnswers(storedDraft?.values)

  useEffect(() => {
    if (status === 'success') return undefined
    if (!containsAnswers(values)) {
      window.sessionStorage.removeItem(storageKey)
      return undefined
    }
    const timer = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify({ values, step }))
      } catch {
        // A private browser can reject storage; the form still works without drafts.
      }
    }, 320)
    return () => window.clearTimeout(timer)
  }, [status, step, storageKey, values])

  const focusFirstError = (nextErrors) => {
    const firstName = Object.keys(nextErrors)[0]
    if (!firstName) return
    window.requestAnimationFrame(() => document.getElementsByName(firstName)[0]?.focus())
  }

  const validateFields = (fieldNames) => {
    const nextErrors = {}
    fieldNames.forEach((name) => {
      const message = validators[name]?.(values[name], values)
      if (message) nextErrors[name] = message
    })
    setErrors((current) => {
      const retained = { ...current }
      fieldNames.forEach((name) => delete retained[name])
      return { ...retained, ...nextErrors }
    })
    focusFirstError(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const setField = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => {
      if (!current[name]) return current
      const next = { ...current }
      delete next[name]
      return next
    })
    if (status === 'error' || status === 'draft') setStatus('idle')
  }

  const advance = () => {
    if (!validateFields(steps[step].fields)) return
    setStep((current) => Math.min(current + 1, steps.length - 1))
    window.requestAnimationFrame(() => document.querySelector('[data-form-step-heading]')?.focus())
  }

  const back = () => {
    setErrors({})
    setStep((current) => Math.max(0, current - 1))
  }

  const editStep = (nextStep) => {
    if (nextStep >= step) return
    setErrors({})
    setStep(nextStep)
  }

  const submit = async (event) => {
    event.preventDefault()
    if (step < steps.length - 1) {
      advance()
      return
    }

    const allFields = [...new Set(steps.flatMap(({ fields }) => fields))]
    if (!validateFields(allFields)) return
    if (status === 'submitting' || submittingRef.current) return

    submittingRef.current = true
    setStatus('submitting')
    setResult(null)
    try {
      const [submission] = await Promise.all([submitApplication(kind, values), pause(460)])
      setResult(submission)
      setStatus(submission.delivered ? 'success' : 'draft')
      // Only a real server-confirmed delivery clears the draft.
      if (submission.delivered) window.sessionStorage.removeItem(storageKey)
    } catch (error) {
      // Values and sessionStorage draft are intentionally preserved here.
      setResult({ message: toUserMessage(error) })
      setStatus('error')
    } finally {
      submittingRef.current = false
    }
  }

  const reset = () => {
    window.sessionStorage.removeItem(storageKey)
    setValues(initialValues)
    setErrors({})
    setStep(0)
    setStatus('idle')
    setResult(null)
  }

  return {
    values,
    step,
    errors,
    status,
    result,
    hasDraft,
    endpointConfigured,
    setField,
    advance,
    back,
    editStep,
    submit,
    reset,
  }
}
