import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function ScrollExperience() {
  const progressRef = useRef(null)
  const { pathname } = useLocation()
  useLayoutEffect(() => {
    const context = gsap.context(() => {
      gsap.fromTo(progressRef.current, { scaleX: 0 }, {
        scaleX: 1, ease: 'none',
        scrollTrigger: { id: 'infinity-page', start: 0, end: 'max', scrub: true, refreshPriority: -10 },
      })
    })
    return () => context.revert()
  }, [pathname])
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[2px]" aria-hidden="true">
      <span ref={progressRef} data-scroll-progress className="block h-full w-full origin-left scale-x-0 bg-primary-glow" />
    </div>
  )
}
