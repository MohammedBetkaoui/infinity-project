import { useRef } from 'react'
import useScrollAnimations from '../hooks/useScrollAnimations'

const formatValue = (value, suffix) => `${Math.round(value).toLocaleString('en-GB')}${suffix}`

function CounterValue({ value, suffix = '', delay = 0 }) {
  const ref = useRef(null)
  useScrollAnimations(ref, ({ countUp }) => { countUp(ref, value, { suffix, delay }) }, { rebuildKey: `${value}:${suffix}:${delay}` })
  return <><span className="sr-only">{formatValue(value, suffix)}</span><span className="motion-counter" aria-hidden="true"><span className="motion-counter-reserve">{formatValue(value, suffix)}</span><span ref={ref} className="motion-counter-value">{formatValue(value, suffix)}</span></span></>
}

export default function CountUp(props) {
  return <CounterValue key={`${props.value}:${props.suffix}`} {...props} />
}
