import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { animate, useMotionValue, useMotionValueEvent } from 'framer-motion'
import { clampIndex, snapPortrait, TEAM_SPRING } from './teamMotion'

export default function useTeamCarousel(stageRef, count, initialIndex, reduced) {
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const [geometry, setGeometry] = useState({ step: 300, compact: false })
  const step = useMotionValue(300)
  const x = useMotionValue(-initialIndex * 300)
  const animation = useRef(null)
  const selected = useRef(initialIndex)
  const destination = useRef(initialIndex)
  const clickBlockedUntil = useRef(0)
  const dragging = useRef(false)
  const wheelTimer = useRef(null)

  useMotionValueEvent(x, 'change', (value) => {
    const index = clampIndex(-value / step.get(), count)
    if (index !== selected.current) {
      selected.current = index
      setActiveIndex(index)
    }
  })

  const goTo = (index, { immediate = false, onComplete } = {}) => {
    clearTimeout(wheelTimer.current)
    const target = clampIndex(index, count)
    destination.current = target
    animation.current?.stop()
    const nextX = -target * step.get()
    if (reduced || immediate || Math.abs(nextX - x.get()) < .3) {
      x.set(nextX)
      onComplete?.()
    } else {
      animation.current = animate(x, nextX, { ...TEAM_SPRING, onComplete })
    }
  }

  useLayoutEffect(() => {
    const stage = stageRef.current
    const observer = new ResizeObserver(() => {
      const frames = stage.querySelectorAll('.team-frame-slot')
      if (!frames[0] || !stage.clientWidth) return
      const stride = frames[1] ? frames[1].offsetLeft - frames[0].offsetLeft : frames[0].offsetWidth
      if (stride <= 0) return
      const compact = stage.clientWidth < 768
      if (stride !== step.get()) {
        animation.current?.stop()
        step.set(stride)
        x.set(-destination.current * stride)
      }
      setGeometry((previous) => previous.step === stride && previous.compact === compact ? previous : { step: stride, compact })
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [stageRef, step, x])

  useEffect(() => {
    if (reduced) {
      animation.current?.stop()
      x.set(-destination.current * step.get())
    }
    return () => animation.current?.stop()
  }, [reduced, step, x])

  useEffect(() => {
    const stage = stageRef.current
    const wheel = (event) => {
      if (event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
      event.preventDefault()
      event.stopPropagation()
      animation.current?.stop()
      x.stop()
      clearTimeout(wheelTimer.current)
      const delta = event.deltaX * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientWidth : 1)
      x.set(Math.max(-(count - 1) * step.get(), Math.min(0, x.get() - delta)))
      destination.current = snapPortrait(x.get(), 0, step.get(), count)
      wheelTimer.current = setTimeout(() => {
        const target = -destination.current * step.get()
        if (reduced) x.set(target)
        else animation.current = animate(x, target, TEAM_SPRING)
      }, 95)
    }
    stage.addEventListener('wheel', wheel, { passive: false })
    return () => { stage.removeEventListener('wheel', wheel); clearTimeout(wheelTimer.current) }
  }, [count, reduced, stageRef, step, x])

  const stop = () => { clearTimeout(wheelTimer.current); animation.current?.stop(); x.stop() }
  const onDragStart = () => {
    stop()
    dragging.current = true
    clickBlockedUntil.current = Infinity
  }
  const onDragEnd = (_event, info) => {
    dragging.current = false
    clickBlockedUntil.current = performance.now() + 240
    goTo(snapPortrait(x.get(), reduced ? 0 : info.velocity.x, step.get(), count))
  }
  const onPointerCancel = () => {
    if (!dragging.current) return
    dragging.current = false
    clickBlockedUntil.current = performance.now() + 240
    goTo(snapPortrait(x.get(), 0, step.get(), count))
  }
  const suppressClick = () => performance.now() < clickBlockedUntil.current
  const move = (direction) => goTo(destination.current + direction)

  return { activeIndex, x, step, geometry, goTo, move, stop, onDragStart, onDragEnd, onPointerCancel, suppressClick }
}
