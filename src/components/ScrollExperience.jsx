import { useEffect, useRef } from 'react'
import Lenis from '@studio-freight/lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { lenisEasing } from '../lib/motion'
import { createPageSignature } from '../lib/pageSignature'

gsap.registerPlugin(ScrollTrigger)

export default function ScrollExperience() {
  const progressRef = useRef(null)

  useEffect(() => {
    let lenis
    let disposed = false
    let locked = false
    let focusFrame
    let mediaScroll
    let lastScroll = window.scrollY
    let rebuilding = false
    const media = gsap.matchMedia()
    const trackScroll = () => {
      if (!rebuilding && !ScrollTrigger.isRefreshing) lastScroll = window.scrollY
    }
    const rememberScroll = () => { rebuilding = true; mediaScroll = lastScroll }
    const restoreScroll = () => {
      if (mediaScroll === undefined) return
      // Rebuilding a pin must not send a reader back to the beginning of the page.
      if (lenis) {
        lenis.resize()
        lenis.scrollTo(mediaScroll, { immediate: true, force: true })
      } else {
        window.scrollTo({ top: mediaScroll, behavior: 'instant' })
      }
      mediaScroll = undefined
      ScrollTrigger.update()
      lastScroll = window.scrollY
      rebuilding = false
    }
    window.addEventListener('scroll', trackScroll, { passive: true })
    gsap.addEventListener('matchMediaInit', rememberScroll)
    gsap.addEventListener('matchMedia', restoreScroll)
    const setProgress = gsap.quickSetter(progressRef.current, 'scaleX')
    let signature
    const render = (trigger) => {
      setProgress(trigger.progress)
      signature?.render(trigger)
    }
    const progress = ScrollTrigger.create({
      id: 'infinity-page', start: 0, end: 'max', refreshPriority: -10,
      onUpdate: render,
      onRefresh: (trigger) => { signature?.refresh(trigger); render(trigger) },
    })
    media.add('(prefers-reduced-motion: no-preference)', () => {
      signature = createPageSignature()
      signature?.refresh(progress)
      render(progress)
      return () => { signature?.destroy(); signature = undefined }
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
    const initialHash = location.hash
    let hashFrame
    let interacted = false
    const cancelInitialAnchor = () => { interacted = true }
    const alignInitialAnchor = () => {
      document.fonts.ready.then(() => {
        if (disposed || interacted || !initialHash || location.hash !== initialHash) return
        hashFrame = requestAnimationFrame(() => {
          if (disposed || interacted) return
          const target = document.getElementById(initialHash.slice(1))
          if (!target) return
          // A native fragment jump happens before the Hero's pin has its final size.
          refresh()
          const offset = initialHash === '#accueil' ? 0 : -88
          if (lenis) {
            lenis.resize()
            lenis.scrollTo(target, { offset, immediate: true, force: true })
          } else {
            window.scrollTo({ top: target.getBoundingClientRect().top + scrollY + offset, behavior: 'instant' })
          }
          ScrollTrigger.update()
        })
      })
    }
    const inputEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown']
    if (initialHash) {
      inputEvents.forEach((event) => window.addEventListener(event, cancelInitialAnchor, { passive: true }))
      if (document.readyState === 'complete') alignInitialAnchor()
      else window.addEventListener('load', alignInitialAnchor, { once: true })
    }
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
      cancelAnimationFrame(hashFrame)
      clearTimeout(resizeTimer)
      observer.disconnect()
      window.removeEventListener('infinity:scroll-lock', handleScrollLock)
      document.removeEventListener('click', handleAnchorClick)
      window.removeEventListener('load', alignInitialAnchor)
      inputEvents.forEach((event) => window.removeEventListener(event, cancelInitialAnchor))
      window.removeEventListener('scroll', trackScroll)
      gsap.removeEventListener('matchMediaInit', rememberScroll)
      gsap.removeEventListener('matchMedia', restoreScroll)
      media.revert()
      progress.kill()
    }
  }, [])

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[2px]" aria-hidden="true">
      <span ref={progressRef} data-scroll-progress className="block h-full w-full origin-left scale-x-0 bg-primary" />
    </div>
  )
}
