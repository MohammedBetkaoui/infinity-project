import { useCallback, useEffect, useRef, useState } from 'react'
import { ShieldCheck, TriangleAlert, WifiOff } from 'lucide-react'
import ScannerControls from './scanner/ScannerControls.jsx'
import ScannerHeader from './scanner/ScannerHeader.jsx'
import ScannerResult from './scanner/ScannerResult.jsx'
import ScannerStats from './scanner/ScannerStats.jsx'
import ScannerViewport from './scanner/ScannerViewport.jsx'
import RecentScans from './scanner/RecentScans.jsx'
import ManualCheckIn from './scanner/ManualCheckIn.jsx'
import './workshop.css'
import './workshopScanner.css'

const SESSION_KEY = 'infinity-workshop-scanner-session'
const NOT_OPEN_NOTE = 'The workshop has not started yet.'
const SAME_QR_COOLDOWN_MS = 3000
const NEXT_SCAN_DELAY_MS = 1000
const RESULT_OVERLAY_MS = 1200
const CONTEXT_REFRESH_MS = 5000
const DETECTION_INTERVAL_MS = 200
const RECENT_SCAN_LIMIT = 6
const SCAN_STATUSES = ['checked_in', 'already_checked_in', 'invalid', 'expired', 'wrong_workshop', 'not_open']

const RESULT_COPY = {
  checked_in: { title: 'Check-in successful', description: 'Participant admitted', tone: 'success' },
  already_checked_in: { title: 'Already checked in', description: 'This participant was previously admitted', tone: 'warning' },
  invalid: { title: 'Invalid pass', description: 'This is not a valid Infinity Club workshop pass', tone: 'error' },
  expired: { title: 'Pass expired', description: 'This workshop pass is no longer active', tone: 'error' },
  wrong_workshop: { title: 'Pass for another workshop', description: 'This pass belongs to a different workshop', tone: 'error' },
  not_open: { title: 'Check-in not open', description: NOT_OPEN_NOTE, tone: 'warning' },
  network_error: { title: 'Connection problem', description: 'Could not verify this pass. Please try again', tone: 'error' },
}

const CAMERA_ERRORS = {
  NotAllowedError: { state: 'permission_denied', title: 'Camera permission denied', detail: 'Allow camera access in your browser settings and try again.' },
  SecurityError: { state: 'permission_denied', title: 'Camera permission denied', detail: 'Camera access requires a secure browser connection.' },
  NotFoundError: { state: 'unavailable', title: 'No camera found', detail: 'No camera was found on this device.' },
  OverconstrainedError: { state: 'unavailable', title: 'Camera unavailable', detail: 'The requested camera is not available. Try another camera.' },
  NotReadableError: { state: 'error', title: 'Camera is busy', detail: 'The camera is already being used by another application.' },
}

const api = async (path, body) => {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

const formatTime = (value, withSeconds = true) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: false, timeZone: 'Africa/Algiers',
  }).format(date)
}

const playFeedbackSound = (audioContext, type) => {
  if (!audioContext) return
  const sequences = {
    success: [{ frequency: 740, offset: 0, duration: 0.11 }],
    warning: [{ frequency: 520, offset: 0, duration: 0.08 }, { frequency: 660, offset: 0.13, duration: 0.08 }],
    error: [{ frequency: 220, offset: 0, duration: 0.16 }],
  }
  const now = audioContext.currentTime
  for (const note of sequences[type] || sequences.error) {
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = note.frequency
    gain.gain.setValueAtTime(0.0001, now + note.offset)
    gain.gain.exponentialRampToValueAtTime(0.075, now + note.offset + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.offset + note.duration)
    oscillator.connect(gain).connect(audioContext.destination)
    oscillator.start(now + note.offset)
    oscillator.stop(now + note.offset + note.duration + 0.02)
  }
}

const vibrate = (tone) => {
  if (!navigator.vibrate) return
  navigator.vibrate(tone === 'success' ? 80 : tone === 'warning' ? [80, 50, 80] : 180)
}

