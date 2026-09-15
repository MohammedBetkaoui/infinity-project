import useScrollAnimations from './useScrollAnimations'

export default function useHeroMotion(sectionRef) {
  useScrollAnimations(sectionRef, ({ gsap, select, revealText, pinSection, compact, reduced }) => {
    const section = sectionRef.current
    const copy = select('.home-hero-copy')
    const art = select('.home-hero-art')[0]
    const markDepth = select('.home-hero-mark-depth')[0]
    const mark = select('.home-hero-mark')[0]
    const sparks = select('.home-hero-spark')
    const foot = select('.home-hero-foot')[0]

    if (reduced) {
      gsap.from(copy, { opacity: .4, duration: .2 })
      return
    }

    select('.home-hero-line > span').forEach((line, index) => revealText(line, { scroll: false, delay: .12 + index * .14 }))
    const introduction = gsap.timeline()
      .from(select('.home-hero-brand'), { opacity: 0, duration: .4 }, .05)
      .from(select('.home-hero-description, .home-hero-actions'), { opacity: 0, y: 8, stagger: .08, duration: .48 }, .42)
      .from(mark, { scale: 1.08, opacity: 0, duration: .86, ease: 'power3.out' }, 0)

    const exitScale = () => {
      const width = Math.max(markDepth.offsetWidth, 1)
      const height = Math.max(markDepth.offsetHeight, width * 236 / 432)
      // At 90 degrees the dimensions swap. Overscan puts every logo edge
      // outside the viewport instead of relying on a desktop-only scale.
      const cover = Math.max(document.documentElement.clientWidth / height, window.innerHeight / width)
      return Math.max(compact ? 2.55 : 3.2, cover * (compact ? 1.22 : 1.34))
    }

    gsap.set([markDepth, mark], { transformOrigin: '50% 50%', force3D: true })
    const scene = pinSection(section, .96, {
      pin: select('.home-hero-inner')[0],
      id: 'infinity-hero',
      scrub: true,
    })

    if (scene) {
      section.dataset.heroMode = 'pinned'
      scene
        .addLabel('turn', 0)
        .fromTo(mark, { rotation: -12 }, {
          rotation: 90,
          duration: .4,
          ease: 'power2.inOut',
          force3D: true,
        }, 'turn')
        .fromTo(markDepth, { scale: 1, y: 0, opacity: 1 }, {
          scale: 1.045,
          y: 0,
          opacity: 1,
          duration: .4,
          ease: 'sine.inOut',
          force3D: true,
        }, 'turn')
        .to(sparks, {
          x: (index) => index % 2 ? 34 : -27,
          y: (index) => index % 2 ? -42 : 31,
          duration: .72,
          ease: 'power1.inOut',
          force3D: true,
        }, 'turn')
        .to(copy, {
          y: -12,
          scale: .985,
          opacity: .74,
          duration: .26,
          ease: 'power2.inOut',
          force3D: true,
        }, .14)
        .addLabel('cross', .4)
        .to(markDepth, {
          scale: exitScale,
          y: 0,
          duration: .6,
          ease: 'power2.in',
          force3D: true,
        }, 'cross')
        .to(copy, {
          y: -28,
          scale: .92,
          opacity: 0,
          duration: .25,
          ease: 'power2.in',
          force3D: true,
        }, 'cross')
        .to(foot, { y: 9, opacity: 0, duration: .2, ease: 'power2.in' }, .42)
        .to(sparks, { opacity: 0, duration: .2, ease: 'power2.in' }, .58)
        // The mark is already beyond every edge before this optical dissolve.
        .to(art, { opacity: .06, duration: .1, ease: 'none' }, .9)
    } else {
      section.dataset.heroMode = 'flow'
      // Touch and short layouts keep native flow while preserving the same
      // rotation-then-expansion story with transform-only motion.
      gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          id: 'infinity-hero-flow',
          trigger: section,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
          invalidateOnRefresh: true,
        },
      })
        .fromTo(mark, { rotation: -12 }, {
          rotation: 90,
          duration: .42,
          ease: 'power2.inOut',
          force3D: true,
        }, 0)
        .fromTo(markDepth, { scale: 1, opacity: 1 }, {
          scale: exitScale,
          opacity: .12,
          duration: .58,
          ease: 'power2.in',
          force3D: true,
        }, .42)
        .to(copy, { y: -18, scale: .96, opacity: .08, duration: .42, ease: 'power2.in' }, .2)
        .to(foot, { y: 8, opacity: 0, duration: .24, ease: 'power2.in' }, .38)
        .to(sparks, { opacity: 0, duration: .24 }, .44)
    }

    const finishIntro = () => { if (scrollY > 12) introduction.progress(1) }
    window.addEventListener('scroll', finishIntro, { passive: true })
    return () => {
      delete section.dataset.heroMode
      window.removeEventListener('scroll', finishIntro)
    }
  })
}
