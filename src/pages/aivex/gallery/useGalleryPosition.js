import { useEffectEvent, useLayoutEffect } from 'react'
import gsap from 'gsap'

export default function useGalleryPosition(ref, position, setup, rebuildKey) {
  const buildPainter = useEffectEvent(setup)
  useLayoutEffect(() => {
    const context = gsap.context(() => {
      const paint = buildPainter(ref.current)
      paint(position.get())
      const unsubscribe = position.on('change', paint)
      return unsubscribe
    }, ref)
    return () => context.revert()
  }, [ref, position, rebuildKey])
}
