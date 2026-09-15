import gsap from 'gsap'
import useScrollAnimations from './useScrollAnimations'

export default function usePageHeroMotion(heroRef) {
  useScrollAnimations(heroRef, (motion) => {
    const hero = heroRef.current
    motion.revealText(hero.querySelector('.page-hero-title-mask'), { scroll: false })
    motion.revealText(hero.querySelector('.page-hero-lead'), { type: 'lines', scroll: false, delay: .22 })
    motion.revealText(hero.querySelector('.page-hero-summary'), { type: 'lines', scroll: false, delay: .34 })
    if (motion.reduced) return
    gsap.fromTo(hero.querySelector('.page-hero-rule i'), { scaleX: 0 }, {
      scaleX: 1, duration: .92, ease: 'power3.inOut',
    })
    // Exit only while sliding behind the fixed navbar: the layout stays
    // fully legible until its top reaches just below the navbar, then
    // fades quickly as it passes behind it.
    const layout = hero.querySelector('.page-hero-layout')
    gsap.fromTo(layout, { y: 0, opacity: 1 }, {
      y: motion.compact ? -8 : -16, opacity: 0, ease: 'none',
      scrollTrigger: {
        trigger: layout,
        start: 'top top+=140',
        end: 'bottom top+=96',
        scrub: true,
      },
    })
  })
}
