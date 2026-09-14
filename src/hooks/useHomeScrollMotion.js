import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { createScrollReveal } from '../lib/scrollReveal'

gsap.registerPlugin(ScrollTrigger)

export default function useHomeScrollMotion(mainRef) {
  useLayoutEffect(() => {
    const media = gsap.matchMedia()
    media.add({
      motion: '(prefers-reduced-motion: no-preference)',
      desktop: '(min-width: 1024px)',
    }, ({ conditions }) => {
      if (!conditions.motion) return
      const main = mainRef.current
      const stage = main.querySelector('.poles-stage')
      const underline = main.querySelector('#contact h2 svg path')
      const revealGroups = [
        { selector: '#poles .section-intro', gesture: 'title' },
        { selector: '.poles-stage', trigger: '#poles > .page-container' },
        { selector: '.poles-note', gesture: 'copy' },
        { selector: '.home-events-heading', gesture: 'title' },
        { selector: '.home-event-visual' },
        { selector: '.home-event-editorial', gesture: 'copy' },
        { selector: '.club-moments' },
        { selector: '.club-life-copy h2', gesture: 'title' },
        { selector: '.club-life-copy > p, .club-life-values li', gesture: 'copy' },
        { selector: '.club-life-link' },
        { selector: '.home-faq-intro', trigger: '#faq', gesture: 'title' },
        { selector: '.home-faq-item', gesture: 'copy' },
        { selector: '.contact-layout > div:first-child', gesture: 'title' },
        { selector: '.contact-invitation', gesture: 'copy' },
        { selector: '.contact-bottom' },
      ]
      let revealIndex = 0
      const cleanups = revealGroups.flatMap(({ selector, trigger, gesture }) =>
        [...main.querySelectorAll(selector)].map((target) => createScrollReveal(target, {
          id: `home-reveal-${revealIndex++}`, gesture,
          trigger: trigger ? main.querySelector(trigger) : target,
          compact: !conditions.desktop,
        })),
      )

      // The workshop tilts into a readable plane. Its tabs remain in normal document flow.
      gsap.fromTo(stage, {
        y: conditions.desktop ? 24 : 8,
        rotationX: conditions.desktop ? 5.2 : 0,
        scale: conditions.desktop ? .985 : 1,
      }, {
        y: 0, rotationX: 0, scale: 1, ease: 'none',
        scrollTrigger: {
          id: 'home-workshop', trigger: stage.parentElement, start: 'top 86%', end: 'top 22%',
          scrub: true, invalidateOnRefresh: true,
        },
      })

      // The invitation's handwritten underline is the closing gesture, not another section reveal.
      const length = underline.getTotalLength()
      gsap.fromTo(underline, { strokeDasharray: length, strokeDashoffset: length }, {
        strokeDashoffset: 0, ease: 'none',
        scrollTrigger: {
          id: 'home-invitation', trigger: '#contact', start: 'top 88%', end: 'top 37%',
          scrub: true, invalidateOnRefresh: true,
        },
      })
      return () => cleanups.forEach((cleanup) => cleanup())
    }, mainRef)
    return () => media.revert()
  }, [mainRef])
}
