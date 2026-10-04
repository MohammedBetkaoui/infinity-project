import { useLayoutEffect, useRef } from 'react'
import useMotionPreference from './useMotionPreference'
import { onLayoutResize } from '../lib/viewportResize'
import { HERO_LIGHT_EVENT, heroTitleLightAt } from '../lib/homeHeroLines'

const clamp = value => Math.min(1, Math.max(0, value))

export default function useHeroMotion(sectionRef) {
  const acquired = useRef({ first: 0, second: 0 })
  const reduced = useMotionPreference()

  useLayoutEffect(() => {
    const hero = sectionRef.current
    if (!hero) return undefined
    const title = hero.querySelector('h1')
    const lines = hero.querySelectorAll('.home-hero-line > span')
    const initial = acquired.current
    let scrollTarget = 0
    let scrollCurrent = 0
    let scrollActivity = 0
    let scrollImpulse = false
    let heroTop = 0
    let heroHeight = 1

    const renderTitle = () => {
      for (const [index, key] of ['first', 'second'].entries()) {
        const value = initial[key]
        lines[index]?.style.setProperty('--title-light-front', `${value * 120 - 10}%`)
        // A small travelling mint reflection fades out after the first pass.
        lines[index]?.style.setProperty('--title-arrival-sheen', String(Math.sin(value * Math.PI) * .44))
      }
      hero.dataset.titleLit = initial.first === 1 && initial.second === 1 ? 'true' : 'false'
    }
    const finish = () => {
      initial.first = 1
      initial.second = 1
      renderTitle()
    }
    const updateScrollTarget = () => {
      const next = clamp((window.scrollY - heroTop) / heroHeight)
      if (Math.abs(next - scrollTarget) > .0001) scrollImpulse = true
      scrollTarget = next
    }
    const measure = () => {
      const box = hero.getBoundingClientRect()
      heroTop = box.top + window.scrollY
      heroHeight = Math.max(1, box.height)
      if (title) {
        const titleBox = title.getBoundingClientRect()
        // Centre the compact background on the title's layout position, not
        // its temporary upward translation during the scroll dissolve.
        const transform = getComputedStyle(title).transform
        const shiftY = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42
        hero.style.setProperty('--hero-symbol-center', `${(titleBox.top - shiftY + titleBox.height / 2 - box.top) / heroHeight * 100}%`)
      }
      updateScrollTarget()
    }
    const handleLight = ({ detail }) => {
      if (detail.mode === 'static') { finish(); return }
      if (detail.mode !== 'frame' || reduced) return
      const next = heroTitleLightAt(detail.elapsed)
      // Progress is acquired once. Leaving the hero, media changes and shader
      // restarts cannot restore the dim title or replay its initial reveal.
      initial.first = Math.max(initial.first, next.first)
      initial.second = Math.max(initial.second, next.second)
      renderTitle()
      const delta = Math.max(1 / 60, detail.delta)
      const damping = 1 - Math.exp(-delta / .18)
      scrollCurrent += (scrollTarget - scrollCurrent) * damping
      scrollActivity = scrollImpulse ? 1 : scrollActivity * Math.exp(-delta / .65)
      scrollImpulse = false
      hero.style.setProperty('--hero-light-scroll', scrollCurrent.toFixed(5))
      hero.style.setProperty('--hero-light-scroll-active', scrollActivity.toFixed(4))
      hero.style.setProperty('--title-scroll-front', `${scrollCurrent * 120 - 10}%`)
      hero.style.setProperty('--title-scroll-sheen', String(scrollActivity * .32))
    }

    measure()
    if (reduced) finish()
    else renderTitle()
    // The shader's paused clock also owns title/reflection updates: no second
    // RAF, no animation while hidden, and one timeline for light and letters.
    hero.addEventListener(HERO_LIGHT_EVENT, handleLight)
    window.addEventListener('scroll', updateScrollTarget, { passive: true })
    const removeResize = onLayoutResize(measure)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(hero)
    if (title) observer?.observe(title)
    return () => {
      hero.removeEventListener(HERO_LIGHT_EVENT, handleLight)
      window.removeEventListener('scroll', updateScrollTarget)
      removeResize()
      observer?.disconnect()
    }
  }, [sectionRef, reduced])
}
