import { useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { Maximize2 } from 'lucide-react'

const clamp = (value) => Math.max(-1, Math.min(1, value))
const tiltSpring = { stiffness: 185, damping: 24, mass: .65 }

export default function CommunityPortrait({ portrait, index, active, onSelect, onOpen, scrollX, step, origin, reduced }) {
  const bounds = useRef(null)
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const tiltX = useSpring(pointerX, tiltSpring)
  const tiltY = useSpring(pointerY, tiltSpring)
  const distance = useTransform(() => clamp((origin.get() + index * step.get() - scrollX.get()) / step.get()))
  const rotateY = useTransform(distance, [-1, 0, 1], [17, 0, -17])
  const z = useTransform(distance, [-1, 0, 1], [-62, 0, -62])
  const y = useTransform(distance, [-1, 0, 1], [16, 0, 16])
  const shade = useTransform(distance, [-1, 0, 1], [.3, 0, .3])

  const resetTilt = () => { bounds.current = null; pointerX.set(0); pointerY.set(0) }
  const move = (event) => {
    if (!active || !bounds.current || reduced) return
    const { left, top, width, height } = bounds.current
    pointerX.set(-clamp((event.clientY - top) / height * 2 - 1) * 2.2)
    pointerY.set(clamp((event.clientX - left) / width * 2 - 1) * 2.8)
  }

  return (
    <li className="community-portrait" data-active={active}>
      <motion.div className="community-portrait-depth" style={reduced ? undefined : { rotateY, z, y }}>
        <motion.button
          type="button"
          className="community-portrait-surface"
          tabIndex={active ? 0 : -1}
          aria-label={active ? `View ${portrait.name}'s portrait full size` : `Select ${portrait.name}'s portrait`}
          aria-haspopup={active ? 'dialog' : undefined}
          onClick={active ? onOpen : onSelect}
          onPointerEnter={(event) => {
            if (reduced || event.pointerType !== 'mouse' || !active) return
            bounds.current = event.currentTarget.parentElement.getBoundingClientRect()
          }}
          onPointerMove={move}
          onPointerLeave={resetTilt}
          onPointerCancel={resetTilt}
          onBlur={resetTilt}
          style={reduced ? undefined : { rotateX: active ? tiltX : 0, rotateY: active ? tiltY : 0 }}
        >
          <img src={portrait.src} alt={portrait.alt} width={portrait.width} height={portrait.height} loading={index <= 1 ? 'eager' : 'lazy'} decoding="async" draggable="false" />
          <motion.span className="community-portrait-shade" aria-hidden="true" style={{ opacity: reduced ? 0 : shade }} />
          <span className="community-portrait-expand" aria-hidden="true"><Maximize2 size={15} /> View portrait</span>
        </motion.button>
      </motion.div>
    </li>
  )
}
