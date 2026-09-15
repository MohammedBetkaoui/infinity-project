import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { SCROLL_MOTION } from './animationSettings'
import { requestScrollRefresh } from './scrollRefresh'

gsap.registerPlugin(ScrollTrigger, SplitText)

// One choreography on every viewport: phones play the same masked rises,
// tilts, depth, wipes and parallax as desktop. `compact` survives only as an
// API field (responsive hooks may still read it); nothing below branches on it.
export function createScrollAnimations(scope, { reduced, canPin }) {
  const cleanups = []
  const select = gsap.utils.selector(scope)
  const element = (ref) => typeof ref === 'string' ? select(ref)[0] : ref?.current || ref
  const elements = (ref) => typeof ref === 'string' ? select(ref) : gsap.utils.toArray(ref?.current || ref)
  const settings = (target, options) => ({
    trigger: element(options.trigger) || target,
    start: options.start || SCROLL_MOTION.start,
    end: options.end || SCROLL_MOTION.end,
    // Direct scrubbing for small reveals; only the signature pin uses a one-second catch-up.
    scrub: options.scrub ?? true,
    invalidateOnRefresh: true,
    id: options.id,
    ...(options.once ? { scrub: false, once: true } : {}),
  })

  function revealText(ref, options = {}) {
    const target = element(ref)
    if (!target || reduced || target.dataset.motionText) return null
    // Display headings rise word by word inside line masks; body copy
    // illuminates word by word like an editorial reading state.
    const reading = (options.type || 'words') !== 'words'
    target.dataset.motionText = reading ? 'reading' : 'display'
    cleanups.push(() => { delete target.dataset.motionText })
    const split = SplitText.create(target, {
      type: 'lines,words',
      mask: 'lines', autoSplit: true, aria: 'auto',
      linesClass: 'motion-text-line', wordsClass: 'motion-text-word',
      ignore: 'svg, .sr-only',
      onSplit: (instance) => {
        const words = instance.words
        if (!words.length) return null
        // Load-time intro (heroes): same choreography, played once on a clock.
        if (options.scroll === false) {
          gsap.set(words, { yPercent: 115, rotation: 5, opacity: 0, transformOrigin: '0% 100%' })
          const intro = gsap.to(words, {
            yPercent: 0, rotation: 0, opacity: 1,
            duration: reading ? 0.9 : 1.05,
            stagger: reading ? 0.02 : 0.045,
            ease: SCROLL_MOTION.introEase,
            delay: options.delay || 0,
          })
          requestScrollRefresh()
          return intro
        }
        // Explicit one-shot escape hatch (API compat): enter only, no exit.
        if (options.once) {
          gsap.set(words, reading
            ? { opacity: SCROLL_MOTION.readingDim, y: 0 }
            : { yPercent: 115, rotation: 0, opacity: 0, transformOrigin: '0% 100%' })
          const once = gsap.to(words, {
            yPercent: 0, rotation: 0, opacity: 1, y: 0,
            duration: SCROLL_MOTION.textDuration,
            stagger: reading ? SCROLL_MOTION.lineStagger : SCROLL_MOTION.textStagger,
            ease: SCROLL_MOTION.ease,
            scrollTrigger: { trigger: element(options.trigger) || target, start: options.start || 'top 88%', once: true, id: options.id },
          })
          requestScrollRefresh()
          return once
        }
        // Scroll-driven scenes: one scrubbed timeline covers entry AND exit,
        // so scrolling back up replays the hide in reverse. This is what
        // separates a scroll story from a generic reveal-once fade.
        if (!reading) {
          gsap.set(words, { yPercent: 118, rotation: SCROLL_MOTION.displayTilt, opacity: 0, transformOrigin: '0% 100%' })
          // Entry length grows with word count (duration + stagger tail), so
          // the exit is positioned after the real end of entry plus a reading
          // hold — never at a fixed offset that long headings never reach.
          const enterStagger = SCROLL_MOTION.displayEnterStagger
          const enterEnd = 1 + enterStagger * Math.max(0, words.length - 1)
          const hold = 1.1
          const exitDur = 0.4
          const scene = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
              trigger: element(options.trigger) || target,
              start: options.start || SCROLL_MOTION.displayStart,
              end: options.end || SCROLL_MOTION.displayEnd,
              scrub: (options.scrub ?? SCROLL_MOTION.displayScrub),
              invalidateOnRefresh: true,
              id: options.id,
            },
          })
          // Act 1 — masked rise with a whisper of tilt, word after word.
          // drift:false pins the box to its layout position (buttons, tab
          // labels): only the words travel, the control never floats.
          scene.to(words, {
            yPercent: 0, rotation: 0, opacity: 1, duration: 1,
            stagger: enterStagger,
            ease: 'power4.out',
          }, 0)
          // Act 2 — masked dissolve toward the top, tilted the other way.
          // Runs only in the final stretch, when the block slides behind
          // the fixed navbar.
          scene.to(words, {
            yPercent: -118, rotation: -4, opacity: 0, duration: exitDur,
            stagger: SCROLL_MOTION.displayExitStagger,
            ease: 'power3.in',
          }, enterEnd + hold)
          // The whole heading breathes upward while it is read.
          if (options.drift !== false) {
            scene.fromTo(target, { y: 16 }, { y: -16, duration: scene.duration(), ease: 'power1.inOut' }, 0)
          }
          requestScrollRefresh()
          return scene
        }
        gsap.set(words, { opacity: SCROLL_MOTION.readingDim, y: 8 })
        // Same rule for body copy: a 30-word paragraph spreads its entry over
        // ~3.4 units, so a fixed exit at 1.45 would cut the illumination
        // mid-sentence. Exit starts after entry end + hold instead.
        const readingEnterEnd = 1 + SCROLL_MOTION.readingWordStagger * Math.max(0, words.length - 1)
        const readingHold = 1.4
        const readingExitDur = 0.3
        const scene = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: element(options.trigger) || target,
            start: options.start || SCROLL_MOTION.readingStart,
            end: options.end || SCROLL_MOTION.readingEnd,
              scrub: (options.scrub ?? SCROLL_MOTION.readingScrub),
            invalidateOnRefresh: true,
            id: options.id,
          },
        })
        // Act 1 — each word lights up as the scroll reaches it.
        scene.to(words, {
          opacity: 1, y: 0, duration: 1,
          stagger: SCROLL_MOTION.readingWordStagger,
          ease: 'power2.out',
        }, 0)
        // Act 2 — the read block holds fully legible, then lifts and dims
        // only while sliding behind the fixed navbar.
        scene.to(target, {
          opacity: 0, y: -14, duration: readingExitDur, ease: 'power2.in',
        }, readingEnterEnd + readingHold)
        requestScrollRefresh()
        return scene
      },
    })
    cleanups.push(() => split.revert())
    return split
  }

  function revealSection(ref, options = {}) {
    const targets = elements(ref)
    if (!targets.length || reduced) return null
    const mode = options.mode || 'depth'
    targets.forEach((target) => {
      target.dataset.motionReveal = mode
      cleanups.push(() => { delete target.dataset.motionReveal })
    })
    const trigger = settings(targets[0], options)
    if (mode === 'wipe' || mode === 'horizontal') {
      // A solid curtain uncovers the content using transform only. No animated clip-path or blur.
      const curtains = targets.map((target) => {
        const curtain = document.createElement('span')
        curtain.className = 'motion-curtain'
        curtain.setAttribute('aria-hidden', 'true')
        if (options.color) curtain.style.background = options.color
        target.classList.add('motion-wipe-surface')
        target.append(curtain)
        cleanups.push(() => { curtain.remove(); target.classList.remove('motion-wipe-surface') })
        return curtain
      })
      return gsap.fromTo(curtains, { scaleX: 1, scaleY: 1 }, {
        [mode === 'horizontal' ? 'scaleX' : 'scaleY']: 0,
        transformOrigin: mode === 'horizontal' ? 'right center' : 'center top',
        stagger: options.stagger ?? .1, ease: 'power3.inOut', scrollTrigger: trigger,
      })
    }
    gsap.set(targets, {
      opacity: 0, y: 28,
      rotationX: mode === 'depth' ? -5 : 0,
      scale: mode === 'depth' ? .985 : 1,
      transformPerspective: mode === 'depth' ? 1200 : 0,
    })
    return gsap.to(targets, {
      opacity: 1, y: 0, rotationX: 0, scale: 1,
      duration: SCROLL_MOTION.revealDuration, stagger: options.stagger ?? .1,
      ease: SCROLL_MOTION.ease, scrollTrigger: trigger,
    })
  }

  function parallaxElement(ref, speed = .2, options = {}) {
    const target = element(ref)
    if (!target || reduced) return null
    const axis = options.axis || 'y'
    const distance = () => innerHeight * Math.abs(speed) * .18 * Math.sign(speed)
    return gsap.fromTo(target, { [axis]: () => -distance(), rotation: options.rotation ? -options.rotation : 0 }, {
      [axis]: distance, rotation: options.rotation || 0,
      ease: 'none', scrollTrigger: settings(target, { start: 'top bottom', end: 'bottom top', ...options }),
    })
  }

  function countUp(ref, value, options = {}) {
    const target = element(ref)
    if (!target || !Number.isFinite(value)) return null
    const original = target.textContent
    const format = options.format || ((number) => Math.round(number).toLocaleString('en-GB'))
    const render = (number) => { target.textContent = `${format(number)}${options.suffix || ''}` }
    cleanups.push(() => { target.textContent = original })
    if (reduced) { render(value); return null }
    const state = { value: 0 }
    render(0)
    return gsap.to(state, {
      value, duration: 1.28, delay: options.delay || 0, ease: 'expo.out',
      onUpdate: () => render(state.value), onComplete: () => render(value),
      scrollTrigger: { trigger: target, start: 'top 88%', once: true },
    })
  }

  // Every editorial line earns the scroll choreography, not just hero titles:
  // headings rise and dissolve, copy illuminates word by word, both directions.
  // Controls, heroes with their own intro, scrubbed artifacts (gallery track,
  // notebook, code study, carousel frames) and Framer-owned regions
  // (accordions, tab panels) are deliberately left to their own motion.
  // Note: the gallery *intro* (.ax-gallery-intro) stays animatable — only the
  // scrubbed album (.ax-gallery-track / panel / bottom) is excluded.
  const ALL_TEXT_EXCLUDE = [
    'button', '[role="button"]', 'input', 'textarea', 'select', 'label',
    '.ax-gallery-track', '.ax-gallery-panel', '.ax-gallery-bottom', '.ax-gallery-rail',
    '.ax-hero', '.home-hero', '.page-hero',
    '.workshop-notes', '.ax-code-study', '.ax-scene',
    '.team-stage', '.team-frame', '.mobile-menu',
    'dialog', '[role="dialog"]', '[data-lenis-prevent]',
    '.site-header', '.site-nav', '.ax-header', 'nav',
    '.community-numbers dd', '.motion-counter', '.sr-only',
    '[id^="faq-panel"]', '[id^="ax-answer-"]', '[id^="pole-panel-"]',
  ].join(',')

  function revealAllText() {
    const root = scope
    if (!root || typeof root.querySelectorAll !== 'function' || reduced) return 0
    const eligible = (node) => {
      if (node.dataset.motionText || node.dataset.animatedText) return false
      if (node.closest('[data-motion-text],[data-animated-text]')) return false
      if (node.closest(ALL_TEXT_EXCLUDE)) return false
      if (node.closest('[hidden]')) return false
      // Never restructure a subtree that CONTAINS a control (e.g. an h3
      // wrapping an accordion button): SplitText reparenting there detaches
      // React's event wiring while native listeners keep firing. Animate the
      // inner text span directly instead (see useAivexExperience).
      if (node.querySelector('button, a[href], input, textarea, select, [role="button"]')) return false
      if (node.getClientRects().length === 0) return false
      return (node.textContent || '').trim().length >= 3
    }
    let count = 0
    root.querySelectorAll('h1,h2,h3,h4,.poster-title').forEach((node) => {
      if (!eligible(node)) return
      revealText(node, { type: 'words' })
      count += 1
    })
    root.querySelectorAll('p,blockquote,figcaption,dt,dd').forEach((node) => {
      if (!eligible(node)) return
      revealText(node, { type: 'lines' })
      count += 1
    })
    return count
  }

  function pinSection(ref, duration = .7, options = {}) {
    const target = element(ref)
    if (!target || !canPin || reduced) return null
    return gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: target, pin: element(options.pin) || target,
        start: options.start || 'top top', end: () => `+=${Math.round(innerHeight * duration)}`,
        // Pin spacing is real narrative time. Keep duration below one viewport for the Home hero.
        pinSpacing: options.pinSpacing ?? true,
        scrub: options.scrub ?? SCROLL_MOTION.pinScrub,
        anticipatePin: 1,
        invalidateOnRefresh: true, refreshPriority: 2, id: options.id,
      },
    })
  }

  return {
    gsap, ScrollTrigger, reduced, canPin, select, element,
    revealText, revealAllText, revealSection, parallaxElement, countUp, pinSection,
    cleanup: () => { cleanups.reverse().forEach((cleanup) => cleanup()) },
  }
}
