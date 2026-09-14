import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import useScrollAnimations from '../../hooks/useScrollAnimations'

gsap.registerPlugin(ScrollTrigger)

export default function useAivexExperience(pageRef, ready) {
  const introPlayed = useRef(false)
  useScrollAnimations(pageRef, (motion) => {
    const root = pageRef.current
    root.querySelectorAll('h2:not([data-animated-text])').forEach((title) => motion.revealText(title))
    root.querySelectorAll('.ax-manifesto-copy > p, .ax-challenge-heading > div > p, .ax-footer-contact > p')
      .forEach((copy) => motion.revealText(copy, { type: 'lines' }))
    motion.revealSection('.ax-document-study', { mode: 'wipe', color: '#efede8' })
    root.querySelectorAll('.ax-project-note').forEach((note) => motion.revealSection(note, { mode: 'depth' }))
    motion.revealSection('.ax-footer-home', {
      mode: 'depth', start: 'clamp(top 99%)', end: 'clamp(bottom bottom)',
    })
    motion.parallaxElement('.ax-footer-cross', -.16, { rotation: 9 })
  }, { enabled: ready })

  useLayoutEffect(() => {
    const root = pageRef.current
    const html = document.documentElement
    const description = document.querySelector('meta[name="description"]')
    const theme = document.querySelector('meta[name="theme-color"]')
    const favicon = document.querySelector('#site-favicon')
    const previous = { title: document.title, description: description?.content, theme: theme?.content, favicon: favicon?.getAttribute('href'), page: html.dataset.page }
    document.title = 'AIVEX | National AI Competition, Second Edition'
    if (description) description.content = 'AIVEX, the second edition of the national artificial intelligence application programming competition, organised by Infinity Club in BBA.'
    if (theme) theme.content = '#111111'
    if (favicon) favicon.setAttribute('href', '/aivex-favicon.svg')
    html.dataset.page = 'aivex'
    const context = gsap.context(() => {
      gsap.to('.ax-scroll-progress', {
        scaleX: 1, ease: 'none',
        scrollTrigger: { id: 'aivex-progress', start: 0, end: 'max', scrub: true },
      })
    }, root)
    return () => {
      context.revert()
      document.title = previous.title
      if (description) description.content = previous.description
      if (theme) theme.content = previous.theme
      if (favicon && previous.favicon) favicon.setAttribute('href', previous.favicon)
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
