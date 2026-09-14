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
    // A restrained exit gives the following section room without pinning every page.
    gsap.fromTo(hero.querySelector('.page-hero-layout'), { y: 0, opacity: 1 }, {
      y: motion.compact ? -8 : -24, opacity: .18, ease: 'none',
      scrollTrigger: { trigger: hero, start: '55% top', end: 'bottom top', scrub: true },
    })
  })
}
