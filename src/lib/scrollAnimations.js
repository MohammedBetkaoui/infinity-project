import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { SCROLL_MOTION } from './animationSettings'
import { requestScrollRefresh } from './scrollRefresh'

gsap.registerPlugin(ScrollTrigger, SplitText)

export function createScrollAnimations(scope, { compact, reduced, canPin }) {
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
    if (!target || reduced || target.dataset.motionText === 'active') return null
    target.dataset.motionText = 'active'
    cleanups.push(() => { delete target.dataset.motionText })
    const type = compact ? 'lines' : options.type || 'words'
    const split = SplitText.create(target, {
      type: type === 'words' ? 'lines,words' : 'lines',
      mask: 'lines', autoSplit: true, aria: 'auto',
      linesClass: 'motion-text-line', wordsClass: 'motion-text-word',
      ignore: 'svg, .sr-only',
      onSplit: (instance) => {
        const parts = type === 'words' ? instance.words : instance.lines
        // Initialise the whole line before the stagger: later words must not flash before their turn.
        gsap.set(parts, { yPercent: compact ? 35 : 108, opacity: 0 })
        const tween = gsap.to(parts, {
          yPercent: 0, opacity: 1, duration: SCROLL_MOTION.textDuration,
          stagger: type === 'words' ? SCROLL_MOTION.textStagger : SCROLL_MOTION.lineStagger,
          ease: SCROLL_MOTION.ease,
          ...(options.scroll === false ? { delay: options.delay || 0 } : { scrollTrigger: settings(target, options) }),
        })
        requestScrollRefresh()
        return tween
      },
    })
    cleanups.push(() => split.revert())
    return split
  }

  function revealSection(ref, options = {}) {
    const targets = elements(ref)
    if (!targets.length || reduced) return null
    const mode = compact ? 'fade' : options.mode || 'depth'
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
      opacity: 0, y: compact ? 9 : 28,
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
    const distance = () => (compact ? Math.min(12, innerHeight * Math.abs(speed) * .08) : innerHeight * Math.abs(speed) * .18) * Math.sign(speed)
    return gsap.fromTo(target, { [axis]: () => -distance(), rotation: options.rotation ? -options.rotation : 0 }, {
      [axis]: distance, rotation: compact ? 0 : options.rotation || 0,
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
      value, duration: compact ? .82 : 1.28, delay: options.delay || 0, ease: 'expo.out',
      onUpdate: () => render(state.value), onComplete: () => render(value),
      scrollTrigger: { trigger: target, start: 'top 88%', once: true },
    })
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
        pinSpacing: true, scrub: SCROLL_MOTION.pinScrub, anticipatePin: 1,
        invalidateOnRefresh: true, refreshPriority: 2, id: options.id,
      },
    })
  }

  return {
    gsap, ScrollTrigger, compact, reduced, canPin, select, element,
    revealText, revealSection, parallaxElement, countUp, pinSection,
    cleanup: () => { cleanups.reverse().forEach((cleanup) => cleanup()) },
  }
}
