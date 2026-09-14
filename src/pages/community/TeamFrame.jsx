import { motion, useTransform } from 'framer-motion'
import { Maximize2 } from 'lucide-react'
import { coverflowPose, TEAM_LAYOUT } from './teamMotion'

export default function TeamFrame({ member, index, initialIndex, active, near, x, step, compact, reduced, onActivate, layoutId }) {
  const pose = useTransform(() => coverflowPose(index + x.get() / step.get(), .5, compact))
  const rotateY = useTransform(pose, (value) => reduced ? 0 : value.rotateY)
  const scale = useTransform(pose, (value) => reduced ? 1 : value.scale)
  const z = useTransform(pose, (value) => reduced ? 0 : value.z)
  const y = useTransform(pose, (value) => reduced ? 0 : value.y)
  const shade = useTransform(pose, (value) => reduced ? 0 : value.shade)
  const opacity = useTransform(pose, (value) => value.opacity)
  const order = useTransform(pose, (value) => Math.round(100 + value.z))

  return (
    <motion.li className="team-frame-slot" data-active={active} data-near={near} style={{ zIndex: order }} aria-hidden={!near}>
      <div className="team-frame-scroll"><div className="team-frame-reveal">
        {/* Every frame reads the same drag position, so pivot, scale and shade stay in phase. */}
        <motion.div className="team-frame-depth" style={{ rotateY, scale, z, y, opacity }}>
          <motion.button
            type="button"
            className="team-frame-surface"
            tabIndex={active ? 0 : -1}
            aria-label={active ? `View ${member.name}'s portrait full size` : `Select ${member.name}'s portrait`}
            aria-haspopup={active ? 'dialog' : undefined}
            onClick={onActivate}
            initial="rest"
            whileHover={reduced ? undefined : 'hover'}
            whileFocus={reduced ? undefined : 'hover'}
          >
            <motion.img
              layoutId={reduced ? undefined : layoutId}
              transition={{ layout: TEAM_LAYOUT }}
              src={member.src}
              alt={member.alt}
              width={member.width}
              height={member.height}
              loading={Math.abs(index - initialIndex) <= 1 ? 'eager' : 'lazy'}
              decoding="async"
              draggable="false"
            />
            <motion.span className="team-frame-shade" style={{ opacity: shade }} aria-hidden="true" />
            <span className="team-frame-edge" aria-hidden="true" />
            <motion.span
              className="team-frame-view"
              aria-hidden="true"
              variants={{ rest: { scale: 1 }, hover: { scale: [1, 1.045, 1] } }}
              transition={{ duration: .34, ease: 'easeOut' }}
            >
              <Maximize2 size={14} strokeWidth={1.5} /> View portrait
            </motion.span>
          </motion.button>
        </motion.div>
      </div></div>
    </motion.li>
  )
}
