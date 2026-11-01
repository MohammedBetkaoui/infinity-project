import { Keyboard, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export default function ManualCheckIn({ open, validating, onClose, onSubmit }) {
  const [value, setValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    window.setTimeout(() => inputRef.current?.focus(), 0)
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setValue('')
        onClose()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])

  if (!open) return null

  const close = () => {
    setValue('')
    onClose()
  }

  const submit = (event) => {
    event.preventDefault()
    const normalized = value.trim()
    if (normalized) {
      setValue('')
      onSubmit(normalized)
    }
  }

  return (
    <div className="scanner-manual-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="scanner-manual" role="dialog" aria-modal="true" aria-labelledby="manual-title">
        <button type="button" className="scanner-manual__close" onClick={close} aria-label="Close manual verification"><X /></button>
        <Keyboard aria-hidden="true" />
        <span className="scanner-manual__eyebrow">Quick fallback</span>
        <h2 id="manual-title">Manual check-in</h2>
        <p>Paste or type the value printed with the participant's QR code.</p>
        <form onSubmit={submit}>
          <label htmlFor="manual-pass">QR / pass value</label>
          <input
            ref={inputRef}
            id="manual-pass"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            spellCheck="false"
            enterKeyHint="go"
            placeholder="Paste or enter code"
          />
          <div><button type="button" onClick={close}>Cancel</button><button type="submit" disabled={!value.trim() || validating}>{validating ? 'Verifying…' : 'Verify pass'}</button></div>
        </form>
      </section>
    </div>
  )
}
