const EMBLEM_PATH = 'M143 76H211L179 121H162L83 195L144 255C156 267 170 267 183 253C197 239 201 220 201 198V174C201 119 238 76 293 76H317L446 195L324 310H234L269 264H305L375 195L300 122H292C266 122 247 146 247 174L246 219C244 274 207 310 151 310H138L14 195Z'

// The second contour is a moving highlight over the same official ribbon, not a redrawn logo.
export default function InfinityMark({ className = '' }) {
  return (
    <svg className={`infinity-mark ${className}`} viewBox="14 75 432 236" fill="currentColor" aria-hidden="true" focusable="false">
      <path className="infinity-mark-shape" d={EMBLEM_PATH} />
      <path className="infinity-mark-signal" pathLength="1" d={EMBLEM_PATH} />
    </svg>
  )
}
