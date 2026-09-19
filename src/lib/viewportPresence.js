import gsap from 'gsap'
import { VIEWPORT_MOTION } from './animationSettings'

// Viewport presence for viewport-triggered reveals. A block shows once it is
// a little way into view and hides only once it is completely out of view —
// below the fold, or tucked under the fixed header. The gap between the two
// thresholds is hysteresis: a thumb hesitating on the edge never makes a line
// flicker. IntersectionObserver follows real geometry, so there is no scroll
// handler, nothing to refresh after layout shifts, and sticky blocks are
// tracked for free — identical on wheel, Lenis and touch momentum.

const records = new Map()
const observerPairs = new Map()
// Last known presence per element, kept across rebuilds: an FAQ toggle or a
// re-split on resize re-creates the watchers, and text already on screen must
// stay put instead of replaying its entrance.
const lastState = new WeakMap()

function headerInset() {
  const header = document.querySelector('.site-header')
  if (!header || getComputedStyle(header).position !== 'fixed') return 0
  return Math.max(0, Math.round(header.getBoundingClientRect().bottom))
}

// 'above' when the block pokes out of (or sits beyond) the top edge; anything
// else — entering from the bottom, or appearing mid-screen as an accordion
// opens — rises from below. Collapsed or display:none blocks count as below.
function sideOf({ boundingClientRect: rect, rootBounds }) {
  if (!rect.width && !rect.height) return 'below'
  return rect.top < (rootBounds?.top ?? 0) ? 'above' : 'below'
}

function onShow(entries) {
  entries
    .filter((entry) => entry.isIntersecting
      && [...(records.get(entry.target)?.watchers || [])].some((watcher) => watcher.state !== 'in'))
    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
    .forEach((entry, index) => {
      const cascade = Math.min(index * VIEWPORT_MOTION.cascade, VIEWPORT_MOTION.cascadeMax)
      records.get(entry.target)?.watchers.forEach((watcher) => watcher.enter(cascade, sideOf(entry)))
    })
}

function onHide(entries) {
  entries.forEach((entry) => {
    if (entry.isIntersecting) return
    records.get(entry.target)?.watchers.forEach((watcher) => watcher.leave(sideOf(entry)))
  })
}

function observersFor(inset) {
  let pair = observerPairs.get(inset)
  if (!pair) {
    pair = {
      show: new IntersectionObserver(onShow, { rootMargin: `-${inset}px 0px -${VIEWPORT_MOTION.enterDepth} 0px` }),
      hide: new IntersectionObserver(onHide, { rootMargin: `-${inset}px 0px 0px 0px` }),
    }
    observerPairs.set(inset, pair)
  }
  return pair
}

// `hidden(side)` and `shown` are GSAP vars for `animated` (the element itself,
// its words, or its curtain); `enter`/`exit` add duration, ease and stagger.
// Returns an unwatch function that leaves `animated` in its shown state, so a
// scene switched off (reduced motion, route change) never strands hidden content.
export function watchPresence(target, { animated = target, hidden, shown, enter, exit, delay = 0, once = false }) {
  if (typeof IntersectionObserver === 'undefined') {
    gsap.set(animated, shown)
    return () => {}
  }
  let tween = null
  let leaving = false
  let attached = true
  const remember = (state) => {
    watcher.state = state
    lastState.set(target, state)
  }
  const watcher = {
    state: lastState.get(target) || 'below',
    enter(cascade, from) {
      if (watcher.state === 'in') return
      // Reversed mid-exit: carry on from where the words are. Otherwise start
      // from the edge the block comes in by — scrolling back up, text drops in.
      const interrupted = leaving && tween?.isActive()
      tween?.kill()
      if (!interrupted) gsap.set(animated, hidden(from))
      leaving = false
      remember('in')
      tween = gsap.to(animated, { ...shown, ...enter, delay: cascade + delay })
      if (once) detach()
    },
    leave(side) {
      if (watcher.state === side || (once && watcher.state === 'in')) return
      const wasIn = watcher.state === 'in'
      tween?.kill()
      remember(side)
      // Only a block that was on screen gets an exit; it is already out of
      // view, so the short fade is a safety net, not a performance.
      leaving = wasIn
      tween = wasIn ? gsap.to(animated, { ...hidden(side), ...exit }) : null
      if (!wasIn) gsap.set(animated, hidden(side))
    },
  }
  gsap.set(animated, watcher.state === 'in' ? shown : hidden(watcher.state))

  let record = records.get(target)
  if (!record) {
    record = { watchers: new Set(), observers: observersFor(headerInset()) }
    records.set(target, record)
    record.observers.show.observe(target)
    record.observers.hide.observe(target)
  }
  record.watchers.add(watcher)

  function detach() {
    if (!attached) return
    attached = false
    record.watchers.delete(watcher)
    if (record.watchers.size || records.get(target) !== record) return
    records.delete(target)
    record.observers.show.unobserve(target)
    record.observers.hide.unobserve(target)
  }

  return () => {
    detach()
    tween?.kill()
    gsap.set(animated, shown)
  }
}
