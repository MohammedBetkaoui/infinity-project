// Vector trace of the supplied emblem: one continuous ribbon, shared by every club signature.
export default function InfinityMark({ className = '' }) {
  return (
    <svg className={`infinity-mark ${className}`} viewBox="14 75 432 236" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M143 76H211L179 121H162L83 195L144 255C156 267 170 267 183 253C197 239 201 220 201 198V174C201 119 238 76 293 76H317L446 195L324 310H234L269 264H305L375 195L300 122H292C266 122 247 146 247 174L246 219C244 274 207 310 151 310H138L14 195Z" />
    </svg>
  )
}
