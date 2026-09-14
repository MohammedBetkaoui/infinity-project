import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function useHeroMotion(sectionRef) {
  const introPlayed = useRef(false)

  useLayoutEffect(() => {
    const section = sectionRef.current
    const media = gsap.matchMedia()

    media.add({ all: 'all', reduced: '(prefers-reduced-motion: reduce)', compact: '(max-width: 767px)' }, ({ conditions }) => {
      const select = gsap.utils.selector(section)
      const signal = select('.infinity-mark-signal')
      const copy = select('.home-hero-copy')

      if (conditions.reduced) {
        if (!introPlayed.current) {
          gsap.from(copy, { opacity: 0, duration: .24, onComplete: () => { introPlayed.current = true } })
        }
        return
      }

      // Draw the club's actual silhouette, then give the motto the foreground.
      const intro = gsap.timeline({ defaults: { ease: 'power3.out' }, onComplete: () => { introPlayed.current = true } })
      intro.fromTo(signal, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.06, ease: 'power3.inOut' }, 0)
        .from(select('.home-hero-brand'), { opacity: 0, duration: .34 }, .22)
        .from(select('.home-hero-line > span'), { yPercent: 108, rotation: .8, duration: .78, stagger: .09, ease: 'power4.out' }, .35)
        .from(select('.home-hero-description, .home-hero-actions'), { opacity: 0, y: 5, duration: .4, stagger: .09 }, .8)
        .from(select('.home-hero-foot'), { opacity: 0, duration: .34 }, 1.02)

      const finishIntro = () => {
        if (window.scrollY > 12 && intro.progress() < 1) intro.progress(1)
      }
      if (introPlayed.current || window.scrollY > 12 || (location.hash && location.hash !== '#accueil')) intro.progress(1)
      window.addEventListener('scroll', finishIntro, { passive: true })

      // Separate layers keep the entrance and reversible scroll from fighting over a transform.
      // No pin or extra spacer: depth comes from different travel distances, not scroll resistance.
      const scene = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          id: 'infinity-hero', trigger: section, start: 'top top', end: 'bottom top',
          scrub: true, invalidateOnRefresh: true,
        },
      })
      scene.to(select('.home-hero-mark-depth'), { y: conditions.compact ? 30 : 100, scale: .86, rotation: 8, duration: 1 }, 0)
        .to(copy, { y: conditions.compact ? -10 : -34, duration: 1 }, 0)
        .to(copy, { opacity: 0, duration: .42, ease: 'power2.in' }, .4)
        .to(select('.home-hero-art'), { opacity: 0, duration: .42, ease: 'power2.in' }, .58)
        .to(select('.home-hero-spark'), { y: (index) => (index % 2 ? -1 : 1) * (conditions.compact ? 9 : 25), duration: 1 }, 0)
        .to(select('.home-hero-foot i'), { scaleY: .35, duration: 1 }, 0)

      return () => window.removeEventListener('scroll', finishIntro)
    }, section)
    return () => media.revert()
  }, [sectionRef])
}
