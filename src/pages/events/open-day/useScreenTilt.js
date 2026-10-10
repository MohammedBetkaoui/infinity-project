import gsap from 'gsap'
import { useEffect } from 'react'
import useMotionPreference from '../../../hooks/useMotionPreference'

const FINE_POINTER = '(hover: hover) and (pointer: fine)'
const TILT = 5
const SHIFT = 14

// Before the film starts, the screen leans toward a mouse pointer and catches
// a highlight while the strip behind slides the other way: depth from
// transforms only. Playback, a touch screen or reduced motion keep it at rest.
export default function useScreenTilt(stageRef, enabled) {
  const reduced = useMotionPreference()

  useEffect(() => {
    const stage = stageRef.current
    const tilt = stage?.querySelector('.od-feature-tilt')
    const frame = stage?.querySelector('.od-feature-frame')
    const strip = stage?.querySelector('.od-strip-shift')
    if (!tilt || !frame || !strip) return undefined

    const settle = () => {
      delete frame.dataset.glare
      gsap.to(tilt, { rotationX: 0, rotationY: 0, duration: .9, ease: 'expo.out', overwrite: 'auto' })
      gsap.to(strip, { x: 0, y: 0, duration: .9, ease: 'expo.out', overwrite: 'auto' })
    }
    if (!enabled || reduced || !window.matchMedia(FINE_POINTER).matches) {
      if (reduced) gsap.set([tilt, strip], { clearProps: 'transform' })
      else settle()
      return undefined
    }

    gsap.set(tilt, { transformPerspective: 1200 })
    const rotateX = gsap.quickTo(tilt, 'rotationX', { duration: .6, ease: 'power3.out' })
    const rotateY = gsap.quickTo(tilt, 'rotationY', { duration: .6, ease: 'power3.out' })
    const shiftX = gsap.quickTo(strip, 'x', { duration: .9, ease: 'power3.out' })
    const shiftY = gsap.quickTo(strip, 'y', { duration: .9, ease: 'power3.out' })
    let bounds = null

    const move = (event) => {
      if (event.pointerType !== 'mouse') return
      bounds ??= tilt.getBoundingClientRect()
      const x = Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1)
      const y = Math.min(Math.max((event.clientY - bounds.top) / bounds.height, 0), 1)
      rotateY((x - .5) * 2 * TILT)
      rotateX((.5 - y) * 2 * TILT)
      shiftX((.5 - x) * 2 * SHIFT)
      shiftY((.5 - y) * SHIFT)
      frame.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`)
      frame.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`)
      frame.dataset.glare = 'on'
    }
    const leave = () => {
      bounds = null
      delete frame.dataset.glare
      rotateX(0)
      rotateY(0)
      shiftX(0)
      shiftY(0)
    }
    const remeasure = () => { bounds = null }

    tilt.addEventListener('pointermove', move)
    tilt.addEventListener('pointerleave', leave)
    window.addEventListener('scroll', remeasure, { passive: true })
    return () => {
      tilt.removeEventListener('pointermove', move)
      tilt.removeEventListener('pointerleave', leave)
      window.removeEventListener('scroll', remeasure)
      settle()
    }
  }, [stageRef, enabled, reduced])
}
