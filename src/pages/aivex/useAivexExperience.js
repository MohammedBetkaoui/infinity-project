import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import useScrollAnimations from '../../hooks/useScrollAnimations'

gsap.registerPlugin(ScrollTrigger)

export default function useAivexExperience(pageRef, ready) {
  const introPlayed = useRef(false)
  useScrollAnimations(pageRef, (motion) => {
    const root = pageRef.current
    // Every section shares the Home presence choreography (rise on entry the
    // moment the block is on screen, hide only once fully out of view) — not
    // just the big h2 titles. Display nodes use word masks, body copy uses
    // line illumination; the scrubbed gallery, scene and code study keep
    // their own motion (see below).
    // Sticky companions first: the gallery and preparation intros stay pinned
    // below the header while their document position travels on, so any exit
    // would dissolve them mid-screen. They enter once (`once: true`) and
    // hold — the header masks them naturally when they finally release.
    root.querySelectorAll('.ax-gallery-intro h2, .ax-preparation-intro h2')
      .forEach((title) => motion.revealText(title, { once: true }))
    root.querySelectorAll([
      '.ax-gallery-description', '.ax-gallery-edition span', '.ax-gallery-reading-note p',
      '.ax-preparation-intro > p', '.ax-tracker-heading span',
    ].join(',')).forEach((copy) => motion.revealText(copy, { once: true, type: 'lines' }))
    // Same rule for the sticky intro link: enter once, hold while pinned.
    root.querySelectorAll(['.ax-gallery-reading-note a'].join(','))
      .forEach((control) => motion.revealText(control, { once: true, drift: false }))
    root.querySelectorAll('.ax-tracker-reset')
      .forEach((control) => motion.revealText(control, { once: true, drift: false }))
    root.querySelectorAll('h2:not([data-animated-text])').forEach((title) => motion.revealText(title))
    // h3/h4 across workbench, project board and process panel, plus the BBA
    // signature (decorative display text, not inside a control).
    root.querySelectorAll('.ax-workbench-top h3, .ax-project-feature h3, .ax-project-note h3, .ax-process-copy h4, .ax-bba-signature > span')
      .forEach((title) => motion.revealText(title))
    // Editorial text living inside interactive ancestors (revealAllText skips
    // button/label subtrees): target the inner span/strong, never the control.
    // Tab labels get the same display choreography as every other heading.
    // drift:false keeps controls pinned to their layout box — only words move.
    root.querySelectorAll('.ax-faq-item h3 > button > span:first-child, .ax-preparation-copy strong, .ax-process-tab-label')
      .forEach((title) => motion.revealText(title, { drift: false }))
    // Buttons and links outside the hero/header/gallery artifacts share the
    // same display choreography. Hero keeps its load intro, the fixed header
    // and the scrubbed gallery/scene controls keep their own motion.
    root.querySelectorAll([
      '.ax-details-actions .ax-button', '.ax-details-actions .ax-text-link',
      '.ax-footer-contact .ax-button',
      '.ax-challenge-heading .ax-text-link',
      '.ax-organisation-copy .ax-text-link',
      '.ax-faq-intro .ax-text-link',
    ].join(',')).forEach((control) => motion.revealText(control, { drift: false }))
    // Body copy: the three manifesto/challenge/footer leads plus every small
    // editorial span revealAllText never selects (spans/smalls are outside its
    // h/p/blockquote/dt/dd sweep). Live regions (.ax-tracker status), numeric
    // counts, code lines, scene captions and gallery controls keep their own
    // motion and stay untouched here.
    root.querySelectorAll('.ax-manifesto-copy > p, .ax-challenge-heading > div > p, .ax-footer-contact > p')
      .forEach((copy) => motion.revealText(copy, { type: 'lines' }))
    root.querySelectorAll([
      '.ax-preparation-copy span[id^="ax-prep-note-"]',
      '.ax-bba-signature small',
      '.ax-university strong', '.ax-university span',
      '.ax-footer-contact > span',
    ].join(',')).forEach((copy) => motion.revealText(copy, { type: 'lines' }))
    motion.revealSection('.ax-document-study', { mode: 'wipe', color: '#efede8' })
    root.querySelectorAll('.ax-project-note').forEach((note) => motion.revealSection(note, { mode: 'depth' }))
    // Cards enter with the same depth choreography as the project notes; the
    // fixed header then masks them naturally, so nothing fades mid-viewport.
    // Code study, scene and hero keep their own motion.
    // The album panel enters like a card; its photographs keep their own
    // scroll-driven crossfades inside.
    motion.revealSection('.ax-gallery-panel', { mode: 'depth' })
    // Institutional stamp: same fade-in language, entered once and held —
    // it lives in the sticky intro, so a scrubbed exit would dissolve it
    // mid-screen while pinned (see note above).
    motion.revealSection('.ax-gallery-partner', { mode: 'fade', once: true })
    if (!motion.reduced) {
      const panel = root.querySelector('.ax-gallery-panel')
      const track = root.querySelector('.ax-gallery-track')
      if (panel && track) {
        // After the last photograph the stuck panel releases and tucks behind
        // the fixed header: long hold, then a short dissolve in the final
        // stretch only — the same exit language as the texts. Plain `.to`
        // tweens (no immediate render) so the entry reveal owns the panel
        // before that; ranges never overlap it.
        const release = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            id: 'aivex-gallery-release', trigger: track,
            start: 'bottom bottom', end: 'bottom top+=96',
            scrub: true, invalidateOnRefresh: true,
          },
        })
        release.to(panel, { y: -6, duration: 2.4 }, 0)
        release.to(panel, { opacity: 0, y: -14, duration: 0.35 }, 2.35)
      }
    }
    motion.revealSection('.ax-project-feature', { mode: 'depth' })
    motion.revealSection('.ax-process-panel', { mode: 'depth' })
    motion.revealSection('.ax-announcement', { mode: 'depth' })
    motion.revealSection('.ax-preparation-tracker', { mode: 'depth' })
    motion.revealSection('.ax-university', { mode: 'depth' })
    motion.revealSection('.ax-fact', { mode: 'depth', trigger: '.ax-facts', stagger: .08 })
    motion.revealSection('.ax-preparation-item', { mode: 'depth', trigger: '.ax-preparation-list', stagger: .06 })
    motion.revealSection('.ax-faq-item', { mode: 'depth', trigger: '.ax-faq-list', stagger: .06 })
    motion.revealSection('.ax-footer-home', { mode: 'depth' })
    motion.revealAllText()
    motion.parallaxElement('.ax-footer-cross', -.16, { rotation: 9 })
  }, { enabled: ready })

  useLayoutEffect(() => {
    const root = pageRef.current
    const html = document.documentElement
    const description = document.querySelector('meta[name="description"]')
    const theme = document.querySelector('meta[name="theme-color"]')
    const favicon = document.querySelector('#site-favicon')
    const previous = { title: document.title, description: description?.content, theme: theme?.content, favicon: favicon?.getAttribute('href'), page: html.dataset.page }
    document.title = 'AIVEX | National AI Competition, Second Edition'
    if (description) description.content = 'AIVEX, the second edition of the national artificial intelligence application programming competition, organised by Infinity Club in BBA.'
    if (theme) theme.content = '#111111'
    if (favicon) favicon.setAttribute('href', '/aivex-favicon.svg')
    html.dataset.page = 'aivex'
    const context = gsap.context(() => {
      gsap.to('.ax-scroll-progress', {
        scaleX: 1, ease: 'none',
        scrollTrigger: { id: 'aivex-progress', start: 0, end: 'max', scrub: true },
      })
    }, root)
    return () => {
      context.revert()
      document.title = previous.title
      if (description) description.content = previous.description
      if (theme) theme.content = previous.theme
      if (favicon && previous.favicon) favicon.setAttribute('href', previous.favicon)
      if (previous.page === undefined) delete html.dataset.page
      else html.dataset.page = previous.page
    }
  }, [pageRef])

  useLayoutEffect(() => {
    if (!ready || introPlayed.current || location.hash || window.scrollY >= 100) return
    const media = gsap.matchMedia()
    const play = () => media.add('(prefers-reduced-motion: no-preference)', () => {
      // The Hero starts when the loader leaves, not underneath its two-second hold.
      // Same intro on every viewport, phones included. The statement waits for
      // the loader's letters to settle into the Hero logo (see
      // useAivexLogoHandoff), so nothing rises underneath the flight.
      const intro = gsap.timeline({ defaults: { ease: 'power4.out' }, onComplete: () => { introPlayed.current = true } })
      intro.from('.ax-scene-reveal', { rotationY: -16, rotationX: 6, z: -80, duration: 1.36 }, .12)
      intro
        .from('.ax-art-reveal', { opacity: 0, duration: .88 }, .18)
        .from('.ax-orbit-arc', { strokeDashoffset: 1, duration: 1.1, ease: 'power3.inOut' }, .2)
        .from('.ax-title-line', { yPercent: 110, duration: .72, stagger: .085 }, .78)
        .from('.ax-intro-detail', { opacity: 0, y: 6, duration: .56, stagger: .035, clearProps: 'transform' }, 1.02)
      const finishIntro = () => { if (window.scrollY > 32 && intro.progress() < 1) intro.progress(1) }
      window.addEventListener('scroll', finishIntro, { passive: true })
      return () => window.removeEventListener('scroll', finishIntro)
    }, pageRef)
    // Same start frame as the loader's logo flight, after the stall of the
    // ready commit, so the two timelines stay in step (see useAivexLogoHandoff).
    // The loader still covers the Hero until then.
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(play) })
    return () => {
      cancelAnimationFrame(frame)
      media.revert()
    }
  }, [pageRef, ready])
}
