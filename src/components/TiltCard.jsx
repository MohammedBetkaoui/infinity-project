import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { GSAP_EASE, shouldReduceMotion } from '../lib/motion'

export default function TiltCard({ as: Component = 'article', className = '', children, ...props }) {
  const cardRef = useRef(null)

  useEffect(() => {
    const card = cardRef.current
    const finePointer = window.matchMedia('(pointer: fine)').matches
    if (!card || !finePointer || shouldReduceMotion()) return undefined

    const depthLayer = card.querySelector('[data-tilt-depth]')
    let frameId
    let pointerEvent

    const renderTilt = () => {
      frameId = undefined
      const bounds = card.getBoundingClientRect()
      const horizontal = (pointerEvent.clientX - bounds.left) / bounds.width - 0.5
      const vertical = (pointerEvent.clientY - bounds.top) / bounds.height - 0.5
      const shadowX = horizontal * -14
      const shadowY = 15 + vertical * -8

      gsap.to(card, {
        rotateX: vertical * -4,
        rotateY: horizontal * 5,
        x: horizontal * 2,
        y: vertical * 2,
        boxShadow: `${shadowX}px ${shadowY}px 34px rgba(2, 8, 4, 0.28)`,
        duration: 0.42,
        ease: GSAP_EASE.smooth,
        overwrite: 'auto',
      })
    }

    const handleEnter = () => {
      card.style.willChange = 'transform'
      gsap.set(card, { transformPerspective: 950, transformStyle: 'preserve-3d' })
      if (depthLayer) gsap.set(depthLayer, { z: 16 })
    }
    const handleMove = (event) => {
      pointerEvent = event
      if (!frameId) frameId = requestAnimationFrame(renderTilt)
    }
    const handleLeave = () => {
      if (frameId) cancelAnimationFrame(frameId)
      frameId = undefined
      gsap.to(card, {
        rotateX: 0,
        rotateY: 0,
        x: 0,
        y: 0,
        boxShadow: '0 0 0 rgba(2, 8, 4, 0)',
        duration: 0.65,
        ease: GSAP_EASE.smooth,
        overwrite: 'auto',
        onComplete: () => {
          card.style.willChange = ''
          gsap.set(card, { clearProps: 'transform,transformPerspective,transformStyle,boxShadow' })
        },
      })
      if (depthLayer) {
        gsap.to(depthLayer, {
          z: 0,
          duration: 0.65,
          ease: GSAP_EASE.smooth,
          overwrite: 'auto',
          onComplete: () => gsap.set(depthLayer, { clearProps: 'transform' }),
        })
      }
    }

    card.addEventListener('pointerenter', handleEnter)
    card.addEventListener('pointermove', handleMove)
    card.addEventListener('pointerleave', handleLeave)

    return () => {
      if (frameId) cancelAnimationFrame(frameId)
      card.removeEventListener('pointerenter', handleEnter)
      card.removeEventListener('pointermove', handleMove)
      card.removeEventListener('pointerleave', handleLeave)
      gsap.killTweensOf([card, depthLayer])
    }
  }, [])

  return (
    <Component ref={cardRef} className={`tilt-card ${className}`} {...props}>
      {children}
    </Component>
  )
}
