import { useLayoutEffect, useRef, useState } from 'react'
import { useMotionValue, useScroll } from 'framer-motion'
import useMotionPreference from '../../hooks/useMotionPreference'

export default function usePortraitRail(railRef, count, initialIndex) {
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const selection = useRef(initialIndex)
  const step = useMotionValue(350)
  const origin = useMotionValue(0)
  const reduced = useMotionPreference()
  const { scrollX } = useScroll({ container: railRef })

  useLayoutEffect(() => {
    const rail = railRef.current
    let previousWidth = 0
    let previousStep = 0

    const measure = () => {
      const items = rail.querySelectorAll('.community-portrait')
      const first = items[0]
      if (!first) return
      const width = rail.clientWidth
      const stride = items[1] ? items[1].offsetLeft - first.offsetLeft : first.offsetWidth
      if (width === previousWidth && stride === previousStep) return
      previousWidth = width
      previousStep = stride
      step.set(stride)
      origin.set(first.offsetLeft + first.offsetWidth / 2 - width / 2)
      // Keep the selected portrait centred when a phone rotates or the layout changes.
      rail.scrollTo({ left: origin.get() + selection.current * stride, behavior: 'instant' })
      scrollX.set(rail.scrollLeft)
    }
    const syncSelection = () => {
      const index = Math.max(0, Math.min(count - 1, Math.round((rail.scrollLeft - origin.get()) / step.get())))
      if (index !== selection.current) {
        selection.current = index
        setActiveIndex(index)
      }
    }
    const preserveHorizontalGesture = (event) => {
      // Let the browser own sideways trackpad gestures; vertical input still reaches Lenis.
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) event.stopPropagation()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(rail)
    rail.addEventListener('scroll', syncSelection, { passive: true })
    rail.addEventListener('wheel', preserveHorizontalGesture, { passive: true })
    return () => {
      observer.disconnect()
      rail.removeEventListener('scroll', syncSelection)
      rail.removeEventListener('wheel', preserveHorizontalGesture)
    }
  }, [count, origin, railRef, scrollX, step])

  const goTo = (index) => {
    const next = Math.max(0, Math.min(count - 1, index))
    railRef.current?.scrollTo({
      left: origin.get() + next * step.get(),
      behavior: reduced ? 'instant' : 'smooth',
    })
  }

  const onKeyDown = (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const destinations = { ArrowLeft: activeIndex - 1, ArrowRight: activeIndex + 1, Home: 0, End: count - 1 }
    if (!(event.key in destinations)) return
    event.preventDefault()
    // Keep keyboard focus in the gallery, not on a portrait that is sliding out of view.
    event.currentTarget.focus({ preventScroll: true })
    goTo(destinations[event.key])
  }

  return { activeIndex, goTo, onKeyDown, scrollX, step, origin, reduced }
}
