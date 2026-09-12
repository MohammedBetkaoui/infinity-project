import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import useMotionPreference from '../hooks/useMotionPreference'

gsap.registerPlugin(ScrollTrigger)

const formatValue = (value, suffix) => `${Math.round(value).toLocaleString('en-GB')}${suffix}`

export default function CountUp({ value, suffix = '', delay = 0 }) {
  const ref = useRef(null)
  const reduced = useMotionPreference()

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return undefined

    if (reduced) {
      node.textContent = formatValue(value, suffix)
      return undefined
    }

    const counter = { value: 0 }
    const overshoot = value < 10 ? value : value + Math.round(value * 0.012)
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
          duration: 1.1,
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
  }, [delay, suffix, value, reduced])

  return <><span className="sr-only">{formatValue(value, suffix)}</span><span ref={ref} aria-hidden="true">{formatValue(value, suffix)}</span></>
}
