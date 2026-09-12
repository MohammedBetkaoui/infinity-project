import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function useAivexExperience(pageRef, ready) {
  const introPlayed = useRef(false)
  useLayoutEffect(() => {
    const root = pageRef.current
    const html = document.documentElement
    const description = document.querySelector('meta[name="description"]')
    const theme = document.querySelector('meta[name="theme-color"]')
    const previous = { title: document.title, description: description?.content, theme: theme?.content, page: html.dataset.page }
    document.title = 'AIVEX | National AI Competition, Second Edition'
    if (description) description.content = 'AIVEX, the second edition of the national artificial intelligence application programming competition, organised by Infinity Club in BBA.'
    if (theme) theme.content = '#111111'
    html.dataset.page = 'aivex'
    if (!location.hash) window.scrollTo({ top: 0, behavior: 'instant' })

    let disposed = false
    let frame
    let interacted = false
    const initialHash = location.hash
    const cancelAlignment = () => { interacted = true }
    const inputs = ['wheel', 'touchstart', 'pointerdown', 'keydown']
    inputs.forEach(event => window.addEventListener(event, cancelAlignment, { passive: true }))
    const focusAnchor = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null
      const target = anchor ? document.getElementById(anchor.hash.slice(1)) : null
      // Keep native fragment history and scrolling; only add the missing keyboard focus hand-off.
      target?.focus({ preventScroll: true })
    }
    root.addEventListener('click', focusAnchor)

    const context = gsap.context(() => {
      gsap.to('.ax-scroll-progress', {
        scaleX: 1, ease: 'none',
        scrollTrigger: { id: 'aivex-progress', start: 0, end: 'max', scrub: true },
      })
    }, root)
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.ax-ink-line', { strokeDashoffset: 1, duration: .84, ease: 'power3.inOut', scrollTrigger: { trigger: '.ax-manifesto', start: 'top 78%', once: true } })
      gsap.from('.ax-circuit-ink', { strokeDashoffset: 1, ease: 'none', scrollTrigger: { trigger: '.ax-workbench', start: 'top 85%', end: 'bottom 64%', scrub: true } })
      gsap.from('.ax-brief-wire', { strokeDashoffset: 1, ease: 'none', scrollTrigger: { trigger: '.ax-document-study', start: 'top 84%', end: 'bottom 65%', scrub: true } })
    }, root)

    let resizeTimer
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => { if (!disposed) ScrollTrigger.refresh() }, 120)
    })
    observer.observe(root)

    document.fonts.ready.then(() => {
      if (disposed) return
      frame = requestAnimationFrame(() => {
        ScrollTrigger.refresh()
        if (!interacted && initialHash && location.hash === initialHash) {
          document.getElementById(initialHash.slice(1))?.scrollIntoView({ behavior: 'instant' })
        }
      })
    })
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      clearTimeout(resizeTimer)
      observer.disconnect()
      root.removeEventListener('click', focusAnchor)
      inputs.forEach(event => window.removeEventListener(event, cancelAlignment))
      media.revert()
      context.revert()
      document.title = previous.title
      if (description) description.content = previous.description
      if (theme) theme.content = previous.theme
      if (previous.page === undefined) delete html.dataset.page
      else html.dataset.page = previous.page
    }
  }, [pageRef])

  useLayoutEffect(() => {
    if (!ready || introPlayed.current || location.hash || window.scrollY >= 100) return
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      // The Hero starts when the loader leaves, not underneath its two-second hold.
      const touchLayout = matchMedia('(max-width: 799px), (pointer: coarse)').matches
      const intro = gsap.timeline({ defaults: { ease: 'power4.out' }, onComplete: () => { introPlayed.current = true } })
      if (!touchLayout) intro.from('.ax-scene-reveal', { rotationY: -16, rotationX: 6, z: -80, duration: 1.36 }, 0)
      intro
        .from('.ax-art-reveal', { opacity: 0, duration: .88 }, .06)
        .from('.ax-orbit-arc', { strokeDashoffset: 1, duration: 1.1, ease: 'power3.inOut' }, .08)
        .from('.ax-title-line', { yPercent: 110, duration: .68, stagger: .085 }, .32)
        .from('.ax-intro-detail', { opacity: 0, duration: .52, stagger: .035 }, .66)
      const finishIntro = () => { if (window.scrollY > 32 && intro.progress() < 1) intro.progress(1) }
      window.addEventListener('scroll', finishIntro, { passive: true })
      return () => window.removeEventListener('scroll', finishIntro)
    }, pageRef)
    return () => media.revert()
  }, [pageRef, ready])
}
