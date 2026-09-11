import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { GSAP_EASE } from '../lib/motion'

export default function CustomCursor() {
  const ringRef = useRef(null)

  useEffect(() => {
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const ripple = (event) => {
        const target = event.target instanceof Element && event.target.closest('[data-ripple]')
        if (!target) return
        const rect = target.getBoundingClientRect()
        const size = Math.max(rect.width, rect.height) * 1.5
        const circle = document.createElement('span')
        circle.className = 'interaction-ripple'
        circle.setAttribute('aria-hidden', 'true')
        Object.assign(circle.style, {
          width: `${size}px`, height: `${size}px`,
          left: `${event.clientX - rect.left - size / 2}px`,
          top: `${event.clientY - rect.top - size / 2}px`,
        })
        target.append(circle)
        circle.addEventListener('animationend', () => circle.remove(), { once: true })
      }
      document.addEventListener('pointerdown', ripple)
      return () => {
        document.removeEventListener('pointerdown', ripple)
        document.querySelectorAll('.interaction-ripple').forEach((node) => node.remove())
      }
    })
    media.add('(hover: hover) and (pointer: fine) and (min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      const ring = ringRef.current
      const x = gsap.quickTo(ring, 'x', { duration: .2, ease: GSAP_EASE.smooth })
      const y = gsap.quickTo(ring, 'y', { duration: .2, ease: GSAP_EASE.smooth })
      let active
      let bounds
      const reset = () => {
        if (!active) return
        gsap.to(active, { x: 0, y: 0, duration: .3, overwrite: 'auto', clearProps: 'transform' })
        active = null
        bounds = null
        gsap.to(ring, { opacity: 0, duration: .15, overwrite: 'auto' })
      }
      // Measure only on entering a CTA, never scan every link on each pointer frame.
      const enter = (event) => {
        if (event.pointerType !== 'mouse') return
        const target = event.target instanceof Element && event.target.closest('[data-magnetic]')
        if (target === active) return
        reset()
        if (!target) return
        active = target
        bounds = target.getBoundingClientRect()
        gsap.set(ring, { x: event.clientX, y: event.clientY })
        gsap.to(ring, { opacity: .5, duration: .15 })
      }
      const move = (event) => {
        if (!active || !bounds) return
        const dx = event.clientX - bounds.left - bounds.width / 2
        const dy = event.clientY - bounds.top - bounds.height / 2
        x(event.clientX - dx * .1)
        y(event.clientY - dy * .1)
        gsap.to(active, {
          x: Math.max(-4, Math.min(4, dx * .08)),
          y: Math.max(-3, Math.min(3, dy * .08)),
          duration: .25, ease: GSAP_EASE.smooth, overwrite: 'auto',
        })
      }
      const key = (event) => { if (event.key === 'Tab') reset() }
      document.addEventListener('pointerover', enter, { passive: true })
      document.addEventListener('pointermove', move, { passive: true })
      document.documentElement.addEventListener('pointerleave', reset)
      window.addEventListener('scroll', reset, { passive: true })
      window.addEventListener('blur', reset)
      document.addEventListener('keydown', key)
      return () => {
        document.removeEventListener('pointerover', enter)
        document.removeEventListener('pointermove', move)
        document.documentElement.removeEventListener('pointerleave', reset)
        window.removeEventListener('scroll', reset)
        window.removeEventListener('blur', reset)
        document.removeEventListener('keydown', key)
        if (active) { gsap.killTweensOf(active); gsap.set(active, { clearProps: 'transform' }) }
        gsap.killTweensOf(ring)
      }
    })
    return () => media.revert()
  }, [])

  return <span ref={ringRef} className="cursor-ring pointer-events-none fixed left-0 top-0 z-[100] size-9 rounded-full border border-primary opacity-0" aria-hidden="true" />
}
