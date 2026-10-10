import useScrollAnimations from '../../../hooks/useScrollAnimations'

// The projector opening plays once, and only for a screen still below the
// fold: a visitor who arrives lower (anchor, back navigation) finds the film
// open. Lamp line, flicker, the gate parts, then the strip and the play disc.
function armProjector({ gsap, ScrollTrigger }, scope) {
  const frame = scope.querySelector('.od-feature-frame')
  if (!frame || frame.getBoundingClientRect().top <= window.innerHeight * .9) return
  const q = gsap.utils.selector(scope)
  const parts = q('.od-feature-shutter, .od-feature-slit, .od-feature-flash')
  const settled = q('.od-feature-play-disc, .od-feature-play-copy > *, .od-feature-credit, .od-feature-leak')

  gsap.set(parts, { visibility: 'visible' })
  gsap.set(q('.od-feature-slit'), { scaleX: 0 })
  gsap.set(q('.od-feature-flash'), { opacity: 0 })
  gsap.set(q('.od-feature-leak'), { xPercent: -100, opacity: 0 })
  gsap.set(q('.od-strip-drift'), { x: 70, opacity: 0 })
  gsap.set(q('.od-feature-play-disc'), { scale: .6, opacity: 0 })
  gsap.set(q('.od-feature-play-copy > *'), { y: 14, opacity: 0 })
  gsap.set(q('.od-feature-credit'), { opacity: 0 })

  const opening = gsap.timeline({
    paused: true,
    defaults: { ease: 'expo.out' },
    // Hand everything back to the base CSS: hover states and the hidden gate.
    onComplete: () => gsap.set([...parts, ...settled], { clearProps: 'all' }),
  })
  opening
    .to(q('.od-feature-leak'), { xPercent: 170, duration: 1.3, ease: 'power2.inOut' }, 0)
    .to(q('.od-feature-leak'), { keyframes: [{ opacity: 1, duration: .3 }, { opacity: 1, duration: .55 }, { opacity: 0, duration: .45 }], ease: 'none' }, 0)
    .to(q('.od-feature-slit'), { scaleX: 1, duration: .45 }, .12)
    .to(q('.od-feature-flash'), { keyframes: [{ opacity: .75, duration: .05 }, { opacity: .12, duration: .07 }, { opacity: .45, duration: .05 }, { opacity: 0, duration: .45 }], ease: 'none' }, .5)
    .to(q('.od-feature-shutter--top'), { yPercent: -101, duration: .9, ease: 'expo.inOut' }, .45)
    .to(q('.od-feature-shutter--bottom'), { yPercent: 101, duration: .9, ease: 'expo.inOut' }, .45)
    .to(q('.od-feature-slit'), { opacity: 0, duration: .4, ease: 'power1.out' }, .6)
    .to(q('.od-strip-drift'), { x: 0, opacity: 1, duration: 1.3 }, .7)
    .to(q('.od-feature-play-disc'), { scale: 1, opacity: 1, duration: .9, ease: 'back.out(1.5)' }, .95)
    .to(q('.od-feature-play-copy > *'), { y: 0, opacity: 1, duration: .7, stagger: .07 }, 1)
    .to(q('.od-feature-credit'), { opacity: 1, duration: .6 }, 1.1)
  ScrollTrigger.create({ trigger: frame, start: 'center 75%', once: true, onEnter: () => opening.play() })
}

// Every photograph is exposed once, in the film's language: the shutter lifts
// off the frame, the lens pulls focus, then the caption rule draws and the
// marks settle. Like the projector, only frames still below the fold are
// armed; anything already in view keeps the base CSS untouched.
function exposePhotos({ gsap, ScrollTrigger }, scope) {
  scope.querySelectorAll('.od-photo-media, .od-sheet-image button').forEach((media) => {
    if (media.getBoundingClientRect().top <= window.innerHeight * .92) return
    const shutter = media.querySelector('.od-photo-shutter')
    const lens = media.querySelector('.od-photo-lens')
    const marks = [...media.querySelectorAll('.od-photo-corner, .od-frame-code')]
    const caption = media.closest('figure')?.querySelector('figcaption')
    const lines = caption ? [...caption.children] : []
    const touched = [shutter, lens, ...marks, caption, ...lines].filter(Boolean)

    gsap.set(shutter, { visibility: 'visible' })
    // The hover transition would drag the focus pull; clearProps restores it.
    gsap.set(lens, { scale: 1.22, transition: 'none' })
    gsap.set(marks, { opacity: 0, transition: 'none' })
    if (caption) gsap.set(caption, { '--od-rule': 0 })
    gsap.set(lines, { opacity: 0, y: 10 })

    const exposure = gsap.timeline({ paused: true, onComplete: () => gsap.set(touched, { clearProps: 'all' }) })
    exposure
      .to(shutter, { scaleY: 0, duration: 1.05, ease: 'expo.inOut' }, 0)
      .to(lens, { scale: 1, duration: 1.7, ease: 'expo.out' }, .2)
      .to(marks, { opacity: 1, duration: .5, stagger: .08 }, .85)
    if (caption) exposure.to(caption, { '--od-rule': 1, duration: .9, ease: 'expo.inOut' }, .55)
    exposure.to(lines, { opacity: 1, y: 0, duration: .8, ease: 'expo.out', stagger: .06 }, .75)
    ScrollTrigger.create({ trigger: media, start: 'top 82%', once: true, onEnter: () => exposure.play() })
  })
}

