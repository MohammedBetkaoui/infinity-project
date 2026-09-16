import { useRef } from 'react'
import AivexLogoMark from '../pages/aivex/AivexLogoMark'
import useAivexLogoHandoff from '../pages/aivex/useAivexLogoHandoff'
import './aivex-loader.css'

export default function AivexLoader({ ready, onComplete }) {
  const loaderRef = useRef(null)
  useAivexLogoHandoff(loaderRef, ready, onComplete)
  return (
    <div ref={loaderRef} className="aivex-loader" role="status" aria-live="polite" aria-label="Loading the AIVEX page">
      <div className="aivex-loader-backdrop" aria-hidden="true" />
      <div className="aivex-loader-content" aria-hidden="true">
        <div className="aivex-loader-mark"><AivexLogoMark /></div>
        <div className="aivex-loader-caption"><span>2nd edition</span><span>Loading...</span></div>
      </div>
    </div>
  )
}