export default function WorkshopScannerPage() {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const scanLock = useRef(false)
  const lastScan = useRef({ value: '', at: 0 })
  const checkInRef = useRef(() => {})
  const cleanup = useRef(() => {})
  const audioContextRef = useRef(null)
  const overlayTimerRef = useRef(0)
  const readyTimerRef = useRef(0)
  const unlockTimerRef = useRef(0)
  const mountedRef = useRef(true)

  const [state, setState] = useState({ status: 'loading', error: '', sessionToken: '', context: null })
  const [cameraState, setCameraState] = useState('idle')
  const [cameraMessage, setCameraMessage] = useState({ title: '', detail: '' })
  const [scanState, setScanState] = useState('ready')
  const [result, setResult] = useState(null)
  const [overlayResult, setOverlayResult] = useState(null)
  const [recentScans, setRecentScans] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchEnabled, setTorchEnabled] = useState(false)
  const [cameraDevices, setCameraDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [manualOpen, setManualOpen] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)

  const unlockAudio = useCallback(() => {
    if (!soundEnabled) return
    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return
    if (!audioContextRef.current) audioContextRef.current = new AudioContext()
    audioContextRef.current.resume?.().catch(() => {})
  }, [soundEnabled])

  const stopMedia = useCallback(() => {
    const activeStream = streamRef.current || videoRef.current?.srcObject
    cleanup.current()
    activeStream?.getTracks?.().forEach((track) => track.stop())
    cleanup.current = () => {}
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const loadContext = useCallback(async (sessionToken) => {
    const { response, payload } = await api('/api/workshops/scanner/context', { sessionToken })
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        sessionStorage.removeItem(SESSION_KEY)
        stopMedia()
        if (mountedRef.current) setState({ status: 'error', error: payload.message || 'Scanner session unavailable.', sessionToken: '', context: null })
      }
      throw new Error(payload.message || 'Scanner session unavailable.')
    }
    if (payload.context?.eventStatus !== 'ongoing' && streamRef.current) {
      stopMedia()
      setCameraState('idle')
      setTorchSupported(false)
      setTorchEnabled(false)
    }
    if (mountedRef.current) setState({ status: 'ready', error: '', sessionToken, context: payload.context })
    return payload.context
  }, [stopMedia])

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
          if (active) setState({ status: 'ready', error: '', sessionToken: payload.sessionToken, context: payload.context })
        } else if (resume) await loadContext(resume)
        else throw new Error('This scanner access is invalid or no longer active.')
      } catch (error) {
        sessionStorage.removeItem(SESSION_KEY)
        if (active) setState({ status: 'error', error: error.message, sessionToken: '', context: null })
      }
    }
    initialize()
    return () => { active = false }
  }, [loadContext])

  const sessionToken = state.sessionToken
  const checkInOpen = state.context?.eventStatus === 'ongoing'

  useEffect(() => {
    if (!sessionToken) return undefined
    const timer = window.setInterval(() => { loadContext(sessionToken).catch(() => {}) }, CONTEXT_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [loadContext, sessionToken])

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const showResult = useCallback((nextResult) => {
    const config = RESULT_COPY[nextResult.status] || RESULT_COPY.network_error
    const timestamp = Date.now()
    setResult(nextResult)
    setRecentScans((items) => [{
      id: globalThis.crypto?.randomUUID?.() || `${timestamp}-${Math.random()}`,
      status: nextResult.status,
      participantName: nextResult.participantName || '',
      checkedInAt: nextResult.checkedInAt || null,
      scannedAt: timestamp,
    }, ...items].slice(0, RECENT_SCAN_LIMIT))
    setOverlayResult({ title: config.title, tone: config.tone })
    setScanState(config.tone === 'success' ? 'success' : config.tone === 'warning' ? 'warning' : 'error')
    if (soundEnabled) playFeedbackSound(audioContextRef.current, config.tone)
    vibrate(config.tone)
    window.clearTimeout(overlayTimerRef.current)
    window.clearTimeout(readyTimerRef.current)
    overlayTimerRef.current = window.setTimeout(() => setOverlayResult(null), RESULT_OVERLAY_MS)
    readyTimerRef.current = window.setTimeout(() => setScanState('ready'), RESULT_OVERLAY_MS)
  }, [soundEnabled])

  const checkIn = useCallback(async (qrPayload) => {
    const value = String(qrPayload || '').trim()
    const now = Date.now()
    if (!value || scanLock.current || (lastScan.current.value === value && now - lastScan.current.at < SAME_QR_COOLDOWN_MS)) return
    if (!checkInOpen) { showResult({ status: 'not_open', message: NOT_OPEN_NOTE }); return }
    if (!online) {
      scanLock.current = true
      lastScan.current = { value, at: now }
      showResult({ status: 'network_error', message: 'QR verification is unavailable while offline.' })
      window.clearTimeout(unlockTimerRef.current)
      unlockTimerRef.current = window.setTimeout(() => { scanLock.current = false }, NEXT_SCAN_DELAY_MS)
      return
    }

    scanLock.current = true
    lastScan.current = { value, at: now }
    setScanState('validating')
    try {
      const { response, payload } = await api('/api/workshops/scanner/check-in', { sessionToken: sessionToken, qrPayload: value })
      if (!response.ok) {
        const status = SCAN_STATUSES.includes(payload.status) ? payload.status : response.status >= 500 ? 'network_error' : 'invalid'
        showResult({ status, message: status === 'not_open' ? NOT_OPEN_NOTE : (payload.message || RESULT_COPY[status].description) })
      } else showResult(payload.result)
    } catch {
      showResult({ status: 'network_error', message: 'Could not reach the verification service. Please try again.' })
    } finally {
      setScanState((current) => current === 'validating' ? 'cooldown' : current)
      window.clearTimeout(unlockTimerRef.current)
      unlockTimerRef.current = window.setTimeout(() => { scanLock.current = false }, NEXT_SCAN_DELAY_MS)
      loadContext(sessionToken).catch(() => {})
    }
  }, [checkInOpen, loadContext, online, sessionToken, showResult])

  useEffect(() => { checkInRef.current = checkIn }, [checkIn])

  const refreshStats = useCallback(async () => {
    setRefreshing(true)
    try { await loadContext(sessionToken) }
    catch { showResult({ status: 'network_error', message: 'Could not refresh live attendance.' }) }
    finally { if (mountedRef.current) setRefreshing(false) }
  }, [loadContext, sessionToken, showResult])

  const inspectCamera = useCallback(async (stream) => {
    streamRef.current = stream
    const track = stream.getVideoTracks()[0]
    const capabilities = track?.getCapabilities?.() || {}
    setTorchSupported(Boolean(capabilities.torch))
    setTorchEnabled(false)
    const devices = await navigator.mediaDevices.enumerateDevices?.().catch(() => []) || []
    const cameras = devices.filter((device) => device.kind === 'videoinput')
    setCameraDevices(cameras)
    const currentDeviceId = track?.getSettings?.().deviceId
    if (currentDeviceId) setSelectedDeviceId(currentDeviceId)
  }, [])

  const startCamera = useCallback(async (deviceId = '') => {
    if (!checkInOpen) { showResult({ status: 'not_open', message: NOT_OPEN_NOTE }); return }
    unlockAudio()
    stopMedia()
    setCameraState('starting')
    setCameraMessage({ title: '', detail: '' })
    setOverlayResult(null)
    setScanState('ready')
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('unavailable')
        setCameraMessage({ title: 'Camera unavailable', detail: 'Camera access is not supported by this browser.' })
        return
      }
      const videoConstraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }
      if ('BarcodeDetector' in window) {
        const supported = window.BarcodeDetector.getSupportedFormats
          ? await window.BarcodeDetector.getSupportedFormats().catch(() => [])
          : ['qr_code']
        if (supported.includes('qr_code')) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false })
          videoRef.current.srcObject = stream
          await videoRef.current.play()
          await inspectCamera(stream)
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
          let running = true
          let animationFrame = 0
          let lastFrame = 0
          const frame = async (time) => {
            if (!running) return
            if (time - lastFrame >= DETECTION_INTERVAL_MS && videoRef.current?.readyState >= 2) {
              lastFrame = time
              const codes = await detector.detect(videoRef.current).catch(() => [])
              if (codes[0]?.rawValue) checkInRef.current(codes[0].rawValue)
            }
            animationFrame = window.requestAnimationFrame(frame)
          }
          animationFrame = window.requestAnimationFrame(frame)
          cleanup.current = () => {
            running = false
            window.cancelAnimationFrame(animationFrame)
            stream.getTracks().forEach((track) => track.stop())
          }
          setCameraState('active')
          return
        }
      }
      const { BrowserQRCodeReader } = await import('@zxing/browser')
      const reader = new BrowserQRCodeReader()
      const controls = await reader.decodeFromConstraints({ video: videoConstraints, audio: false }, videoRef.current, (decoded) => {
        if (decoded?.getText()) checkInRef.current(decoded.getText())
      })
      const stream = videoRef.current?.srcObject
      if (stream) await inspectCamera(stream)
      cleanup.current = () => {
        controls.stop()
        reader.reset?.()
        stream?.getTracks().forEach((track) => track.stop())
      }
      setCameraState('active')
    } catch (error) {
      stopMedia()
      const mapped = CAMERA_ERRORS[error?.name] || { state: 'error', title: 'Camera unavailable', detail: 'Could not start the camera. Check browser permissions and try again.' }
      setCameraState(mapped.state)
      setCameraMessage(mapped)
    }
  }, [checkInOpen, inspectCamera, showResult, stopMedia, unlockAudio])

  const stopScanner = useCallback(() => {
    stopMedia()
    setCameraState('idle')
    setScanState('ready')
    setTorchSupported(false)
    setTorchEnabled(false)
    setOverlayResult(null)
  }, [stopMedia])

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks?.()[0]
    if (!track || !torchSupported) return
    const next = !torchEnabled
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] })
      setTorchEnabled(next)
    } catch {
      setTorchSupported(false)
      setTorchEnabled(false)
    }
  }, [torchEnabled, torchSupported])

  const switchCamera = useCallback(() => {
    if (cameraDevices.length < 2) return
    const currentIndex = cameraDevices.findIndex((device) => device.deviceId === selectedDeviceId)
    const next = cameraDevices[(currentIndex + 1 + cameraDevices.length) % cameraDevices.length]
    if (next?.deviceId) startCamera(next.deviceId)
  }, [cameraDevices, selectedDeviceId, startCamera])

  const toggleSound = useCallback(() => {
    if (!soundEnabled) {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (AudioContext && !audioContextRef.current) audioContextRef.current = new AudioContext()
      audioContextRef.current?.resume?.().catch(() => {})
    }
    setSoundEnabled(!soundEnabled)
  }, [soundEnabled])

  const submitManual = useCallback((value) => {
    unlockAudio()
    setManualOpen(false)
    checkIn(value)
  }, [checkIn, unlockAudio])

  useEffect(() => () => {
    mountedRef.current = false
    stopMedia()
    window.clearTimeout(overlayTimerRef.current)
    window.clearTimeout(readyTimerRef.current)
    window.clearTimeout(unlockTimerRef.current)
    audioContextRef.current?.close?.().catch(() => {})
  }, [stopMedia])

  if (state.status === 'loading') return <main className="workshop-scanner-page"><div className="workshop-private-state" role="status"><span className="workshop-loader" />Authorizing scanner…</div></main>
  if (state.status === 'error') return <main className="workshop-scanner-page"><div className="workshop-private-state is-error"><ShieldCheck /><h1>Scanner unavailable</h1><p>{state.error}</p></div></main>

  const context = state.context
  return (
    <main className="workshop-scanner-page">
      <div className="workshop-scanner-shell">
        <ScannerHeader eventTitle={context.eventTitle} location={context.location} organizerName={context.organizerName} />
        <ScannerStats context={context} refreshing={refreshing} onRefresh={refreshStats} />
        {!online && <section className="scanner-connectivity" role="alert"><WifiOff /><span><b>Offline</b> — QR verification unavailable</span></section>}
        {!checkInOpen && <section className="workshop-scanner-banner" role="status"><TriangleAlert /><div><h2>Check-in not open</h2><p>Check-in opens when the workshop is started. Current status: {context.eventStatus?.replaceAll('_', ' ') || 'scheduled'}.</p></div></section>}
        <div className="scanner-workspace">
          <div className="scanner-primary">
            <ScannerViewport videoRef={videoRef} cameraState={cameraState} cameraMessage={cameraMessage} checkInOpen={checkInOpen} scanState={scanState} overlayResult={overlayResult} onStart={() => startCamera()} />
            <ScannerResult result={result} config={RESULT_COPY[result?.status]} formatTime={formatTime} />
            <ScannerControls
              active={cameraState === 'active'} soundEnabled={soundEnabled} torchEnabled={torchEnabled}
              torchSupported={torchSupported} canSwitchCamera={cameraDevices.length > 1}
              onToggleSound={toggleSound} onToggleTorch={toggleTorch} onSwitchCamera={switchCamera}
              onStop={stopScanner} onManual={() => setManualOpen(true)}
            />
          </div>
          <RecentScans scans={recentScans} resultCopy={RESULT_COPY} formatTime={formatTime} />
        </div>
      </div>
      <ManualCheckIn open={manualOpen} validating={scanState === 'validating'} onClose={() => setManualOpen(false)} onSubmit={submitManual} />
    </main>
  )
}
