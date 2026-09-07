import { useEffect, useRef } from 'react'
import Lenis from '@studio-freight/lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { lenisEasing, shouldReduceMotion } from '../lib/motion'

gsap.registerPlugin(ScrollTrigger)

export default function ScrollExperience() {
  const progressRef = useRef(null)

  useEffect(() => {
    const progress = progressRef.current
    const reducedMotion = shouldReduceMotion()
    const smoothWheelAvailable = window.matchMedia('(pointer: fine) and (min-width: 768px)').matches
    let lenis

    gsap.set(progress, { scaleX: 0, transformOrigin: 'left center' })

    const progressTrigger = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: (self) => gsap.set(progress, { scaleX: self.progress }),
    })

    if (reducedMotion || !smoothWheelAvailable) {
      ScrollTrigger.refresh()
      return () => progressTrigger.kill()
    }

    lenis = new Lenis({
      lerp: 0.22,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 1.05,
    })

    const removeScrollListener = lenis.on('scroll', ScrollTrigger.update)
    const tick = (time) => lenis.raf(time * 1000)
    const handleScrollLock = (event) => {
      if (event.detail?.locked) lenis.stop()
      else lenis.start()
    }
    const handleAnchorClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const anchor = event.target.closest('a[href^="#"]')
      if (!anchor) return

      const href = anchor.getAttribute('href')
      const target = href && href.length > 1 ? document.querySelector(href) : null
      if (!target) return

      event.preventDefault()
      lenis.scrollTo(target, {
        offset: href === '#accueil' ? 0 : -84,
        duration: 0.68,
        easing: lenisEasing,
        force: true,
      })

      if (window.location.hash !== href) window.history.pushState(null, '', href)
    }

    gsap.ticker.add(tick)
    window.addEventListener('infinity:scroll-lock', handleScrollLock)
    document.addEventListener('click', handleAnchorClick)

    const refresh = () => ScrollTrigger.refresh()
    const refreshFrame = requestAnimationFrame(refresh)
    document.fonts?.ready.then(refresh)

    return () => {
      cancelAnimationFrame(refreshFrame)
      document.removeEventListener('click', handleAnchorClick)
      window.removeEventListener('infinity:scroll-lock', handleScrollLock)
      gsap.ticker.remove(tick)
      removeScrollListener?.()
      progressTrigger.kill()
      lenis.destroy()
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[2px] bg-cream/5" aria-hidden="true">
      <span ref={progressRef} className="block h-full w-full bg-primary shadow-[0_0_12px_rgba(139,203,107,.55)]" />
    </div>
  )
}
