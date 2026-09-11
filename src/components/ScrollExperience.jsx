import { useEffect, useRef } from 'react'
import Lenis from '@studio-freight/lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { lenisEasing } from '../lib/motion'

gsap.registerPlugin(ScrollTrigger)

export default function ScrollExperience() {
  const progressRef = useRef(null)

  useEffect(() => {
    let lenis
    let disposed = false
    let locked = false
    let focusFrame
    const media = gsap.matchMedia()
    const setProgress = gsap.quickSetter(progressRef.current, 'scaleX')
    const progress = ScrollTrigger.create({
      start: 0, end: 'max', onUpdate: (self) => setProgress(self.progress),
    })

    // One clock for scroll and GSAP; touch and reduced motion keep native scrolling.
    media.add('(pointer: fine) and (min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      const instance = new Lenis({ lerp: .24, smoothWheel: true, syncTouch: false, wheelMultiplier: 1 })
      lenis = instance
      if (locked) instance.stop()
      const off = instance.on('scroll', ScrollTrigger.update)
      const tick = (time) => instance.raf(time * 1000)
      gsap.ticker.add(tick)
      return () => {
        gsap.ticker.remove(tick)
        off?.()
        instance.destroy()
        lenis = undefined
      }
    })

    const handleScrollLock = (event) => {
      locked = Boolean(event.detail?.locked)
      if (locked) lenis?.stop()
      else lenis?.start()
    }
    const handleAnchorClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (!(event.target instanceof Element)) return
      const anchor = event.target.closest('a[href^="#"]')
      const href = anchor?.getAttribute('href')
      const target = href?.length > 1 ? document.getElementById(href.slice(1)) : null
      if (!target) return
      event.preventDefault()
      const focusTarget = () => {
        if (disposed) return
        if (!target.hasAttribute('tabindex')) {
          target.setAttribute('tabindex', '-1')
          target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true })
        }
        target.focus({ preventScroll: true })
      }
      if (lenis) {
        lenis.scrollTo(target, { offset: href === '#accueil' ? 0 : -88, duration: .55, easing: lenisEasing, force: true, onComplete: focusTarget })
      } else {
        // Defer until a mobile menu has released its scroll lock and inert state.
        cancelAnimationFrame(focusFrame)
        focusFrame = requestAnimationFrame(() => {
          const top = href === '#accueil' ? 0 : target.getBoundingClientRect().top + scrollY - 88
          window.scrollTo({ top, behavior: 'instant' })
          focusTarget()
        })
      }
      if (location.hash !== href) history.pushState(null, '', href)
    }
    window.addEventListener('infinity:scroll-lock', handleScrollLock)
    document.addEventListener('click', handleAnchorClick)
    const refresh = () => { if (!disposed) ScrollTrigger.refresh() }
    const refreshFrame = requestAnimationFrame(refresh)
    document.fonts?.ready.then(refresh)
    let resizeTimer
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(refresh, 150)
    })
    observer.observe(document.body)

    return () => {
      disposed = true
      cancelAnimationFrame(refreshFrame)
      cancelAnimationFrame(focusFrame)
      clearTimeout(resizeTimer)
      observer.disconnect()
      window.removeEventListener('infinity:scroll-lock', handleScrollLock)
      document.removeEventListener('click', handleAnchorClick)
      media.revert()
      progress.kill()
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[2px]" aria-hidden="true">
      <span ref={progressRef} className="block h-full w-full origin-left scale-x-0 bg-primary" />
    </div>
  )
}
