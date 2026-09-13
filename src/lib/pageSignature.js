import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { createInfinityFollower, HERO_DRAW_SHARE } from './infinityMotion'

const clamp = gsap.utils.clamp(0, 1)

export function createPageSignature() {
  const home = document.getElementById('accueil')
  const brand = document.querySelector('.site-header .brand-symbol')
  const shape = brand?.querySelector('.infinity-mark-shape')
  const signal = brand?.querySelector('.infinity-mark-signal')
  const signature = brand?.querySelector('.brand-journey')
  if (!home || !shape || !signal || !signature) return null

  const follower = createInfinityFollower(
    signature.querySelector('.brand-journey-ink'),
    signature.querySelector('.brand-journey-head'),
  )
  let start = 0
  let end = 1
  let maximum = 1
  let previousBlend = -1

  return {
    refresh(trigger) {
      const hero = ScrollTrigger.getById('infinity-hero')
      const nextSection = document.querySelector('main > section:not(#accueil)')
      // Another route may refresh its scene before the outgoing page's passive cleanup.
      if (!brand.isConnected || !nextSection || !home) return
      const nextSectionTop = nextSection.getBoundingClientRect().top + window.scrollY
      const pinned = home.dataset.heroMode === 'pinned'
      // Media-query changes can expose the new Hero trigger before it has measured.
      const measured = hero && Number.isFinite(hero.start) && Number.isFinite(hero.end)
      start = measured ? hero.start + (hero.end - hero.start) * (pinned ? HERO_DRAW_SHARE : 1) : Math.max(0, nextSectionTop - innerHeight)
      end = Math.max(start + 1, nextSectionTop - 96)
      maximum = Math.max(start + 1, Number.isFinite(trigger.end) ? trigger.end : document.documentElement.scrollHeight - innerHeight)
    },
    render(trigger) {
      if (!brand.isConnected) return
      const scroll = trigger.scroll()
      const blend = clamp((scroll - start) / (end - start))
      const progress = clamp((scroll - start) / (maximum - start))
      if (blend !== previousBlend) {
        signature.style.opacity = blend * .36
        previousBlend = blend
      }
      // A restrained pulse keeps the asymmetric emblem legible throughout the page.
      const wave = Math.sin(progress * Math.PI * 2)
      shape.style.transform = `rotate(${wave * 4.2}deg) scale(${1 - Math.abs(wave) * .025})`
      signal.style.strokeDashoffset = 1 - progress * 1.35
      signal.style.opacity = .18 + blend * .52
      follower.render(progress)
    },
    destroy() {
      follower.clear()
      signature.style.removeProperty('opacity')
      for (const node of [shape, signal]) {
        node.style.removeProperty('transform')
        node.style.removeProperty('stroke-dashoffset')
        node.style.removeProperty('opacity')
      }
    },
  }
}
