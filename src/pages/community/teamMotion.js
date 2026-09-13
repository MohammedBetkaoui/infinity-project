export const TEAM_SPRING = { type: 'spring', stiffness: 228, damping: 30, mass: .82, restDelta: .2, restSpeed: 8 }
export const TEAM_LAYOUT = { duration: .52, ease: [.22, .78, .14, 1] }

export const clampIndex = (index, count) => Math.max(0, Math.min(count - 1, Math.round(index)))

export function snapPortrait(x, velocity, step, count) {
  if (step <= 0 || count <= 1) return 0
  // A short projection carries a flick forward, while keeping the next portrait in reach.
  const travel = Math.max(-step * 1.6, Math.min(step * 1.6, velocity * .17))
  return clampIndex(-(x + travel) / step, count)
}

export function coverflowPose(distance, progress, compact = false) {
  const depth = Math.min(1, Math.abs(distance))
  const direction = Math.sign(distance)
  return {
    rotateY: -direction * depth * (compact ? 19 : 31),
    scale: 1 - depth * (compact ? .13 : .17),
    z: -depth * (compact ? 28 : 72),
    y: depth * ((compact ? 9 : 17) + (progress - .5) * direction * (compact ? 8 : 26)),
    shade: depth * .44,
    opacity: Math.max(0, Math.min(1, 3.1 - Math.abs(distance))),
  }
}
