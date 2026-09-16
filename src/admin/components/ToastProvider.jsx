import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { ToastContext } from './toastContext'

const ICONS = { success: CheckCircle2, danger: TriangleAlert, info: Info }
const LIFETIME = 4200

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())
  const nextId = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((current) => current.map((item) => (item.id === id ? { ...item, leaving: true } : item)))
    const removal = window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
      timers.current.delete(`out-${id}`)
    }, 200)
    timers.current.set(`out-${id}`, removal)
  }, [])

  const push = useCallback((tone, title, message) => {
    nextId.current += 1
    const id = nextId.current
    setToasts((current) => [...current.slice(-2), { id, tone, title, message, leaving: false }])
    const timer = window.setTimeout(() => dismiss(id), LIFETIME)
    timers.current.set(id, timer)
  }, [dismiss])

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer))
      pending.clear()
    }
  }, [])

  const value = useMemo(() => ({
    success: (title, message) => push('success', title, message),
    error: (title, message) => push('danger', title, message),
    info: (title, message) => push('info', title, message),
  }), [push])

  return (
    <ToastContext value={value}>
      {children}
      <div className="ad-toasts" role="status" aria-live="polite">
        {toasts.map(({ id, tone, title, message, leaving }) => {
          const Icon = ICONS[tone] || Info
          return (
            <div key={id} className="ad-toast" data-tone={tone} data-leaving={leaving || undefined}>
              <Icon size={16} className="ad-toast-icon" aria-hidden="true" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>{title}</strong>
                {message && <p>{message}</p>}
              </div>
              <button type="button" onClick={() => dismiss(id)} aria-label="Fermer la notification">
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext>
  )
}
