import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Lenis from '@studio-freight/lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { lenisEasing } from '../lib/motion'
import { cancelScrollRefresh, requestScrollRefresh } from '../lib/scrollRefresh'

gsap.registerPlugin(ScrollTrigger)

export default function useLenis() {
  const lenisRef = useRef(null)
  const { pathname, hash } = useLocation()

  useLayoutEffect(() => {
    const media = gsap.matchMedia()
    let locks = 0
    let frame
    let savedScroll = 0
    const remember = () => { savedScroll = window.scrollY }
    const restore = () => {
      if (lenisRef.current) lenisRef.current.scrollTo(savedScroll, { immediate: true, force: true })
      else window.scrollTo({ top: savedScroll, behavior: 'instant' })
    }
    gsap.addEventListener('matchMediaInit', remember)
    gsap.addEventListener('matchMedia', restore)
    media.add('(min-width: 768px) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
      const lenis = new Lenis({ duration: .88, easing: lenisEasing, smoothWheel: true, syncTouch: false, wheelMultiplier: 1 })
      lenisRef.current = lenis
      if (locks || document.body.style.overflow === 'hidden') lenis.stop()
      const unsubscribe = lenis.on('scroll', ScrollTrigger.update)
      // GSAP supplies seconds and Lenis expects milliseconds. There is only one RAF clock.
      const tick = (seconds) => lenis.raf(seconds * 1000)
      gsap.ticker.add(tick)
      return () => {
        gsap.ticker.remove(tick)
        unsubscribe?.()
        lenis.destroy()
        lenisRef.current = null
      }
    })

    const lock = (event) => {
      locks = Math.max(0, locks + (event.detail?.locked ? 1 : -1))
      if (locks) lenisRef.current?.stop()
      else lenisRef.current?.start()
    }
    const anchorClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      const anchor = event.target instanceof Element && event.target.closest('a[href^="#"]')
      if (!anchor || anchor.hash.length < 2) return
      const target = document.getElementById(decodeURIComponent(anchor.hash.slice(1)))
      if (!target) return
      event.preventDefault()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const focus = () => {
          if (!target.isConnected) return
          if (!target.hasAttribute('tabindex')) {
            target.setAttribute('tabindex', '-1')
            target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true })
          }
          target.focus({ preventScroll: true })
        }
        const offset = ['accueil', 'competition'].includes(target.id) ? 0 : -96
        if (lenisRef.current) lenisRef.current.scrollTo(target, { offset, duration: .72, force: true, onComplete: focus })
        else { window.scrollTo({ top: target.getBoundingClientRect().top + scrollY + offset, behavior: 'instant' }); focus() }
        if (location.hash !== anchor.hash) history.pushState(null, '', anchor.hash)
      })
    }
    window.addEventListener('infinity:scroll-lock', lock)
    document.addEventListener('click', anchorClick)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('infinity:scroll-lock', lock)
      document.removeEventListener('click', anchorClick)
      gsap.removeEventListener('matchMediaInit', remember)
      gsap.removeEventListener('matchMedia', restore)
      media.revert()
    }
  }, [])

  useLayoutEffect(() => {
    let disposed = false
    let interacted = false
    let lastSize = ''
    const cancelAlignment = () => { interacted = true }
    const align = () => {
      if (disposed) return
      requestScrollRefresh()
      if (disposed || interacted || !hash || location.hash !== hash) return
      const target = document.getElementById(decodeURIComponent(hash.slice(1)))
      if (!target) return
      ScrollTrigger.refresh()
      const offset = ['accueil', 'competition'].includes(target.id) ? 0 : -96
      if (lenisRef.current) lenisRef.current.scrollTo(target, { offset, immediate: true, force: true })
      else window.scrollTo({ top: target.getBoundingClientRect().top + scrollY + offset, behavior: 'instant' })
    }
    const observer = new ResizeObserver(([entry]) => {
      const size = `${Math.round(entry.contentRect.width)}:${Math.round(entry.contentRect.height)}`
      if (size === lastSize) return
      lastSize = size
      lenisRef.current?.resize()
      if (hash && !interacted) align()
      else requestScrollRefresh()
    })
    observer.observe(document.getElementById('root'))
    const imageLoaded = (event) => {
      if (event.target instanceof HTMLImageElement) requestScrollRefresh()
    }
    document.addEventListener('load', imageLoaded, true)
    document.addEventListener('error', imageLoaded, true)
    const inputs = ['wheel', 'touchstart', 'pointerdown', 'keydown']
    inputs.forEach((event) => window.addEventListener(event, cancelAlignment, { passive: true }))
    document.fonts.ready.then(() => { if (!disposed) align() })
    requestScrollRefresh()
    return () => {
      disposed = true
      observer.disconnect()
      cancelScrollRefresh()
      document.removeEventListener('load', imageLoaded, true)
      document.removeEventListener('error', imageLoaded, true)
      inputs.forEach((event) => window.removeEventListener(event, cancelAlignment))
    }
  }, [pathname, hash])

  return lenisRef
}
