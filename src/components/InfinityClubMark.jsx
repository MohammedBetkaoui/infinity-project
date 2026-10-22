// React surface for the true Infinity Club emblem; the geometry lives in
// infinity-club-geometry.js (the same path as public/infinity-favicon.svg) so
// Node tests and the workshop badge canvas share it. Colour is never baked in:
// the shape uses currentColor so callers control it via CSS.
import { INFINITY_CLUB_PATH, INFINITY_CLUB_VIEWBOX } from './infinity-club-geometry.js'

export { INFINITY_CLUB_PATH, INFINITY_CLUB_VIEWBOX }

export default function InfinityClubMark({ className = '', title = 'Infinity Club' }) {
  return (
    <svg
      className={`infinity-club-mark ${className}`}
      viewBox={INFINITY_CLUB_VIEWBOX}
      fill="currentColor"
      role="img"
      aria-label={title}
      focusable="false"
    >
      <path d={INFINITY_CLUB_PATH} />
    </svg>
  )
}
