import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

function preparePath(path) {
  const length = path.getTotalLength()
  gsap.set(path, { strokeDasharray: length, strokeDashoffset: length })
  return length
}

export default function useAboutPageMotion(pageRef) {
  useLayoutEffect(() => {
    const page = pageRef.current
    const media = gsap.matchMedia()

    media.add({
      all: 'all',
      reduced: '(prefers-reduced-motion: reduce)',
      compact: '(max-width: 767px)',
    }, ({ conditions }) => {
      const { reduced, compact } = conditions
      page.dataset.motion = reduced ? 'reduced' : 'active'
      if (reduced) return undefined

      const scene = page.querySelector('.about-process-scene')
      const processPath = scene.querySelector('.about-process-ink')
      const processHead = scene.querySelector('.about-process-head')
      const code = scene.querySelector('.about-scene-code')
      const length = preparePath(processPath)
      preparePath(code)

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

    }, page)
    return () => { media.revert(); delete page.dataset.motion }
  }, [pageRef])
}
