import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { createScrollReveal } from '../../lib/scrollReveal'

gsap.registerPlugin(ScrollTrigger)

export default function useCommunityScrollMotion(pageRef) {
  useLayoutEffect(() => {
    const media = gsap.matchMedia()

    media.add({
      motion: '(prefers-reduced-motion: no-preference)',
      compact: '(max-width: 767px)',
    }, ({ conditions }) => {
      if (!conditions.motion) return

      const page = pageRef.current
      const hero = page.querySelector('.community-page-hero')
      const heroContent = hero.querySelector('.page-container')
      const revealGroups = [
        { selector: '.team-gallery-heading h2', gesture: 'title' },
        { selector: '.team-gallery-heading p', gesture: 'copy' },
        { selector: '.team-stage', gesture: 'depth' },
        { selector: '.team-caption-row', gesture: 'copy' },
        { selector: '.team-name-selector', gesture: 'depth' },
        { selector: '.team-gallery-footnote' },
        { selector: '.community-life-intro h2', gesture: 'title' },
        { selector: '.community-life-intro > p, .community-life-intro > a', gesture: 'copy' },
        { selector: '.community-life-signature', gesture: 'depth' },
        { selector: '.community-contributions article', gesture: 'copy' },
        { selector: '.community-life-note', gesture: 'depth' },
        { selector: '.community-invitation h2', gesture: 'title' },
        { selector: '.community-invitation-copy', gesture: 'copy' },
        { selector: '.community-invitation-signoff' },
      ]

      let index = 0
      const cleanups = revealGroups.flatMap(({ selector, gesture }) =>
        [...page.querySelectorAll(selector)].map((target) => createScrollReveal(target, {
          id: `community-reveal-${index++}`,
          gesture,
          compact: conditions.compact,
        })),
      )

      // The page introduction exits as one editorial composition; its own load
      // choreography remains untouched and is immediately restored on reverse.
      gsap.fromTo(heroContent, { opacity: 1, y: 0 }, {
        opacity: 0,
        y: conditions.compact ? -8 : -22,
        ease: 'none',
        scrollTrigger: {
          id: 'community-hero-exit',
          trigger: hero,
          start: '55% top',
          end: 'bottom top',
          scrub: true,
          invalidateOnRefresh: true,
        },
      })

      return () => cleanups.forEach((cleanup) => cleanup())
    }, pageRef)

    return () => media.revert()
  }, [pageRef])
}
