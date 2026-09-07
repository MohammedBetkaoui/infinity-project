import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { GSAP_EASE, shouldReduceMotion } from '../lib/motion'

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum)

export default function CustomCursor() {
  const dotRef = useRef(null)
  const ringRef = useRef(null)

  useEffect(() => {
    if (shouldReduceMotion()) return undefined

    const handleRipple = (event) => {
      if (!(event.target instanceof Element)) return
      const target = event.target.closest('[data-ripple]')
      if (!target) return

      const bounds = target.getBoundingClientRect()
      const diameter = Math.max(bounds.width, bounds.height) * 1.45
      const ripple = document.createElement('span')
      ripple.className = 'interaction-ripple'
      ripple.style.width = `${diameter}px`
      ripple.style.height = `${diameter}px`
      ripple.style.left = `${event.clientX - bounds.left - diameter / 2}px`
      ripple.style.top = `${event.clientY - bounds.top - diameter / 2}px`
      target.appendChild(ripple)
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true })
    }

    document.addEventListener('pointerdown', handleRipple)

    const finePointer = window.matchMedia('(pointer: fine) and (min-width: 768px)')
    if (!finePointer.matches) {
      return () => document.removeEventListener('pointerdown', handleRipple)
    }

    const dot = dotRef.current
    const ring = ringRef.current
    const dotX = gsap.quickTo(dot, 'x', { duration: 0.12, ease: 'power3' })
    const dotY = gsap.quickTo(dot, 'y', { duration: 0.12, ease: 'power3' })
    const ringX = gsap.quickTo(ring, 'x', { duration: 0.38, ease: 'power3' })
    const ringY = gsap.quickTo(ring, 'y', { duration: 0.38, ease: 'power3' })
    let pointer = { x: -100, y: -100 }
    let frameId
    let activeMagnet

    const resetMagnet = (target) => {
      if (!target) return
      gsap.to(target, {
        x: 0,
        y: 0,
        duration: 0.65,
        ease: GSAP_EASE.smooth,
        overwrite: 'auto',
        onComplete: () => gsap.set(target, { clearProps: 'transform' }),
      })
    }

    const findClosestMagnet = () => {
      let closest
      let closestDistance = Infinity

      document.querySelectorAll('[data-magnetic]').forEach((target) => {
        const bounds = target.getBoundingClientRect()
        if (!bounds.width || !bounds.height) return
        const centerX = bounds.left + bounds.width / 2
        const centerY = bounds.top + bounds.height / 2
        const distance = Math.hypot(pointer.x - centerX, pointer.y - centerY)
        const radius = Number(target.dataset.magneticRadius || 95)

        if (distance < radius && distance < closestDistance) {
          closest = { target, bounds, centerX, centerY, distance, radius }
          closestDistance = distance
        }
      })

      return closest
    }

    const render = () => {
      frameId = undefined
      const magnet = findClosestMagnet()
      let cursorX = pointer.x
      let cursorY = pointer.y

      if (magnet) {
        if (activeMagnet && activeMagnet !== magnet.target) resetMagnet(activeMagnet)
        activeMagnet = magnet.target

        const strength = (1 - magnet.distance / magnet.radius) ** 1.6
        const offsetX = pointer.x - magnet.centerX
        const offsetY = pointer.y - magnet.centerY
        const targetX = clamp(offsetX * 0.12 * strength, -8, 8)
        const targetY = clamp(offsetY * 0.12 * strength, -8, 8)
        cursorX += (magnet.centerX - pointer.x) * strength * 0.34
        cursorY += (magnet.centerY - pointer.y) * strength * 0.34

        gsap.to(magnet.target, {
          x: targetX,
          y: targetY,
          duration: 0.32,
          ease: GSAP_EASE.smooth,
          overwrite: 'auto',
        })
      } else if (activeMagnet) {
        resetMagnet(activeMagnet)
        activeMagnet = undefined
      }

      const hovered = document.elementFromPoint(pointer.x, pointer.y)?.closest('a, button, summary, [data-cursor]')
      dotX(cursorX)
      dotY(cursorY)
      ringX(cursorX)
      ringY(cursorY)
      gsap.to(ring, {
        scale: magnet ? 1.9 : hovered ? 1.55 : 1,
        opacity: magnet ? 0.9 : hovered ? 0.72 : 0.45,
        duration: 0.25,
        overwrite: 'auto',
      })
    }

    const scheduleRender = () => {
      if (!frameId) frameId = requestAnimationFrame(render)
    }
    const handlePointerMove = (event) => {
      pointer = { x: event.clientX, y: event.clientY }
      gsap.set([dot, ring], { autoAlpha: 1 })
      scheduleRender()
    }
    const handlePointerLeave = () => {
      gsap.to([dot, ring], { autoAlpha: 0, duration: 0.2 })
      resetMagnet(activeMagnet)
      activeMagnet = undefined
    }
    const handleScroll = () => {
      resetMagnet(activeMagnet)
      activeMagnet = undefined
    }

    gsap.set([dot, ring], { autoAlpha: 0 })
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('scroll', handleScroll, { passive: true })
    document.documentElement.addEventListener('mouseleave', handlePointerLeave)

    return () => {
      if (frameId) cancelAnimationFrame(frameId)
      document.removeEventListener('pointerdown', handleRipple)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('scroll', handleScroll)
      document.documentElement.removeEventListener('mouseleave', handlePointerLeave)
      resetMagnet(activeMagnet)
      gsap.killTweensOf([dot, ring])
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] hidden md:block" aria-hidden="true">
      <span ref={ringRef} className="cursor-ring absolute left-0 top-0 size-9 rounded-full border border-primary" />
      <span ref={dotRef} className="cursor-dot absolute left-0 top-0 size-1.5 rounded-full bg-primary-glow" />
    </div>
  )
}
