import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { GSAP_EASE } from '../../lib/motion'

gsap.registerPlugin(ScrollTrigger)

function preparePath(path) {
  const length = path.getTotalLength()
  gsap.set(path, { strokeDasharray: length, strokeDashoffset: length })
  return length
}

function connectHead(path, head, glow) {
  const length = path.getTotalLength()
  const progress = { value: 0 }
  const setHeadX = gsap.quickSetter(head, 'x')
  const setHeadY = gsap.quickSetter(head, 'y')
  const setGlowX = gsap.quickSetter(glow, 'x')
  const setGlowY = gsap.quickSetter(glow, 'y')
  const render = () => {
    const point = path.getPointAtLength(length * progress.value)
    setHeadX(point.x)
    setHeadY(point.y)
    setGlowX(point.x)
    setGlowY(point.y)
  }
  render()
  return { progress, render }
}

export default function useEventsPageMotion(pageRef) {
  const introPlayed = useRef(false)

  useLayoutEffect(() => {
    const page = pageRef.current
    const media = gsap.matchMedia()

    media.add({
      all: 'all',
      reduced: '(prefers-reduced-motion: reduce)',
      compact: '(max-width: 767px)',
      fine: '(hover: hover) and (pointer: fine)',
    }, ({ conditions }) => {
      const { reduced, compact, fine } = conditions
      page.dataset.motion = reduced ? 'reduced' : 'active'
      if (reduced) return undefined

      const heroRoute = page.querySelector('.events-hero-route')
      const heroHead = page.querySelector('.events-hero-head')
      const heroGlow = page.querySelector('.events-hero-head-glow')
      const heroSignal = connectHead(heroRoute, heroHead, heroGlow)
      preparePath(heroRoute)
      gsap.set([heroHead, heroGlow], { opacity: 1 })

      const intro = gsap.timeline({
        defaults: { ease: GSAP_EASE.smooth },
        onComplete: () => { introPlayed.current = true },
      })
        .from('.events-title-line', { yPercent: 112, rotation: .7, duration: .78, stagger: .074 }, .06)
        .to(heroRoute, { strokeDashoffset: 0, duration: 1.08, ease: 'power3.inOut' }, .04)
        .to(heroSignal.progress, { value: 1, duration: 1.08, ease: 'power3.inOut', onUpdate: heroSignal.render }, .04)
        .from('.events-hero-nodes circle', { scale: 0, transformOrigin: 'center', duration: .28, stagger: .085 }, .43)
        .from('.events-hero-lead, .events-hero-summary, .events-hero-jump, .events-hero-facts', { opacity: 0, duration: .34, stagger: .055 }, .46)

      if (introPlayed.current || window.scrollY > 24) intro.progress(1)
      const finishIntro = () => { if (window.scrollY > 24 && intro.progress() < 1) intro.progress(1) }
      window.addEventListener('scroll', finishIntro, { passive: true })

      gsap.to('.events-signal-scroll', {
        y: compact ? -12 : -36,
        rotation: compact ? .6 : 1.7,
        ease: 'none',
        scrollTrigger: { trigger: '.events-page-hero', start: 'top top', end: 'bottom top', scrub: true },
      })

      const card = page.querySelector('.events-feature')
      const cardRoute = card.querySelector('.events-feature-route')
      const cardHead = card.querySelector('.events-feature-head')
      const cardGlow = card.querySelector('.events-feature-head-glow')
      const cardSignal = connectHead(cardRoute, cardHead, cardGlow)
      preparePath(cardRoute)
      gsap.set([cardHead, cardGlow], { opacity: 1 })

      gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          id: 'events-feature-reveal', trigger: card,
          start: compact ? 'top 88%' : 'top 82%', end: compact ? '55% 52%' : '70% 56%',
          scrub: true, invalidateOnRefresh: true,
        },
      })
        .fromTo('.events-feature-media', { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: .72 }, 0)
        .fromTo('.events-feature-media img', { scale: 1.12 }, { scale: 1, duration: 1 }, 0)
        .to(cardRoute, { strokeDashoffset: 0, duration: 1 }, 0)
        .to(cardSignal.progress, { value: 1, duration: 1, onUpdate: cardSignal.render }, 0)

      let bounds
      let move
      let reset
      let measure
      const mediaFrame = card.querySelector('.events-feature-media')
      const pointerTweens = []
      if (fine && !compact) {
        const rotateX = gsap.quickTo(mediaFrame, 'rotationX', { duration: .46, ease: GSAP_EASE.smooth })
        const rotateY = gsap.quickTo(mediaFrame, 'rotationY', { duration: .46, ease: GSAP_EASE.smooth })
        pointerTweens.push(rotateX.tween, rotateY.tween)
        measure = () => { bounds = mediaFrame.getBoundingClientRect() }
        move = (event) => {
          if (!bounds || event.pointerType !== 'mouse') return
          rotateX(gsap.utils.clamp(-2.4, 2.4, (event.clientY - bounds.top - bounds.height / 2) / bounds.height * -4.8))
          rotateY(gsap.utils.clamp(-3.1, 3.1, (event.clientX - bounds.left - bounds.width / 2) / bounds.width * 6.2))
        }
        reset = () => {
          if (!bounds) return
          bounds = null
          rotateX(0)
          rotateY(0)
        }
        mediaFrame.addEventListener('pointerenter', measure)
        mediaFrame.addEventListener('pointermove', move, { passive: true })
        mediaFrame.addEventListener('pointerleave', reset)
        window.addEventListener('scroll', reset, { passive: true })
      }

      return () => {
        window.removeEventListener('scroll', finishIntro)
        if (move) {
          mediaFrame.removeEventListener('pointerenter', measure)
          mediaFrame.removeEventListener('pointermove', move)
          mediaFrame.removeEventListener('pointerleave', reset)
          window.removeEventListener('scroll', reset)
        }
        pointerTweens.forEach((tween) => tween.kill())
      }
    }, page)

    return () => { media.revert(); delete page.dataset.motion }
  }, [pageRef])
}
