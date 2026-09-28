import { useEffect, useRef } from 'react'

// Cloudflare Turnstile, rendered explicitly so the script only loads on the
// page that needs it. The token handed to `onToken` is short-lived and
// single-use: the parent keeps it in memory only (never in storage) and
// remounts this component (new `key`) to start a fresh check. The server's
// Siteverify call is the only real verification (api/_lib/turnstile.js).
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let scriptPromise = null
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile_unavailable')))
      script.onerror = () => {
        scriptPromise = null
        script.remove()
        reject(new Error('turnstile_unavailable'))
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

export default function TurnstileWidget({ siteKey, action, onToken, onError }) {
  const containerRef = useRef(null)
  const callbacks = useRef({ onToken, onError })

  useEffect(() => {
    callbacks.current = { onToken, onError }
  })

  useEffect(() => {
    let cancelled = false
    let widgetId = null
    const clearToken = () => callbacks.current.onToken('')

    loadTurnstile().then((turnstile) => {
      if (cancelled || !containerRef.current) return
      widgetId = turnstile.render(containerRef.current, {
        sitekey: siteKey,
        action,
        theme: 'light',
        size: 'flexible',
        callback: (token) => callbacks.current.onToken(token),
        'expired-callback': clearToken,
        'timeout-callback': clearToken,
        'error-callback': () => {
          clearToken()
          callbacks.current.onError?.()
        },
      })
    }).catch(() => {
      if (!cancelled) callbacks.current.onError?.()
    })

    return () => {
      cancelled = true
      if (widgetId !== null) window.turnstile?.remove(widgetId)
      clearToken()
    }
  }, [action, siteKey])

  return <div ref={containerRef} className="af-turnstile" />
}
