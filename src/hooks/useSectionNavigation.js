import { useEffect, useState } from 'react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import gsap from 'gsap'
import { navigation } from '../data/siteData'

gsap.registerPlugin(ScrollTrigger)

export default function useSectionNavigation() {
  const [activeHref, setActiveHref] = useState('#accueil')
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    let sections = []
    let current = '#accueil'
    let compact = false
    const update = (trigger) => {
      const position = trigger.scroll()
      const nextCompact = position > 24
      // Read cached section positions, not layout, while the wheel is moving.
      const next = position >= trigger.end - 2 && trigger.end > 0
        ? sections.at(-1)?.href
        : sections.findLast((section) => section.top <= position + 220)?.href
      if (next && next !== current) { current = next; setActiveHref(next) }
      if (nextCompact !== compact) { compact = nextCompact; setScrolled(compact) }
    }
    const trigger = ScrollTrigger.create({
      id: 'infinity-navigation', start: 0, end: 'max', refreshPriority: -12,
      onUpdate: update,
      onRefresh: (self) => {
        sections = navigation.map((item) => {
          const node = document.getElementById(item.href.slice(1))
          return node ? { href: item.href, top: node.getBoundingClientRect().top + window.scrollY } : null
        }).filter(Boolean).sort((a, b) => a.top - b.top)
        update(self)
      },
    })
    return () => trigger.kill()
  }, [])

  return { activeHref, scrolled }
}
