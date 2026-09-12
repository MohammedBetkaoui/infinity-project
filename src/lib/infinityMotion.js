import gsap from 'gsap'

export const INFINITY_PATH = 'M290 240C239 170 197 118 140 118C51 118 42 243 103 288C172 339 235 309 290 240C345 171 408 141 477 192C538 237 529 362 440 362C383 362 341 310 290 240Z'
export const HERO_DRAW_SHARE = .62
export const heroTravel = (height) => Math.min(352, Math.round(height * .34))

const clamp = gsap.utils.clamp(0, 1)

export function createInfinityFollower(path, head, trails = []) {
  const length = path.getTotalLength()
  const setDash = gsap.quickSetter(path, 'strokeDashoffset')
  let previous = -1
  let direction = 1
  gsap.set(path, { strokeDasharray: length, strokeDashoffset: length })

  const place = (node, progress) => {
    const point = path.getPointAtLength(clamp(progress) * length)
    node.style.transform = `translate(${point.x}px, ${point.y}px)`
  }

  return {
    render(value) {
      if (!Number.isFinite(value)) return
      const progress = clamp(value)
      if (progress === previous) return
      if (previous >= 0 && Math.abs(progress - previous) > .00001) direction = Math.sign(progress - previous)
      setDash(length * (1 - progress))
      place(head, progress)
      // The wake stays on the ink, including when the reader scrolls back up.
      trails.forEach((trail, index) => {
        place(trail, progress - direction * (.009 + index * .012))
        trail.style.opacity = Math.min(1, progress / .035) * (index === 0 ? .76 : .38)
      })
      previous = progress
    },
    clear() {
      for (const node of [head, ...trails]) {
        node.style.removeProperty('transform')
        node.style.removeProperty('opacity')
      }
    },
  }
}
