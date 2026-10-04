import { useLayoutEffect } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { diveTransform, exitScale, heroLogoScale, heroTravelProgress, sampleContour } from '../lib/heroLogoZoom'
import { HERO_SCROLL_EVENT } from '../lib/homeHeroLines'
import { requestScrollRefresh } from '../lib/scrollRefresh'

gsap.registerPlugin(ScrollTrigger)

// Short landscape screens retain normal flow so the actions are reachable.
const PINNED = '(prefers-reduced-motion: no-preference) and (min-height: 500px)'
const FADED = '(prefers-reduced-motion: reduce), (max-height: 499.98px)'
const COPY = '.home-hero-brand, .home-hero h1, .home-hero-description, .home-hero-actions, .home-hero-foot'

export default function useHeroLogoScroll(stageRef) {
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined
    const media = gsap.matchMedia()
    media.add({ pinned: PINNED, faded: FADED }, ({ conditions }) => {
      const hero = stage.querySelector('.home-hero')
      const copy = gsap.utils.toArray(COPY, stage)
      const controls = gsap.utils.toArray('.home-hero-actions, .home-hero-foot', stage)
      const fill = stage.querySelector('.home-hero-mark .infinity-club-mark')
      const outline = stage.querySelector('.home-hero-mark-outline')
      // The beams' canvas keeps its own opacity (see HomeHeroLines): they fade
      // with the logo, not with the dimmed lines.
      const lines = gsap.utils.toArray('.home-hero-lines canvas:not(.home-hero-lines-beams), .home-hero-lines-still', stage)
      const next = stage.nextElementSibling
      stage.dataset.logoScroll = conditions.pinned ? 'pinned' : 'faded'
      requestScrollRefresh()

      const animated = [...copy, fill, outline, ...lines, ...(conditions.pinned && next ? [next] : [])]
      const promote = active => animated.forEach(node => {
        node.style.willChange = active ? (copy.includes(node) || node === next ? 'opacity, transform' : 'opacity') : ''
      })

      if (!conditions.pinned) {
        // One simple fade, no runway, pin or zoom. The next section stays
        // immediately after the Hero in the document, including reduced motion.
        const fade = { progress: 0 }
        const renderFade = (layoutChanged = false) => {
          hero.homeHeroScrollFrame = { progress: fade.progress, zoom: false, layoutChanged }
          hero.dispatchEvent(new CustomEvent(HERO_SCROLL_EVENT, { detail: hero.homeHeroScrollFrame }))
        }
        gsap.timeline({
          defaults: { ease: 'none', immediateRender: false },
          onUpdate: renderFade,
          scrollTrigger: {
            id: 'home-hero-logo', trigger: hero, start: 'top top', end: () => `+=${hero.offsetHeight / 2}`,
            scrub: true, invalidateOnRefresh: true,
            onToggle: ({ isActive }) => promote(isActive),
            onRefresh: ({ isActive }) => { promote(isActive); renderFade(true) },
          },
        })
          .to(fade, { progress: 1, duration: 1 }, 0)
          .to([...copy, fill], { opacity: 0, duration: 1 }, 0)
          .fromTo(lines, { opacity: 1 }, { opacity: 0, duration: 1 }, 0)
          .set(controls, { pointerEvents: 'none' }, .8)
        renderFade()
        return () => {
          promote(false)
          delete hero.homeHeroScrollFrame
          hero.dispatchEvent(new CustomEvent(HERO_SCROLL_EVENT, { detail: { progress: 0 } }))
          delete stage.dataset.logoScroll
        }
      }

      const runway = stage.querySelector('.home-hero-runway')
      const layer = outline.querySelector('g')
      const path = layer.querySelector('path')
      // The viewBox is fitted to the path, so the layer's box, its 50% 50%
      // transform-origin and the logo's geometric centre are the same point.
      const viewBox = outline.getAttribute('viewBox')
      const bounds = path.getBBox()
      outline.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`)
      const contour = sampleContour(path, [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2], 1024)
      const camera = { progress: 0 }
      let geometry

      // Layout reads happen on setup/refresh (resize included), never while
      // scrubbing. The logo is measured where it really is, untransformed.
      const measure = () => {
        const transform = layer.style.transform
        layer.style.transform = 'none'
        const logo = layer.getBoundingClientRect()
        const frame = hero.getBoundingClientRect()
        layer.style.transform = transform
        const height = Math.min(frame.height, innerHeight)
        const unit = logo.width / bounds.width
        // Logo centre, relative to the pinned Hero, and the translation that
        // puts it on the viewport centre: the zoom then exits evenly by all
        // four edges.
        const center = [logo.left - frame.left + logo.width / 2, logo.top - frame.top + logo.height / 2]
        const offset = [frame.width / 2 - center[0], height / 2 - center[1]]
        geometry = {
          center, offset, unit,
          scale: exitScale(contour, frame.width / 2 / unit, height / 2 / unit),
          incomingY: frame.height - runway.offsetHeight * .3,
        }
        // This static overlap puts the next section's native top exactly at
        // the viewport top when the sticky Hero releases and its y reaches 0.
        next?.style.setProperty('--home-hero-overlap', `${frame.height}px`)
      }
      const render = (layoutChanged = false) => {
        if (!geometry) return
        const { progress } = camera
        const travel = heroTravelProgress(progress)
        const { center, offset, unit, scale } = geometry
        const zoom = heroLogoScale(progress, scale)
        // Translation and scale on the same element (transform-origin 50% 50%),
        // in viewBox units since the layer lives inside the SVG.
        layer.style.transform = travel || zoom > 1 ? diveTransform(offset.map(value => value / unit), travel, zoom) : ''
        // The canvas pauses its ambient clock and draws from this scalar
        // progress. Its SVG fallback uses the exact same focal point.
        hero.homeHeroScrollFrame = {
          progress, focusX: center[0] + offset[0] * travel, focusY: center[1] + offset[1] * travel, layoutChanged,
        }
        hero.dispatchEvent(new CustomEvent(HERO_SCROLL_EVENT, { detail: hero.homeHeroScrollFrame }))
      }
      measure()

      const timeline = gsap.timeline({
        defaults: { ease: 'none', immediateRender: false },
        onUpdate: render,
        scrollTrigger: {
          id: 'home-hero-logo', trigger: stage, start: 'top top', end: () => `+=${runway.offsetHeight}`,
          scrub: true, invalidateOnRefresh: true, refreshPriority: 3,
          onToggle: ({ isActive }) => promote(isActive),
          onRefreshInit: measure,
          onRefresh: ({ isActive }) => { promote(isActive); render(true) },
        },
      })
        .to(camera, { progress: 1, duration: 1 }, 0)
        .fromTo(fill, { opacity: 1 }, { opacity: 0, duration: .15 }, 0)
        .fromTo(outline, { opacity: 0 }, { opacity: 1, duration: .15 }, 0)
        .to(copy, { opacity: 0, y: -24, duration: .15, ease: 'power1.in' }, 0)
        .set(controls, { pointerEvents: 'none' }, .15)
        .fromTo(lines, { opacity: 1 }, { opacity: .3, duration: .3, ease: 'power1.in' }, .15)
        // Full contour until .7, then gone by .9 while the next section covers the Hero.
        .to(outline, { opacity: 0, duration: .2 }, .7)
        .to(lines, { opacity: 0, duration: .3 }, .7)

      // Function-based values refresh with the layout, including when the
      // viewport changes before the section starts entering at progress .7.
      if (next) timeline
        .set(next, { y: () => geometry.incomingY, immediateRender: true }, 0)
        .to(next, { y: 0, duration: .3 }, .7)
      render()
      return () => {
        promote(false)
        layer.style.transform = ''
        outline.setAttribute('viewBox', viewBox)
        next?.style.removeProperty('--home-hero-overlap')
        delete hero.homeHeroScrollFrame
        hero.dispatchEvent(new CustomEvent(HERO_SCROLL_EVENT, { detail: { progress: 0 } }))
        delete stage.dataset.logoScroll
      }
    }, stage)
    return () => media.revert()
  }, [stageRef])
}
