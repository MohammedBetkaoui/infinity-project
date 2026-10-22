import { Camera, Check, LoaderCircle, RefreshCw, TriangleAlert, X } from 'lucide-react'

const OVERLAY_ICON = {
  success: Check,
  warning: TriangleAlert,
  error: X,
}

export default function ScannerViewport({
  videoRef, cameraState, cameraMessage, checkInOpen, scanState, overlayResult, onStart,
}) {
  const active = cameraState === 'active'
  const OverlayIcon = overlayResult ? OVERLAY_ICON[overlayResult.tone] : null
  const isStarting = cameraState === 'starting'
  const canRetry = ['permission_denied', 'unavailable', 'error'].includes(cameraState)

  return (
    <section className={`scanner-viewport is-${cameraState} ${overlayResult ? `has-${overlayResult.tone}` : ''}`} aria-label="QR scanner camera">
      <video ref={videoRef} muted playsInline aria-label="Live camera preview" />
      <div className="scanner-viewport__shade" aria-hidden="true" />
      <div className="scanner-frame" aria-hidden="true">
        <i /><i /><i /><i />
        {active && <span className="scanner-frame__line" />}
      </div>

      {!active && (
        <div className="scanner-viewport__prompt">
          <span className="scanner-viewport__camera"><Camera aria-hidden="true" /></span>
          <div>
            <h2>{canRetry ? cameraMessage.title : 'Ready to scan'}</h2>
            <p>{canRetry ? cameraMessage.detail : checkInOpen
              ? 'Point the camera at a participant QR code.'
              : 'Check-in opens when the workshop has started.'}</p>
          </div>
          <button type="button" onClick={onStart} disabled={!checkInOpen || isStarting}>
            {isStarting ? <><LoaderCircle className="is-spinning" aria-hidden="true" />Starting…</>
              : canRetry ? <><RefreshCw aria-hidden="true" />Try again</>
                : <><Camera aria-hidden="true" />{checkInOpen ? 'Start scanner' : 'Waiting for start'}</>}
          </button>
        </div>
      )}

      {active && (
        <div className={`scanner-status-pill is-${scanState}`} role="status">
          {scanState === 'validating' ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <i aria-hidden="true" />}
          {scanState === 'validating' ? 'Verifying…' : 'Align QR inside frame'}
        </div>
      )}

      {overlayResult && OverlayIcon && (
        <div className={`scanner-result-overlay is-${overlayResult.tone}`} aria-hidden="true">
          <OverlayIcon />
          <b>{overlayResult.title}</b>
        </div>
      )}
    </section>
  )
}
