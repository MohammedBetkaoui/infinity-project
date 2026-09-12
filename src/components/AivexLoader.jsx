import { useRef } from 'react'
import AivexWordmark from '../pages/aivex/AivexWordmark'
import useAivexLogoHandoff from '../pages/aivex/useAivexLogoHandoff'
import './aivex-loader.css'

export default function AivexLoader({ ready, onComplete }) {
  const loaderRef = useRef(null)
  useAivexLogoHandoff(loaderRef, ready, onComplete)
  return (
    <div ref={loaderRef} className="aivex-loader" role="status" aria-live="polite" aria-label="Chargement de la page AIVEX">
      <div className="aivex-loader-backdrop" aria-hidden="true" />
      <div className="aivex-loader-content" aria-hidden="true">
        <div className="aivex-loader-mark"><AivexWordmark /></div>
        <div className="aivex-loader-caption"><span>2e édition</span><span>Chargement…</span></div>
      </div>
    </div>
  )
}
