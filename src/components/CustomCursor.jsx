import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { GSAP_EASE } from '../lib/motion'

export default function CustomCursor() {
  const ringRef = useRef(null)
  useEffect(() => {
    const media = gsap.matchMedia()
    media.add('(hover: hover) and (pointer: fine) and (min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      const ring = ringRef.current
      const x = gsap.quickTo(ring, 'x', { duration: .18, ease: GSAP_EASE.smooth })
      const y = gsap.quickTo(ring, 'y', { duration: .18, ease: GSAP_EASE.smooth })
      let visible = false
      let bounds = null
      const hide = () => {
        visible = false
        bounds = null
        gsap.to(ring, { opacity: 0, duration: .14, overwrite: 'auto' })
      }
      const enter = (event) => {
        const target = event.target instanceof Element && event.target.closest('a, button, [data-cursor], .team-stage')
        const drag = target?.matches('.team-stage, [data-cursor="drag"]')
        ring.dataset.state = drag ? 'drag' : target ? 'hover' : 'default'
        // Measure once on entry. Only the cursor is magnetic, so scroll transforms on CTAs remain untouched.
        bounds = target?.matches('[data-magnetic]') ? target.getBoundingClientRect() : null
        gsap.to(ring, { scale: drag ? 1.6 : target ? 1.28 : .7, duration: .24, ease: GSAP_EASE.smooth, overwrite: 'auto' })
      }
      const move = (event) => {
        if (event.pointerType !== 'mouse') return
        if (!visible) {
          gsap.set(ring, { x: event.clientX, y: event.clientY })
          gsap.to(ring, { opacity: .65, duration: .16 })
          visible = true
        }
        const dx = bounds ? (bounds.left + bounds.width / 2 - event.clientX) * .08 : 0
        const dy = bounds ? (bounds.top + bounds.height / 2 - event.clientY) * .08 : 0
        x(event.clientX + Math.max(-5, Math.min(5, dx)))
        y(event.clientY + Math.max(-5, Math.min(5, dy)))
      }
      const key = (event) => { if (event.key === 'Tab') hide() }
      const scroll = () => { bounds = null }
      document.addEventListener('pointerover', enter, { passive: true })
      document.addEventListener('pointermove', move, { passive: true })
      document.documentElement.addEventListener('pointerleave', hide)
      window.addEventListener('blur', hide)
      window.addEventListener('scroll', scroll, { passive: true })
      document.addEventListener('keydown', key)
      return () => {
        document.removeEventListener('pointerover', enter)
        document.removeEventListener('pointermove', move)
        document.documentElement.removeEventListener('pointerleave', hide)
        window.removeEventListener('blur', hide)
        window.removeEventListener('scroll', scroll)
        document.removeEventListener('keydown', key)
      }
    })
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
          width: size + 'px', height: size + 'px',
          left: event.clientX - rect.left - size / 2 + 'px',
          top: event.clientY - rect.top - size / 2 + 'px',
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
    return () => media.revert()
  }, [])
  // Keep the native pointer: the ring is an enhancement, never a replacement for usability.
  return <span ref={ringRef} className="cursor-ring pointer-events-none fixed left-0 top-0 z-[100] size-9 rounded-full opacity-0" aria-hidden="true" />
}
