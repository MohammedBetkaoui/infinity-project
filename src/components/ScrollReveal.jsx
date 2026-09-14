import { useRef } from 'react'
import useScrollAnimations from '../hooks/useScrollAnimations'

export default function ScrollReveal({ tag: Tag = 'div', mode = 'depth', children, className = '', color, start, end, ...props }) {
  const ref = useRef(null)
  useScrollAnimations(ref, ({ revealSection }) => {
    revealSection(ref, { mode, color, start, end })
  }, { rebuildKey: mode })
  return <Tag ref={ref} className={className} {...props}>{children}</Tag>
}
