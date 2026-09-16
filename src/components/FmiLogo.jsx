// Institutional stamp of the Faculty of Mathematics and Computer Science.
// Official geometry (public/assets/mi-logo.svg) inlined — never an <img> —
// so colour is driven by CSS via currentColor. Reuses the validated lockup
// (divider dropped, widened viewBox so the final "S" is never clipped).
import MiFacultyMark from './MiFacultyMark'

export default function FmiLogo({ className = '', ...props }) {
  return <MiFacultyMark lockup className={`fmi-logo ${className}`} {...props} />
}