export default function useOpenDayMotion(pageRef) {
  useScrollAnimations(pageRef, (motion) => {
    const { gsap, reduced, compact } = motion

    // Every reveal starts from fully usable base CSS. The shared motion layer
    // owns cleanup and responds live when reduced motion changes.
    motion.revealSection('.od-hero-image', { mode: 'horizontal', color: '#002a1e', once: true })
    motion.revealSection('.od-date > span', { mode: 'fade', trigger: pageRef.current.querySelector('.od-date'), stagger: .08, once: true })
    motion.revealSection('.od-feature-context > *, .od-feature-chapters > *', { mode: 'fade', trigger: pageRef.current.querySelector('.od-feature-layout'), stagger: .07, once: true })
    motion.revealSection('.od-intro-copy > p, .od-play-heading > p, .od-spin-copy > p, .od-gallery-note, .od-closing-bottom > *', { mode: 'fade', once: true })

    pageRef.current.querySelectorAll('.od-intro h2, .od-moment-copy h3, .od-play h2, .od-spin h2, .od-gallery h2, .od-closing h2, .od-feature-heading h2')
      .forEach((heading) => motion.revealText(heading, { once: true, drift: false }))
    if (reduced) return
    armProjector(motion, pageRef.current)
    exposePhotos(motion, pageRef.current)

    const intro = gsap.timeline({ defaults: { ease: 'expo.out' } })
    intro
      .from('.od-rail', { opacity: 0, y: -12, duration: .7 }, 0)
      .from('.od-hero-copy > .od-label', { opacity: 0, y: 12, duration: .65 }, .08)
      .from('.od-title-word', { yPercent: 108, rotation: 2, duration: 1.05, stagger: .13 }, .12)
      .from('.od-hero-lead', { opacity: 0, y: 18, duration: .7 }, .46)
      .from('.od-hero-actions', { opacity: 0, y: 12, duration: .7 }, .58)
      .from('.od-hero-foot', { opacity: 0, duration: .7 }, .7)

    // Camera move: each photograph drifts inside its frame as the page moves,
    // alternating sideways so the sheet never slides as one block. The 1.12
    // scale keeps the drift inside the crop, so no edge ever shows.
    pageRef.current.querySelectorAll('.od-photo-lens img').forEach((image, index) => {
      const drift = index % 2 ? -1 : 1
      gsap.fromTo(image, { scale: 1.12, yPercent: -4, xPercent: -drift }, {
        yPercent: 4,
        xPercent: drift,
        ease: 'none',
        scrollTrigger: { trigger: image.parentElement, start: 'top bottom', end: 'bottom top', scrub: .6 },
      })
    })

    if (!compact) {
      gsap.to('.od-hero-print', { y: -34, rotation: .8, ease: 'none', scrollTrigger: { trigger: '.od-hero', start: 'top top', end: 'bottom top', scrub: .7 } })
      gsap.fromTo('.od-feature-heading', { y: 18 }, { y: -18, ease: 'none', scrollTrigger: { trigger: '.od-feature', start: 'top bottom', end: 'bottom top', scrub: .65 } })
      // A slow dolly-in: the screen settles to full size as it reaches the middle.
      gsap.fromTo('.od-feature-stage', { scale: .93 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.od-feature-layout', start: 'top bottom', end: 'center center', scrub: .6 } })
      // The strip is pulled through the gate as the page moves.
      gsap.fromTo('.od-strip-drift', { y: 46 }, { y: -46, ease: 'none', scrollTrigger: { trigger: '.od-feature-layout', start: 'top bottom', end: 'bottom top', scrub: .8 } })
      pageRef.current.querySelectorAll('.od-margin-note, .od-intro-register').forEach((note) => {
        gsap.fromTo(note, { x: -10 }, { x: 0, ease: 'none', scrollTrigger: { trigger: note, start: 'top 85%', end: 'top 45%', scrub: .5 } })
      })
    }
  })
}
