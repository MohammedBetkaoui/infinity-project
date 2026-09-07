import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { shouldReduceMotion } from '../lib/motion'

gsap.registerPlugin(ScrollTrigger)

const formatValue = (value, suffix) => `${Math.round(value).toLocaleString('fr-FR')}${suffix}`

export default function CountUp({ value, suffix = '', delay = 0 }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return undefined

    if (shouldReduceMotion()) {
      node.textContent = formatValue(value, suffix)
      return undefined
    }

    const counter = { value: 0 }
    const overshoot = value + Math.max(1, Math.round(value * 0.018))
    const render = () => { node.textContent = formatValue(counter.value, suffix) }
    node.textContent = formatValue(0, suffix)

    const context = gsap.context(() => {
      gsap.timeline({
        delay,
        scrollTrigger: {
          trigger: node,
          start: 'top 88%',
          once: true,
        },
      })
        .to(counter, {
          value: overshoot,
          duration: 1.35,
          ease: 'expo.out',
          onUpdate: render,
        })
        .to(counter, {
          value,
          duration: 0.42,
          ease: 'back.out(2.2)',
          onUpdate: render,
          onComplete: render,
        })
    }, node)

    return () => context.revert()
  }, [delay, suffix, value])

  return <span ref={ref}>{formatValue(value, suffix)}</span>
}
