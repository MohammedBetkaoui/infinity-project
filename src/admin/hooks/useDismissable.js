import { useEffect, useRef } from 'react'

// Shared overlay behaviour for modals and side panels: Escape closes,
// body scroll is locked while open, focus moves into the surface and
// returns to the trigger on close, and Tab is kept inside.
export default function useDismissable(onClose) {
  const surfaceRef = useRef(null)

  useEffect(() => {
    const opener = document.activeElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const focusable = () => Array.from(
      surfaceRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [],
    )

    window.requestAnimationFrame(() => {
      const [first] = focusable()
      if (first) first.focus()
      else surfaceRef.current?.focus()
    })

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = overflow
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [onClose])

  return surfaceRef
}
