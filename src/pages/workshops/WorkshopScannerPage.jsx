import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CheckCircle2, RefreshCw, ShieldCheck, TriangleAlert, XCircle } from 'lucide-react'
import './workshop.css'

const SESSION_KEY = 'infinity-workshop-scanner-session'
const api = async (path, body) => {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

const RESULT_COPY = {
  checked_in: { title: 'Registration confirmed', tone: 'success', Icon: CheckCircle2 },
  already_checked_in: { title: 'Already checked in', tone: 'warning', Icon: TriangleAlert },
  invalid: { title: 'Invalid QR', tone: 'error', Icon: XCircle },
  expired: { title: 'Expired QR', tone: 'error', Icon: XCircle },
  wrong_workshop: { title: 'QR belongs to another workshop', tone: 'error', Icon: XCircle },
}

export default function WorkshopScannerPage() {
  const videoRef = useRef(null)
  const scanLock = useRef(false)
  const lastScan = useRef({ value: '', at: 0 })
  const cleanup = useRef(() => {})
  const [state, setState] = useState({ loading: true, error: '', sessionToken: '', context: null })
  const [cameraState, setCameraState] = useState('idle')
  const [result, setResult] = useState(null)

  const loadContext = useCallback(async (sessionToken) => {
    const { response, payload } = await api('/api/workshops/scanner/context', { sessionToken })
    if (!response.ok) throw new Error(payload.message || 'Scanner session unavailable.')
    setState({ loading: false, error: '', sessionToken, context: payload.context })
    return payload.context
  }, [])

  useEffect(() => {
    let active = true
    const params = new URLSearchParams(window.location.search)
    const privateToken = params.get('t') || ''
    if (privateToken) window.history.replaceState({}, '', '/workshops/scan')
    const resume = sessionStorage.getItem(SESSION_KEY) || ''
    const initialize = async () => {
      try {
        if (privateToken) {
          const { response, payload } = await api('/api/workshops/scanner/session', { token: privateToken })
          if (!response.ok) throw new Error(payload.message || 'This scanner access is invalid or no longer active.')
          sessionStorage.setItem(SESSION_KEY, payload.sessionToken)
          if (active) setState({ loading: false, error: '', sessionToken: payload.sessionToken, context: payload.context })
        } else if (resume) await loadContext(resume)
        else throw new Error('This scanner access is invalid or no longer active.')
      } catch (error) {
        sessionStorage.removeItem(SESSION_KEY)
        if (active) setState({ loading: false, error: error.message, sessionToken: '', context: null })
      }
    }
    initialize()
    return () => { active = false; cleanup.current() }
  }, [loadContext])

  const checkIn = useCallback(async (qrPayload) => {
    const now = Date.now()
    if (scanLock.current || (lastScan.current.value === qrPayload && now - lastScan.current.at < 3000)) return
    scanLock.current = true
    lastScan.current = { value: qrPayload, at: now }
    try {
      const { response, payload } = await api('/api/workshops/scanner/check-in', { sessionToken: state.sessionToken, qrPayload })
      if (!response.ok) throw new Error(payload.message || 'Unable to validate this QR.')
      setResult(payload.result)
      await loadContext(state.sessionToken)
    } catch (error) { setResult({ status: 'invalid', message: error.message }) }
    finally { window.setTimeout(() => { scanLock.current = false }, 1200) }
  }, [loadContext, state.sessionToken])

  const startCamera = useCallback(async () => {
    cleanup.current()
    setCameraState('starting')
    setResult(null)
    try {
      if ('BarcodeDetector' in window) {
        const supported = await window.BarcodeDetector.getSupportedFormats()
        if (supported.includes('qr_code')) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
          let running = true
          let lastFrame = 0
          const frame = async (time) => {
            if (!running) return
            if (time - lastFrame > 220 && videoRef.current?.readyState >= 2) {
              lastFrame = time
              const codes = await detector.detect(videoRef.current).catch(() => [])
              if (codes[0]?.rawValue) checkIn(codes[0].rawValue)
            }
            requestAnimationFrame(frame)
          }
          requestAnimationFrame(frame)
          cleanup.current = () => { running = false; stream.getTracks().forEach((track) => track.stop()) }
          setCameraState('active')
          return
        }
      }
      const { BrowserQRCodeReader } = await import('@zxing/browser')
      const reader = new BrowserQRCodeReader()
      const controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } }, audio: false }, videoRef.current, (decoded) => {
        if (decoded?.getText()) checkIn(decoded.getText())
      })
      cleanup.current = () => { controls.stop(); reader.reset() }
      setCameraState('active')
    } catch {
      setCameraState('error')
    }
  }, [checkIn])

  useEffect(() => () => cleanup.current(), [])

  if (state.loading) return <main className="workshop-scanner-page"><div className="workshop-private-state" role="status"><span className="workshop-loader"/>Authorizing scanner…</div></main>
  if (state.error) return <main className="workshop-scanner-page"><div className="workshop-private-state is-error"><ShieldCheck/><h1>Scanner unavailable</h1><p>{state.error}</p></div></main>
  const ResultIcon = RESULT_COPY[result?.status]?.Icon
  return <main className="workshop-scanner-page"><div className="workshop-scanner-shell">
    <header><div><p className="workshop-kicker">Infinity Club · Authorized scanner</p><h1>{state.context.eventTitle}</h1><p>{state.context.location}</p></div><div className="workshop-scanner-user"><ShieldCheck/><span><small>Authorized scanner</small><b>{state.context.organizerName}</b></span></div></header>
    <div className="workshop-scanner-stats"><div><b>{state.context.registered}</b><span>Registered</span></div><div><b>{state.context.present}</b><span>Present</span></div><div><b>{state.context.remaining}</b><span>Remaining</span></div></div>
    <section className="workshop-camera"><video ref={videoRef} muted playsInline/><div className="workshop-camera-frame" aria-hidden="true"/>{cameraState !== 'active' && <div className="workshop-camera-prompt"><Camera/><p>{cameraState === 'error' ? 'Camera unavailable. Check browser permission and try again.' : 'Use the rear camera to scan a participant pass.'}</p><button onClick={startCamera}>{cameraState === 'starting' ? 'Starting…' : cameraState === 'error' ? <><RefreshCw/> Try again</> : 'Start camera'}</button></div>}</section>
    {result && <section className={`workshop-scan-result is-${RESULT_COPY[result.status]?.tone || 'error'}`} aria-live="polite">{ResultIcon && <ResultIcon/>}<div><h2>{RESULT_COPY[result.status]?.title || 'Unable to check in'}</h2>{result.participantName && <p>{result.participantName}</p>}{result.checkedInAt && <small>{new Intl.DateTimeFormat('en-GB', { timeStyle: 'medium', timeZone: 'Africa/Algiers' }).format(new Date(result.checkedInAt))}</small>}{result.message && <small>{result.message}</small>}</div></section>}
  </div></main>
}

