import { Component, createElement, createRef, useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import { useEffectiveReducedMotion } from './AdminPreferences'

gsap.registerPlugin(Flip)

// Motion for the administration. Every helper animates transform and opacity
// only, stays between 0.2 s and 0.6 s, cleans up with gsap.context().revert(),
// and does nothing when reduced motion is in effect (preference or OS).
const EASE_OUT = 'power3.out'

export const useReducedMotion = useEffectiveReducedMotion

const directionOf = (node) => (node && getComputedStyle(node).direction === 'rtl' ? -1 : 1)

// GSAP anchors a new tween to the frame it last drew. After a long React commit
// (a whole page rendering at once) that frame is stale and the first part of
// the motion would be skipped, so the clock is brought up to date first.
const syncClock = () => gsap.ticker.tick()

const motionContext = (build, scope) => {
  syncClock()
  return gsap.context(build, scope)
}

// Staggers are capped so a long list still settles in well under a second.
const MAX_SPREAD = .3
const staggerStep = (base, count) => Math.min(base, MAX_SPREAD / Math.max(1, count - 1))

const cascadeIn = (items) => gsap.from(items, { autoAlpha: 0, y: 16, duration: .45, stagger: staggerStep(.05, items.length), ease: EASE_OUT, clearProps: 'opacity,visibility,transform' })

// Panels arrive in a short cascade once their content is ready.
// Card grids use FlipGrid instead, which also handles later changes.
export function useCascade(scopeRef, selector, ready = true) {
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    const scope = scopeRef.current
    if (!ready || reduced || !scope) return undefined
    const context = motionContext(() => {
      const items = scope.querySelectorAll(selector)
      if (items.length) cascadeIn(items)
    }, scope)
    return () => context.revert()
  }, [ready, reduced, scopeRef, selector])
}

// A route change fades the new page in. Opacity only, so fixed dialogs inside
// the page keep the viewport as their containing block.
export function usePageFade(ref, key) {
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    const node = ref.current
    if (reduced || !node) return undefined
    const context = motionContext(() => {
      gsap.from(node, { opacity: 0, duration: .3, ease: 'power1.out', clearProps: 'opacity' })
    }, node)
    return () => context.revert()
  }, [key, reduced, ref])
}

// Bars rise (or fill) from inside their own clipped track: the shape never stretches.
export function useGrow(scopeRef, selector, key) {
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    const scope = scopeRef.current
    if (reduced || !scope) return undefined
    const context = motionContext(() => {
      // Measure every track before the first write so the layout is computed once.
      const bars = [...scope.querySelectorAll(selector)]
      const vertical = bars.map((bar) => bar.parentElement && bar.parentElement.clientHeight > bar.parentElement.clientWidth)
      const direction = directionOf(scope)
      const rise = staggerStep(.025, bars.length)
      const fill = staggerStep(.04, bars.length)
      bars.forEach((bar, index) => {
        gsap.from(bar, vertical[index]
          ? { yPercent: 101, duration: .55, delay: index * rise, ease: EASE_OUT }
          : { xPercent: -101 * direction, duration: .6, delay: index * fill, ease: EASE_OUT })
      })
    }, scope)
    return () => context.revert()
  }, [key, reduced, scopeRef, selector])
}

// The donut is drawn clockwise by two half-plane masks rotating into place.
export function useDonutReveal(scopeRef, key) {
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    const scope = scopeRef.current
    if (reduced || !scope) return undefined
    const context = motionContext(() => {
      const right = scope.querySelector('.adm-donut__sweep.is-right')
      const left = scope.querySelector('.adm-donut__sweep.is-left')
      if (!right || !left) return
      gsap.timeline()
        .from(right, { rotation: -180, svgOrigin: '75 75', duration: .3, ease: 'power1.in' })
        .from(left, { rotation: -180, svgOrigin: '75 75', duration: .3, ease: 'power1.out' })
      gsap.from(scope.querySelector('.adm-donut__total'), { opacity: 0, scale: .9, duration: .4, delay: .2, ease: EASE_OUT, clearProps: 'opacity,transform' })
    }, scope)
    return () => context.revert()
  }, [key, reduced, scopeRef])
}

// The gauge arc sweeps up from its left end, clipped to the upper half.
export function useGaugeReveal(scopeRef, key) {
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    const scope = scopeRef.current
    if (reduced || !scope) return undefined
    const context = motionContext(() => {
      const fill = scope.querySelector('.adm-gauge__fill')
      if (fill) gsap.from(fill, { rotation: -180, svgOrigin: '90 90', duration: .6, ease: 'power2.out' })
    }, scope)
    return () => context.revert()
  }, [key, reduced, scopeRef])
}

// Counts the text of an aria-hidden node up on mount and whenever the value
// changes (Refresh data). Pair it with a visually hidden final value so
// screen readers never hear the intermediate numbers (see AnimatedNumber.jsx).
export function useCountUp(ref, value, suffix = '') {
  const shown = useRef(null)
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    const node = ref.current
    const target = Number(value)
    if (!node) return undefined
    if (reduced || !Number.isFinite(target)) {
      shown.current = target
      node.textContent = `${value}${suffix}`
      return undefined
    }
    const state = { value: Number.isFinite(shown.current) ? shown.current : 0 }
    if (state.value === target) {
      node.textContent = `${value}${suffix}`
      return undefined
    }
    node.textContent = `${Math.round(state.value)}${suffix}`
    syncClock()
    const tween = gsap.to(state, {
      value: target,
      duration: .6,
      ease: 'power2.out',
      onUpdate: () => { node.textContent = `${Math.round(state.value)}${suffix}` },
      onComplete: () => { shown.current = target },
    })
    return () => {
      shown.current = state.value
      tween.kill()
    }
  }, [reduced, ref, suffix, value])
}

