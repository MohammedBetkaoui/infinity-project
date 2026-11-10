import { useEffect, useRef } from 'react'
import { createCardVortex } from './vortexEngine'

const DECK_BACK = '/assets/workshops/infinity-deck-card.webp'

// One canvas, one engine. It only runs while on screen and while the tab is
// visible; reduced motion gets a single still frame of the same deck.
export default function CardVortex({ mode = 'tunnel', className = '', focusRef = null, interactive = true, intensity = 1 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || typeof canvas.getContext !== 'function') return undefined
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const compact = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches
    const engine = createCardVortex(canvas, { mode, compact, intensity, deckImageSrc: DECK_BACK, still: reduced })

    // The vanishing point sits behind the focus element, measured without
    // its transforms (the slot is never animated, the card inside it is).
    const focus = () => {
      const target = focusRef?.current
      const box = canvas.getBoundingClientRect()
      if (!target || !box.width || !box.height) return
      let x = 0
      let y = 0
      for (let node = target; node && node !== canvas.offsetParent; node = node.offsetParent) {
        x += node.offsetLeft
        y += node.offsetTop
      }
      engine.setFocus((x + target.offsetWidth / 2 - canvas.offsetLeft) / box.width, (y + target.offsetHeight / 2 - canvas.offsetTop) / box.height)
    }

    let visible = false
    const sync = () => {
      if (visible && !document.hidden && !reduced) engine.start()
      else engine.stop()
    }
    const resized = () => {
      engine.resize()
      focus()
      if (reduced) engine.still()
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      sync()
    }, { rootMargin: '120px 0px' })
    const sizes = new ResizeObserver(resized)
    observer.observe(canvas)
    sizes.observe(canvas)
    if (focusRef?.current) sizes.observe(focusRef.current)
    document.addEventListener('visibilitychange', sync)
    engine.still()

    const pointer = (event) => {
      if (event.pointerType !== 'mouse') return
      engine.setPointer((event.clientX / window.innerWidth - .5) * 2, (event.clientY / window.innerHeight - .5) * 2)
    }
    if (interactive && !reduced && !compact) window.addEventListener('pointermove', pointer, { passive: true })

    return () => {
      observer.disconnect()
      sizes.disconnect()
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('pointermove', pointer)
      engine.destroy()
    }
  }, [mode, focusRef, interactive, intensity])

  return <canvas ref={canvasRef} className={`ai-vortex ${className}`} aria-hidden="true" />
}
