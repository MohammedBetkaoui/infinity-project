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

export default function useAboutPageMotion(pageRef) {
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

      const routes = page.querySelectorAll('.about-hero-route')
      const sheet = page.querySelector('.about-emblem-sheet')
      const title = page.querySelectorAll('.about-title-line')
      const scene = page.querySelector('.about-process-scene')
      const processPath = scene.querySelector('.about-process-ink')
      const processHead = scene.querySelector('.about-process-head')
      const code = scene.querySelector('.about-scene-code')
      routes.forEach(preparePath)
      const length = preparePath(processPath)
      preparePath(code)

      // Intro and pointer depth use separate wrappers so scroll never fights the cursor.
      const intro = gsap.timeline({
        defaults: { ease: GSAP_EASE.smooth },
        onComplete: () => { introPlayed.current = true },
      })
        .from(title, { yPercent: 112, rotation: .9, duration: .82, stagger: .068 }, .08)
        .from('.about-emblem-scroll', { rotationY: -12, rotationX: 7, duration: 1.06 }, 0)
        .to(routes, { strokeDashoffset: 0, duration: 1.16, ease: 'power3.inOut' }, .06)
        .from('.about-hero-node', { scale: 0, transformOrigin: 'center', duration: .38, stagger: .12 }, .53)
        .from('.about-hero-summary, .about-inline-link, .about-hero-facts', { opacity: 0, duration: .38, stagger: .07 }, .58)
      if (introPlayed.current || window.scrollY > 24) intro.progress(1)
      const finishIntro = () => { if (window.scrollY > 24 && intro.progress() < 1) intro.progress(1) }
      window.addEventListener('scroll', finishIntro, { passive: true })

      gsap.to('.about-emblem-scroll', {
        y: compact ? -12 : -32, rotation: 2.6, ease: 'none',
        scrollTrigger: { trigger: '.about-page-hero', start: 'top top', end: 'bottom top', scrub: true },
      })

      const draw = { progress: 0 }
      const setX = gsap.quickSetter(processHead, 'x')
      const setY = gsap.quickSetter(processHead, 'y')
      const renderHead = () => {
        const point = processPath.getPointAtLength(length * draw.progress)
        setX(point.x)
        setY(point.y)
      }
      renderHead()
      gsap.set(processHead, { opacity: 1 })
      gsap.set('.about-scene-prototype, .about-scene-shared', { opacity: 0, scale: .94, transformOrigin: '240px 190px' })
      const indicators = scene.querySelectorAll('.about-scene-indicators i')
      gsap.set(indicators, { opacity: .22 })
      gsap.set(indicators[0], { opacity: 1 })

      // Desktop follows the reading column; the compact scene completes while still on screen.
      gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          id: 'about-process-network', trigger: compact ? scene : '.about-process-track',
          start: compact ? 'top 82%' : 'top 65%', end: compact ? 'bottom 35%' : 'bottom 65%',
          scrub: true, invalidateOnRefresh: true,
        },
      })
        .to(processPath, { strokeDashoffset: 0, duration: 1 }, 0)
        .to(draw, { progress: 1, duration: 1, onUpdate: renderHead }, 0)
        .to('.about-scene-sketch', { opacity: 0, duration: .1 }, .28)
        .to('.about-scene-prototype', { opacity: 1, scale: 1, duration: .12 }, .3)
        .to(code, { strokeDashoffset: 0, duration: .18 }, .39)
        .to(indicators[0], { opacity: .22, duration: .08 }, .3)
        .to(indicators[1], { opacity: 1, duration: .08 }, .3)
        .to('.about-scene-prototype', { opacity: 0, duration: .1 }, .66)
        .to('.about-scene-shared', { opacity: 1, scale: 1, duration: .15 }, .68)
        .to(indicators[1], { opacity: .22, duration: .08 }, .68)
        .to(indicators[2], { opacity: 1, duration: .08 }, .68)

      page.querySelectorAll('.about-process-stages li').forEach((stage) => {
        gsap.fromTo(stage.querySelector('.about-stage-progress'), { scaleX: 0 }, {
          scaleX: 1, ease: 'none',
          scrollTrigger: { trigger: stage, start: 'top 74%', end: 'bottom 57%', scrub: true },
        })
      })

      const pointerTweens = []
      let bounds
      const measure = () => { bounds = sheet.parentElement.getBoundingClientRect() }
      let move, reset
      if (fine && !compact) {
        const rotateX = gsap.quickTo(sheet, 'rotationX', { duration: .48, ease: GSAP_EASE.smooth })
        const rotateY = gsap.quickTo(sheet, 'rotationY', { duration: .48, ease: GSAP_EASE.smooth })
        pointerTweens.push(rotateX.tween, rotateY.tween)
        move = (event) => {
          if (!bounds || event.pointerType !== 'mouse') return
          rotateX(gsap.utils.clamp(-3, 3, (event.clientY - bounds.top - bounds.height / 2) / bounds.height * -6))
          rotateY(gsap.utils.clamp(-4, 4, (event.clientX - bounds.left - bounds.width / 2) / bounds.width * 8))
        }
        reset = () => {
          if (!bounds) return
          bounds = null
          rotateX(0)
          rotateY(0)
        }
        sheet.addEventListener('pointerenter', measure)
        sheet.addEventListener('pointermove', move, { passive: true })
        sheet.addEventListener('pointerleave', reset)
        window.addEventListener('scroll', reset, { passive: true })
      }
      return () => {
        window.removeEventListener('scroll', finishIntro)
        if (move) {
          sheet.removeEventListener('pointerenter', measure)
          sheet.removeEventListener('pointermove', move)
          sheet.removeEventListener('pointerleave', reset)
          window.removeEventListener('scroll', reset)
        }
        pointerTweens.forEach(tween => tween.kill())
      }
    }, page)
    return () => { media.revert(); delete page.dataset.motion }
  }, [pageRef])
}
