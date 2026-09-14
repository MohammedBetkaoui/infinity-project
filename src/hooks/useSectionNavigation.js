import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import gsap from 'gsap'
import { navigation } from '../data/siteData'

gsap.registerPlugin(ScrollTrigger)

export default function useSectionNavigation() {
  const [activeHref, setActiveHref] = useState('#accueil')
  const [scrolled, setScrolled] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    let sections = []
    let current = pathname === '/' ? '#accueil' : pathname
    const update = (trigger) => {
      const position = trigger.scroll()
      // Read cached section positions, not layout, while the wheel is moving.
      const next = position >= trigger.end - 2 && trigger.end > 0
        ? sections.at(-1)?.href
        : sections.findLast((section) => section.top <= position + 220)?.href
      if (next && next !== current) { current = next; setActiveHref(next) }
    }
    const trigger = ScrollTrigger.create({
      id: 'infinity-navigation', start: 0, end: 'max', refreshPriority: -12,
      onUpdate: update,
      onRefresh: (self) => {
        sections = pathname === '/' ? navigation.map((item) => {
          const node = item.section ? document.getElementById(item.section) : null
          return node ? { href: item.href, top: node.getBoundingClientRect().top + window.scrollY } : null
        }).filter(Boolean).sort((a, b) => a.top - b.top) : []
        update(self)
      },
    })
    const navbar = ScrollTrigger.create({
      id: 'infinity-navbar-context', start: 24, end: 'max',
      onEnter: () => setScrolled(true), onLeaveBack: () => setScrolled(false),
      onRefresh: (self) => setScrolled(self.scroll() > 24),
    })
    return () => { navbar.kill(); trigger.kill() }
  }, [pathname])

  return { activeHref: pathname === '/' ? activeHref : pathname, scrolled }
}
