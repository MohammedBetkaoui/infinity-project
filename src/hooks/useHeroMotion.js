import useScrollAnimations from './useScrollAnimations'

export default function useHeroMotion(sectionRef) {
  useScrollAnimations(sectionRef, ({ gsap, select, revealText, pinSection, compact, reduced, parallaxElement }) => {
    const section = sectionRef.current
    const copy = select('.home-hero-copy')
    if (reduced) {
      gsap.from(copy, { opacity: .4, duration: .2 })
      return
    }
    select('.home-hero-line > span').forEach((line, index) => revealText(line, { scroll: false, delay: .12 + index * .14 }))
    const introduction = gsap.timeline()
      .from(select('.home-hero-brand'), { opacity: 0, duration: .4 }, .05)
      .from(select('.home-hero-description, .home-hero-actions'), { opacity: 0, y: 8, stagger: .08, duration: .48 }, .42)
      .from(select('.home-hero-mark'), { scale: 1.08, opacity: 0, duration: .86, ease: 'power3.out' }, 0)

    const scene = pinSection(section, .68, { pin: select('.home-hero-inner')[0], id: 'infinity-hero' })
    if (scene) {
      section.dataset.heroMode = 'pinned'
      // The emblem travels first; the message stays legible through the pin
      // and recedes only at the very end — the pin keeps it centered, never
      // behind the navbar, so no early masking.
      scene.to(select('.home-hero-mark-depth'), { scale: 1.1, y: 42, rotation: 9, duration: .58 }, 0)
        .to(select('.home-hero-spark'), { y: (index) => index % 2 ? -38 : 25, duration: 1 }, 0)
        .to(select('.home-hero-mark-depth'), { scale: .92, opacity: .25, duration: .42 }, .58)
        .to(copy, { y: -12, scale: .985, opacity: .9, duration: .18 }, .82)
    } else {
      section.dataset.heroMode = 'flow'
      parallaxElement(select('.home-hero-mark-depth')[0], .5, { trigger: section, start: 'top top', end: 'bottom top', rotation: compact ? 0 : 3 })
    }
    const finishIntro = () => { if (scrollY > 12) introduction.progress(1) }
    window.addEventListener('scroll', finishIntro, { passive: true })
    return () => { delete section.dataset.heroMode; window.removeEventListener('scroll', finishIntro) }
  })
}
