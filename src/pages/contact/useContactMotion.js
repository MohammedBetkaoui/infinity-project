import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function useContactMotion(pageRef) {
  useLayoutEffect(() => {
    const page = pageRef.current
    const media = gsap.matchMedia()

    media.add({ reduced: '(prefers-reduced-motion: reduce)', compact: '(max-width: 767px)' }, ({ conditions }) => {
      const map = page.querySelector('.contact-route-map')
      const path = map.querySelector('.contact-route-ink')
      const signal = map.querySelector('.contact-route-signal')
      const steps = [...page.querySelectorAll('.contact-message-steps li')]
      const length = path.getTotalLength()
      let activeStep = -1

      const render = (progress) => {
        const point = path.getPointAtLength(progress * length)
        signal.setAttribute('transform', `translate(${point.x} ${point.y})`)
        const nextStep = Math.min(steps.length - 1, Math.floor(progress * steps.length))
        if (nextStep !== activeStep) {
          activeStep = nextStep
          steps.forEach((step, index) => { step.dataset.active = String(index <= activeStep) })
        }
      }

      gsap.set(path, { strokeDasharray: length })
      if (conditions.reduced) {
        gsap.set(path, { strokeDashoffset: 0 })
        render(1)
        return
      }

      gsap.set(path, { strokeDashoffset: length })
      render(0)
      const draw = gsap.to(path, {
        strokeDashoffset: 0,
        ease: 'none',
        scrollTrigger: {
          trigger: '.contact-route-layout',
          start: conditions.compact ? 'top 78%' : 'top 76%',
          end: conditions.compact ? 'bottom 50%' : 'bottom 62%',
          scrub: .24,
          invalidateOnRefresh: true,
          onUpdate: ({ progress }) => render(progress),
        },
      })

      return () => {
        draw.scrollTrigger?.kill()
        draw.kill()
        steps.forEach((step) => { delete step.dataset.active })
        path.removeAttribute('style')
        signal.removeAttribute('transform')
      }
    }, page)

    return () => media.revert()
  }, [pageRef])
}