// Card grids. Cards cascade in when they first appear (on mount, or after an
// empty or loading state) and glide to their new place when the set or order
// changes (GSAP Flip). getSnapshotBeforeUpdate reads positions just before
// React touches the DOM.
const EMPTY = Symbol('empty')

class FlipGroup extends Component {
  constructor(props) {
    super(props)
    this.node = createRef()
  }

  items() {
    return [...this.node.current.querySelectorAll('[data-flip-id]')]
  }

  enter(elements) {
    if (this.props.reduced || !elements.length) return
    this.motion.add(() => { this.entrance = cascadeIn(elements) })
  }

  componentDidMount() {
    this.motion = gsap.context(() => {}, this.node.current)
    syncClock()
    this.enter(this.items())
  }

  getSnapshotBeforeUpdate(previous) {
    if (this.props.reduced || previous.flipKey === this.props.flipKey || !this.node.current) return null
    const items = this.items()
    if (!items.length) return EMPTY
    // Cards still arriving settle first, so Flip measures where they really sit.
    this.entrance?.progress(1)
    return Flip.getState(items)
  }

  componentDidUpdate(_props, _state, snapshot) {
    if (!snapshot || !this.node.current) return
    syncClock()
    if (snapshot === EMPTY) {
      this.enter(this.items())
      return
    }
    this.motion.add(() => {
      Flip.from(snapshot, {
        targets: this.items(),
        duration: .5,
        ease: 'power3.inOut',
        zIndex: 5,
        onEnter: (elements) => { this.enter(elements) },
      })
    })
  }

  // Reverting (not just killing) leaves the cards clean if StrictMode remounts.
  componentWillUnmount() {
    this.motion?.revert()
  }

  render() {
    const { as = 'div', className, children } = this.props
    return createElement(as, { ref: this.node, className }, children)
  }
}

export function FlipGrid(props) {
  const reduced = useReducedMotion()
  return createElement(FlipGroup, { ...props, reduced })
}

// Leaving dialogs, drawers and toasts: React has already removed the element,
// so a short-lived inert copy plays the exit. The confidential viewer opts out
// so no copy of a private document is ever made.
function playExit(node, parent, rect, animate) {
  if (!parent?.isConnected) return
  const ghost = node.cloneNode(true)
  ghost.setAttribute('aria-hidden', 'true')
  ghost.setAttribute('inert', '')
  ghost.removeAttribute('id')
  ghost.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'))
  Object.assign(ghost.style, { pointerEvents: 'none' })
  if (rect) Object.assign(ghost.style, { position: 'fixed', top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, margin: '0' })
  parent.appendChild(ghost)
  syncClock()
  animate(ghost).eventCallback('onComplete', () => ghost.remove())
}

export function useDialogMotion(ref, { kind = 'modal', active = true, exit = true } = {}) {
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    const node = ref.current
    if (!active || reduced || !node) return undefined
    const parent = node.parentNode
    const rtl = directionOf(node)
    const panelSelector = kind === 'drawer' ? '.adm-drawer' : '.adm-modal'
    const backdropSelector = kind === 'drawer' ? '.adm-drawer-scrim' : null
    const context = motionContext(() => {
      const panel = node.matches(panelSelector) ? node : node.querySelector(panelSelector)
      const backdrop = backdropSelector ? node.querySelector(backdropSelector) : node
      gsap.from(backdrop, { opacity: 0, duration: .22, ease: 'power1.out', clearProps: 'opacity' })
      gsap.from(panel, kind === 'drawer'
        ? { x: 44 * rtl, opacity: 0, duration: .38, ease: EASE_OUT, clearProps: 'opacity,transform' }
        : { y: 18, scale: .97, opacity: 0, duration: .32, ease: EASE_OUT, clearProps: 'opacity,transform' })
    }, node)
    return () => {
      context.revert()
      if (!exit) return
      // StrictMode re-runs effects on a node that stays mounted; only animate a real removal.
      queueMicrotask(() => {
        if (node.isConnected) return
        playExit(node, parent, null, (ghost) => {
          const panel = ghost.matches(panelSelector) ? ghost : ghost.querySelector(panelSelector)
          const backdrop = backdropSelector ? ghost.querySelector(backdropSelector) : ghost
          const timeline = gsap.timeline()
          timeline.to(panel, kind === 'drawer'
            ? { x: 44 * rtl, opacity: 0, duration: .24, ease: 'power2.in' }
            : { y: 12, scale: .98, opacity: 0, duration: .2, ease: 'power2.in' }, 0)
          if (backdrop && backdrop !== panel) timeline.to(backdrop, { opacity: 0, duration: .22, ease: 'power1.in' }, 0)
          return timeline
        })
      })
    }
  }, [active, exit, kind, reduced, ref])
}

export function useToastMotion(ref) {
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    const node = ref.current
    if (reduced || !node) return undefined
    const parent = node.parentNode
    const context = motionContext(() => {
      gsap.from(node, { y: 16, opacity: 0, scale: .96, duration: .3, ease: EASE_OUT, clearProps: 'opacity,transform' })
    }, node)
    return () => {
      // Read the toast's place now: by the time the microtask runs it is gone.
      const rect = node.isConnected ? node.getBoundingClientRect() : null
      context.revert()
      queueMicrotask(() => {
        if (node.isConnected || !rect) return
        playExit(node, parent, rect, (ghost) => gsap.to(ghost, { y: 10, opacity: 0, duration: .22, ease: 'power2.in' }))
      })
    }
  }, [reduced, ref])
}
