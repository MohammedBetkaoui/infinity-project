import { useRef } from 'react'
import useHomeLogoHandoff from '../hooks/useHomeLogoHandoff'
import { INFINITY_CLUB_PATH, INFINITY_CLUB_VIEWBOX } from './InfinityClubMark'
import './home-loader.css'

// The emblem's contour as a mask: the running light only shows along it.
const CONTOUR_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${INFINITY_CLUB_VIEWBOX}"><path d="${INFINITY_CLUB_PATH}" fill="none" stroke="#000" stroke-width="44" stroke-linejoin="round"/></svg>`,
)}")`

// The emblem of public/infinity-favicon.svg (the same geometry as
// InfinityClubMark), drawn in the Hero's mint: the favicon's #094a36 would
// vanish on the dark green. While the page settles, a light runs around its
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
        <div className="home-loader-glow">
          <div className="home-loader-signal" style={{ '--contour': CONTOUR_MASK }}>
            <span className="home-loader-sweep" />
          </div>
        </div>
      </div>
    </div>
  )
}
