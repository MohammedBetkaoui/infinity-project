import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { createInfinityFollower, HERO_DRAW_SHARE } from './infinityMotion'

const clamp = gsap.utils.clamp(0, 1)

export function createPageSignature() {
  const brand = document.querySelector('.site-header .brand-symbol')
  const mark = brand?.querySelector('.brand-mark')
  const signature = brand?.querySelector('.brand-journey')
  if (!signature) return null

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
      const about = document.getElementById('a-propos')
      const home = document.getElementById('accueil')
      // Another route may refresh its scene before the outgoing page's passive cleanup.
      if (!brand.isConnected || !about || !home) return
      const aboutTop = about.getBoundingClientRect().top + window.scrollY
      const pinned = home.dataset.heroMode === 'pinned'
      // Media-query changes can expose the new Hero trigger before it has measured.
      const measured = hero && Number.isFinite(hero.start) && Number.isFinite(hero.end)
      start = measured ? hero.start + (hero.end - hero.start) * (pinned ? HERO_DRAW_SHARE : 1) : Math.max(0, aboutTop - innerHeight)
      end = Math.max(start + 1, aboutTop - 96)
      maximum = Math.max(start + 1, Number.isFinite(trigger.end) ? trigger.end : document.documentElement.scrollHeight - innerHeight)
    },
    render(trigger) {
      if (!brand.isConnected) return
      const scroll = trigger.scroll()
      const blend = clamp((scroll - start) / (end - start))
      if (blend !== previousBlend) {
        // The wordmark stays still: only the emblem hands over to the reading path.
        mark.style.opacity = 1 - blend
        mark.style.transform = `rotate(${blend * 72}deg) scale(${1 - blend * .18})`
        signature.style.opacity = blend
        signature.style.transform = `scale(${.82 + blend * .18})`
        previousBlend = blend
      }
      follower.render((scroll - start) / (maximum - start))
    },
    destroy() {
      follower.clear()
      for (const node of [mark, signature]) {
        node.style.removeProperty('opacity')
        node.style.removeProperty('transform')
      }
    },
  }
}
