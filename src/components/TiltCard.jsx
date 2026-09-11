import { useRef } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'
import useMotionPreference from '../hooks/useMotionPreference'

const spring = { stiffness: 160, damping: 25, mass: .6 }

export default function TiltCard({ className = '', children, ...props }) {
  const bounds = useRef(null)
  const reduced = useMotionPreference()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useSpring(x, spring)
  const rotateY = useSpring(y, spring)
  const reset = () => { x.set(0); y.set(0); bounds.current = null }

  return (
    <motion.article className={`tilt-card ${className}`} {...props}
      style={reduced ? { rotateX: 0, rotateY: 0, transformPerspective: 0 } : { rotateX, rotateY, transformPerspective: 1100 }}
      onPointerEnter={(event) => {
        if (!reduced && event.pointerType === 'mouse') bounds.current = event.currentTarget.getBoundingClientRect()
      }}
      onPointerMove={(event) => {
        if (reduced || event.pointerType !== 'mouse' || !bounds.current) return
        const rect = bounds.current
        x.set(Math.max(-1.5, Math.min(1.5, (event.clientY - rect.top - rect.height / 2) / rect.height * -3)))
        y.set(Math.max(-1.5, Math.min(1.5, (event.clientX - rect.left - rect.width / 2) / rect.width * 3)))
      }}
      onPointerLeave={reset} onPointerCancel={reset} onWheel={reset}>
      {children}
    </motion.article>
  )
}
