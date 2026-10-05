import { useRef } from 'react'
import { useCountUp } from './adminMotion'

// The final value is what assistive technology reads; the counting digits are decorative.
export default function AnimatedNumber({ value, suffix = '', className }) {
  const ref = useRef(null)
  useCountUp(ref, value, suffix)
  return <><span className="sr-only">{value}{suffix}</span><span ref={ref} className={className} aria-hidden="true">{value}{suffix}</span></>
}
