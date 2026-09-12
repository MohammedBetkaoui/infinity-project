import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { useMotionValue, useSpring } from 'framer-motion'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const sceneQuery = '(min-width: 800px) and (pointer: fine) and (prefers-reduced-motion: no-preference)'
const subscribe = (listener) => {
  const media = window.matchMedia(sceneQuery)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}
const snapshot = () => window.matchMedia(sceneQuery).matches
const spring = { stiffness: 112, damping: 25, mass: .72, restDelta: .01 }
const clamp = gsap.utils.clamp(-1, 1)

export default function useAivexScene(sceneRef, paused) {
  const enabled = useSyncExternalStore(subscribe, snapshot, () => false)
  const controlsRef = useRef(null)
  const boundsRef = useRef(null)
  const targetX = useMotionValue(0)
  const targetY = useMotionValue(0)
  const rotateX = useSpring(targetX, spring)
  const rotateY = useSpring(targetY, spring)

  useLayoutEffect(() => {
    if (!enabled) return
    const root = sceneRef.current
    let visible = false
    const controls = { paused: false, active: false, sync: null }
    controlsRef.current = controls
    let orbitTimeline
    let scrollTimeline
    const context = gsap.context(() => {
      orbitTimeline = gsap.timeline({ repeat: -1, paused: true })
        .to('.ax-orbit-turn-back', { rotation: 360, duration: 43, ease: 'none' }, 0)
        .to('.ax-orbit-turn-front', { rotation: -360, duration: 43, ease: 'none' }, 0)
      scrollTimeline = gsap.timeline({ paused: true })
        .to('.ax-scene-scroll', { y: 32, rotationX: 5, rotationY: -7, scale: .945, ease: 'none' })
      ScrollTrigger.create({
        id: 'aivex-scene-depth', trigger: root.closest('.ax-hero'), start: 'top top', end: 'bottom top',
        onUpdate: trigger => { if (!controls.paused) scrollTimeline.progress(trigger.progress) },
      })
    }, root)
    controls.sync = () => {
      const active = visible && !document.hidden && !controls.paused
      controls.active = active
      orbitTimeline.paused(!active)
      root.dataset.sceneActive = String(active)
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      controls.sync()
    }, { threshold: 0 })
    observer.observe(root)
    document.addEventListener('visibilitychange', controls.sync)
    const reset = () => { boundsRef.current = null; targetX.set(0); targetY.set(0) }
    window.addEventListener('scroll', reset, { passive: true })
    window.addEventListener('resize', reset, { passive: true })
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', controls.sync)
      window.removeEventListener('scroll', reset)
      window.removeEventListener('resize', reset)
      context.revert()
      delete root.dataset.sceneActive
      controlsRef.current = null
      boundsRef.current = null
    }
  }, [enabled, sceneRef, targetX, targetY])

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.paused = paused
      controlsRef.current.sync()
    }
    targetX.set(0)
    targetY.set(0)
    if (!enabled || paused) { rotateX.jump(0); rotateY.jump(0) }
  }, [enabled, paused, targetX, targetY, rotateX, rotateY])

  const resetPointer = () => { targetX.set(0); targetY.set(0); boundsRef.current = null }
  const onPointerMove = (event) => {
    if (!enabled || paused || !controlsRef.current?.active || event.pointerType !== 'mouse') return
    // Cache the untransformed stage, never measure an animated plane on every pointer event.
    const rect = boundsRef.current ??= event.currentTarget.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) / rect.width * 2 - 1)
    const y = clamp((event.clientY - rect.top) / rect.height * 2 - 1)
    targetX.set(-y * 4.2)
    targetY.set(x * 6.4)
  }
  return {
    enabled,
    depthStyle: enabled && !paused ? { rotateX, rotateY } : { rotateX: 0, rotateY: 0 },
    pointerEvents: { onPointerMove, onPointerLeave: resetPointer, onPointerCancel: resetPointer },
  }
}
