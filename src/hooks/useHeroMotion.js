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
      // The mark stays horizontal, so height is the limiting axis on tall screens.
      // This measured overscan lets its contour leave every edge cleanly.
      const cover = Math.max(document.documentElement.clientWidth / width, window.innerHeight / height)
      return Math.max(compact ? 3.1 : 3.2, cover * (compact ? 1.28 : 1.34))
    }

    gsap.set(markDepth, { transformOrigin: '50% 50%', force3D: true })
    gsap.set(mark, { rotation: 0, transformOrigin: '50% 50%', force3D: true })
    const scene = pinSection(section, .96, {
      pin: select('.home-hero-inner')[0],
      id: 'infinity-hero',
      scrub: true,
      pinSpacing: false,
    })

    if (scene) {
      section.dataset.heroMode = 'pinned'
      scene
        .addLabel('breathe', 0)
        .fromTo(markDepth, { scale: 1, y: 0, opacity: 1 }, {
          scale: 1.045,
          y: 0,
          opacity: 1,
          duration: .4,
          ease: 'sine.inOut',
          force3D: true,
        }, 'breathe')
        .to(sparks, {
          x: (index) => index % 2 ? 34 : -27,
          y: (index) => index % 2 ? -42 : 31,
          duration: .72,
          ease: 'power1.inOut',
          force3D: true,
        }, 'breathe')
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
        .to(foot, { y: 9, opacity: 0, duration: .18, ease: 'power2.in' }, .12)
        .to(sparks, { opacity: 0, duration: .2, ease: 'power2.in' }, .58)
        // The mark is already beyond every edge before this optical dissolve.
        .to(art, { opacity: 0, duration: .1, ease: 'none' }, .9)
    } else {
      section.dataset.heroMode = 'flow'
      // Touch and short layouts keep native flow while preserving the same
      // horizontal expansion story with transform-only motion.
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
        .fromTo(markDepth, { y: 0 }, {
          y: () => section.offsetHeight * .92,
          duration: 1,
          ease: 'none',
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
        .to(art, { opacity: 0, duration: .1, ease: 'none' }, .9)
    }

    const finishIntro = () => { if (scrollY > 12) introduction.progress(1) }
    window.addEventListener('scroll', finishIntro, { passive: true })
    return () => {
      delete section.dataset.heroMode
      window.removeEventListener('scroll', finishIntro)
    }
  })
}
