import { useRef } from 'react'
import useHomeLogoHandoff from '../hooks/useHomeLogoHandoff'
import { INFINITY_CLUB_PATH, INFINITY_CLUB_VIEWBOX } from './InfinityClubMark'
import './home-loader.css'

// The emblem of public/infinity-favicon.svg (the same geometry as
// InfinityClubMark), drawn in the Hero's mint: the favicon's #094a36 would
// vanish on the dark green. While the page settles, a light runs along its
// contour; then the mark itself flies into its slot under the Hero actions
// and the backdrop dissolves around it (see useHomeLogoHandoff).
export default function HomeLoader({ ready, onComplete }) {
  const loaderRef = useRef(null)
  useHomeLogoHandoff(loaderRef, ready, onComplete)
  return (
    <div ref={loaderRef} className="home-loader" role="status" aria-live="polite">
      <span className="sr-only">Loading Infinity Club</span>
      <div className="home-loader-backdrop" aria-hidden="true" />
      <div className="home-loader-mark" aria-hidden="true">
        <svg className="home-loader-shape" viewBox={INFINITY_CLUB_VIEWBOX} focusable="false">
          <path d={INFINITY_CLUB_PATH} />
        </svg>
        <svg className="home-loader-signal" viewBox={INFINITY_CLUB_VIEWBOX} focusable="false">
          <path d={INFINITY_CLUB_PATH} pathLength="1" />
        </svg>
      </div>
    </div>
  )
}
