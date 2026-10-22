import { Camera, Flashlight, FlashlightOff, Keyboard, RotateCcw, Square, Volume2, VolumeX } from 'lucide-react'

export default function ScannerControls({
  active, soundEnabled, torchEnabled, torchSupported, canSwitchCamera,
  onToggleSound, onToggleTorch, onSwitchCamera, onStop, onManual,
}) {
  return (
    <div className={`scanner-controls ${active ? 'is-active' : ''}`} aria-label="Scanner controls">
      {active && torchSupported && (
        <button type="button" onClick={onToggleTorch} aria-pressed={torchEnabled}>
          {torchEnabled ? <FlashlightOff aria-hidden="true" /> : <Flashlight aria-hidden="true" />}
          <span>{torchEnabled ? 'Flash off' : 'Flash'}</span>
        </button>
      )}
      <button type="button" onClick={onToggleSound} aria-pressed={soundEnabled}>
        {soundEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
        <span>{soundEnabled ? 'Sound on' : 'Sound off'}</span>
      </button>
      {active && canSwitchCamera && (
        <button type="button" onClick={onSwitchCamera}>
          <RotateCcw aria-hidden="true" /><span>Switch</span>
        </button>
      )}
      {active && (
        <button type="button" onClick={onStop} className="is-stop">
          <Square aria-hidden="true" /><span>Stop</span>
        </button>
      )}
      {!active && (
        <button type="button" onClick={onManual} className="is-manual">
          <Keyboard aria-hidden="true" /><span>Enter code manually</span>
        </button>
      )}
      {!active && <Camera className="scanner-controls__spacer" aria-hidden="true" />}
    </div>
  )
}
