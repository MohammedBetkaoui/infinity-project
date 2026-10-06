import { useEffect, useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SCROLL_MOTION } from '../../../lib/animationSettings'
import { useAnimationContext } from '../../../lib/AnimationContext'
import { requestScrollRefresh } from '../../../lib/scrollRefresh'

gsap.registerPlugin(ScrollTrigger)

// Timeline progress where each act begins: the screen as an object (0), the
// camera approach, immersion in the film, the exit; the film is at rest by
// `settled` and the section releases at 1.
export const FILM_PHASES = { approach: .16, immersive: .46, exit: .72, settled: .97 }

const MOTION = '(prefers-reduced-motion: no-preference)'
const QUERIES = {
  // Landscape screens get the spatial room; portrait screens a centred one.
  cinematic: `${MOTION} and (min-width: 768px) and (min-height: 560px) and (min-aspect-ratio: 11/10)`,
  compact: `${MOTION} and (max-width: 767px), ${MOTION} and (max-height: 559px), ${MOTION} and (max-aspect-ratio: 11/10)`,
  wide: '(min-width: 1024px)',
  tablet: '(min-width: 600px)',
  coarse: '(pointer: coarse)',
  // Pointer drift only where a mouse hovers.
  pointer: `${MOTION} and (min-width: 1024px) and (hover: hover) and (pointer: fine)`,
}

// Camera presets. depth: how far back the screen starts (px); object: its
// projected width as a share of the immersive frame; attitudes are
// [rotationX, rotationY, roll] in degrees; radius: visible corner radius
// as an object, immersed and at rest.
const LOOKS = {
  spatial: { perspective: 1200, depth: 520, object: .7, tilt: [9.5, -7.5, -1], settle: [8.5, -6.5, -.7], rest: [-1.5, 3.5, -1], breathe: 12, radius: [24, 4, 14] },
  gentle: { perspective: 1500, depth: 360, object: .72, tilt: [6, -4.5, -.6], settle: [5.2, -3.8, -.4], rest: [-1, 2.2, -.6], breathe: 8, radius: [20, 4, 12] },
  tablet: { perspective: 1100, depth: 150, object: .9, tilt: [4.5, -2.5, -.4], settle: [3.8, -2, -.3], rest: [1.5, 0, 0], breathe: 0, radius: [18, 6, 12] },
  phone: { perspective: 1000, depth: 60, object: .94, tilt: [2, 0, 0], settle: [1.6, 0, 0], rest: [1, 0, 0], breathe: 0, radius: [14, 0, 10] },
}

// Scroll moves the camera around the film; playback never follows scroll.
// Reduced motion matches no mode: the section keeps its static flow layout.
export default function useOpenDayFilmMotion(sectionRef, playing) {
  const lenis = useAnimationContext()
  const playingRef = useRef(playing)
  const controls = useRef({ present() {}, settle() {} })

  useEffect(() => {
    playingRef.current = playing
    controls.current.settle()
  }, [playing])

  useLayoutEffect(() => {
    const section = sectionRef.current
    const media = gsap.matchMedia()
    media.add(QUERIES, ({ conditions }) => {
      if (!conditions.cinematic && !conditions.compact) return undefined
      return buildRoom(section, conditions, { lenis, playingRef, controls: controls.current })
    }, section)
    return () => media.revert()
  }, [sectionRef, lenis])

  return controls
}

// Layout position inside `ancestor`, read through offsets: transforms ignored.
function offsetWithin(element, ancestor) {
  const position = { left: 0, top: 0 }
  for (let node = element; node && node !== ancestor; node = node.offsetParent) {
    position.left += node.offsetLeft
    position.top += node.offsetTop
  }
  return position
}

function buildRoom(section, { cinematic, wide, tablet, coarse, pointer }, { lenis, playingRef, controls }) {
  const q = gsap.utils.selector(section)
  const one = (selector) => q(selector)[0]
  const space = one('.od-feature-space')
  const stage = one('.od-feature-stage')
  const heading = one('.od-feature-heading')
  const scene = one('.od-feature-scene')
  const rig = one('.od-feature-rig')
  const tilt = one('.od-feature-tilt')
  const frame = one('.od-feature-frame')
  const scenes = one('.od-feature-scenes')
  // Wide landscape screens hand the film to the field notes: that section
  // slides under the stage and keeps a slot for it in its left column.
  const next = cinematic && wide && section.nextElementSibling?.matches('.od-intro') ? section.nextElementSibling : null
  const register = next?.querySelector('.od-intro-register')
  const nextCopy = next?.querySelector('.od-intro-layout > :last-child')
  const handoff = Boolean(register && nextCopy)
  const look = LOOKS[cinematic ? (wide && !coarse ? 'spatial' : 'gentle') : (tablet ? 'tablet' : 'phone')]
  section.dataset.filmMode = cinematic ? 'cinematic' : 'compact'
  section.toggleAttribute('data-film-handoff', handoff)
  gsap.set(scene, { perspective: `${look.perspective}px` })

  // The camera model: a rig at depth z appears scaled by P / (P - z) toward
  // the perspective origin. Each state is solved for where it should appear.
  // Geometry is read from layout and cached until the next refresh, so
  // resizes, orientation changes and late fonts re-measure.
  let geometry = null
  const forget = () => { geometry = null }
  const depthScale = (z) => look.perspective / (look.perspective - z)
  const measure = () => {
    if (geometry) return geometry
    const room = { width: stage.clientWidth, height: stage.clientHeight }
    const width = frame.offsetWidth
    const height = frame.offsetHeight
    const sceneAt = offsetWithin(scene, stage)
    const [originX, originY] = getComputedStyle(scene).perspectiveOrigin.split(' ').map(parseFloat)
    const origin = { x: sceneAt.left + originX, y: sceneAt.top + originY }
    const rigAt = offsetWithin(rig, stage)
    const center = { x: rigAt.left + width / 2, y: rigAt.top + height / 2 }
    const place = (target, z) => {
      const k = depthScale(z)
      return { x: (target.x - origin.x) / k + origin.x - center.x, y: (target.y - origin.y) / k + origin.y - center.y, z }
    }
    let object
    let settle
    let immersed
    let rest
    let shift = 0
    if (cinematic) {
      // Object: centred in the space the title and the scene index leave.
      const top = heading.offsetTop + heading.offsetHeight
      const bottom = scenes.offsetTop
      const visible = Math.min(width * look.object, (bottom - top - 64) / height * width)
      const target = { x: room.width / 2, y: (top + bottom) / 2 }
      object = { ...place({ x: target.x, y: target.y + room.height * .025 }, -look.depth), scale: visible / (depthScale(-look.depth) * width) }
      settle = { ...place(target, 70 - look.depth), scale: object.scale }
      immersed = { x: 0, y: 0 }
      if (handoff) {
        // At release the field notes' top meets the stage's; the film lands in
        // the slot their left column reserves above the date register.
        const introTop = room.height - (space.getBoundingClientRect().bottom - next.getBoundingClientRect().top)
        const slotWidth = register.offsetWidth
        const slot = { x: next.getBoundingClientRect().left + register.offsetLeft + slotWidth / 2, y: introTop + register.offsetTop + slotWidth * height / width / 2 }
        rest = { ...place(slot, -40), scale: slotWidth / (depthScale(-40) * width) }
      } else {
        rest = { ...place({ x: room.width * .44, y: center.y - room.height * .04 }, -40), scale: .8 / depthScale(-40) }
      }
    } else {
      // Portrait: the film is the centre of a compact cluster. As the
      // paragraph leaves, the title and the film close the gap from both
      // sides, so the cluster stays tight and centred.
      const intro = heading.querySelector('.od-feature-intro')
      shift = (intro.offsetHeight + (parseFloat(getComputedStyle(heading).rowGap) || 0)) / 2
      object = { ...place(center, -look.depth), scale: look.object / depthScale(-look.depth) }
      settle = { ...place(center, Math.min(0, 30 - look.depth)), scale: object.scale }
      immersed = place({ x: center.x, y: center.y - shift }, 0)
      rest = { ...place({ x: center.x, y: center.y - shift - room.height * .015 }, 0), scale: .95 }
    }
    const projected = (state) => state.scale * depthScale(state.z)
    geometry = {
      object, settle, immersed, rest, shift,
      radius: { object: look.radius[0] / projected(object), immersed: look.radius[1], rest: look.radius[2] / projected(rest) },
      // The play card shrinks less than the screen, so it stays legible.
      counter: { object: projected(object) ** -.6, rest: projected(rest) ** -.6 },
    }
    return geometry
  }
  ScrollTrigger.addEventListener('refreshInit', forget)
  const get = (read) => () => read(measure())

  const { approach, immersive, exit, settled } = FILM_PHASES
  const timeline = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      id: 'open-day-film', trigger: space, start: 'top top', end: 'bottom bottom',
      scrub: SCROLL_MOTION.pinScrub, invalidateOnRefresh: true,
      onToggle: (self) => section.toggleAttribute('data-film-active', self.isActive),
    },
  })

  // Act 1, the object: a screen suspended in the room, leaning back.
  timeline.fromTo(rig, {
    x: get((m) => m.object.x), y: get((m) => m.object.y), z: get((m) => m.object.z), scale: get((m) => m.object.scale),
    rotationX: look.tilt[0], rotationY: look.tilt[1], rotation: look.tilt[2],
  }, {
    x: get((m) => m.settle.x), y: get((m) => m.settle.y), z: get((m) => m.settle.z),
    rotationX: look.settle[0], rotationY: look.settle[1], rotation: look.settle[2], duration: approach, ease: 'sine.inOut',
  }, 0)
  // Act 2, the approach: the camera pushes in. Depth does most of the growing,
  // so the near edge swells faster than the far one while the attitude levels.
  timeline.to(rig, { x: get((m) => m.immersed.x), y: get((m) => m.immersed.y), z: 0, scale: 1, duration: immersive - approach, ease: 'power2.inOut' }, approach)
  timeline.to(rig, { rotationX: 0, rotationY: 0, rotation: 0, duration: (immersive - approach) * .92, ease: 'power1.inOut' }, approach)
  // Act 3, immersion: the screen holds the room, breathing a little closer.
  if (look.breathe) timeline.to(rig, { z: look.breathe, duration: exit - immersive, ease: 'sine.inOut' }, immersive)
  // Act 4, the exit: the room collapses back into an object at rest.
  timeline.to(rig, {
    x: get((m) => m.rest.x), y: get((m) => m.rest.y), z: get((m) => m.rest.z), scale: get((m) => m.rest.scale),
    rotationX: look.rest[0], rotationY: look.rest[1], rotation: look.rest[2], duration: settled - exit, ease: 'power3.inOut',
  }, exit)

  // The screen's surface: radius, edge light, crop marks, its shadow plate.
  timeline.fromTo(frame, { borderRadius: get((m) => m.radius.object) }, { borderRadius: get((m) => m.radius.immersed), duration: immersive - approach, ease: 'power1.in' }, approach)
  timeline.to(frame, { borderRadius: get((m) => m.radius.rest), duration: settled - exit, ease: 'power1.out' }, exit)
  timeline.fromTo('.od-feature-edge', { opacity: 1 }, { opacity: .22, duration: immersive - approach }, approach)
  timeline.to('.od-feature-edge', { opacity: .7, duration: settled - exit }, exit)
  timeline.fromTo('.od-feature-marks', { opacity: 1 }, { opacity: 0, duration: .14 }, approach)
  timeline.fromTo('.od-feature-shadow', { z: -70, y: 40, scale: .93, opacity: .9 }, { y: 92, scale: 1.12, opacity: .62, duration: .14, ease: 'sine.out' }, approach)
  timeline.to('.od-feature-shadow', { y: 30, scale: 1.03, opacity: .24, duration: immersive - approach - .14 }, approach + .14)
  timeline.to('.od-feature-shadow', { y: 22, scale: .98, opacity: handoff ? .6 : .45, duration: settled - exit }, exit)
  timeline.fromTo('.od-feature-play-inner', { z: 36, scale: get((m) => m.counter.object), transformOrigin: '0% 100%' }, { scale: 1, duration: immersive - approach, ease: 'power2.inOut' }, approach)
  timeline.to('.od-feature-play-inner', { scale: get((m) => m.counter.rest), duration: settled - exit, ease: 'power3.inOut' }, exit)

  // The page recedes while the screen comes forward. Each plane leaves at
  // its own pace and distance. Text fades by opacity, so assistive tech and
  // find-in-page still reach it, and stops catching the pointer once gone;
  // the scene buttons hide fully. On portrait screens the title and the
  // scene index stay as quiet anchors around the film.
  const recede = (target, vars, position, duration) => {
    timeline.to(target, { ...vars, opacity: 0, duration, ease: 'power1.in' }, position)
    timeline.set(target, { pointerEvents: 'none' }, position + duration)
  }
  if (cinematic) {
    recede('.od-feature-intro', { x: 10, y: () => -stage.clientHeight * .01 }, .12, .16)
    recede('.od-feature-kicker', { y: () => -stage.clientHeight * .02, scale: .97, transformOrigin: '0% 100%' }, .14, .16)
    recede('#od-feature-title', { y: () => -stage.clientHeight * .06, scale: .93, transformOrigin: '0% 100%' }, .18, .24)
    timeline.to(scenes, { y: () => stage.clientHeight * .025, scale: .98, autoAlpha: 0, transformOrigin: '50% 100%', duration: .17, ease: 'power1.in' }, .15)
  } else {
    timeline.to('.od-feature-intro', { y: -8, autoAlpha: 0, duration: .14, ease: 'power1.in' }, .12)
    timeline.to(heading, { y: get((m) => m.shift), duration: immersive - approach, ease: 'power2.inOut' }, approach)
    timeline.to('.od-feature-kicker, #od-feature-title', { opacity: .35, duration: .22, ease: 'power1.in' }, .16)
    timeline.to(scenes, { y: get((m) => 6 - m.shift), opacity: .45, duration: immersive - approach, ease: 'power2.inOut' }, approach)
    timeline.to('.od-feature-kicker, #od-feature-title', { opacity: .8, duration: settled - exit }, exit)
    timeline.to(scenes, { opacity: .8, duration: settled - exit }, exit)
  }

  // The room: the screen becomes its light source as the page goes dark.
  timeline.fromTo('.od-feature-deep', { opacity: 0 }, { opacity: 1, duration: immersive - approach }, approach)
  timeline.fromTo('.od-feature-vignette', { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: .24 }, .22)
  timeline.fromTo('.od-feature-glow', { opacity: 0, scale: .8 }, { opacity: 1, scale: 1, duration: .26 }, .22)
  timeline.fromTo('.od-feature-credits', { autoAlpha: 0 }, { autoAlpha: 1, duration: .06 }, immersive - .04)
  // The screening ends: the credits leave and the lights come up a touch...
  timeline.to('.od-feature-credits', { autoAlpha: 0, duration: .04 }, exit)
  timeline.to('.od-feature-deep, .od-feature-vignette, .od-feature-glow', { opacity: 0, duration: .07 }, exit)
  if (handoff) {
    // ...then the room lifts like a curtain off the field notes beneath, and
    // their opening column arrives from the side the film has left.
    timeline.fromTo('.od-feature-atmosphere', { y: 0 }, { y: () => -stage.clientHeight * 1.26, duration: settled - exit - .04, ease: 'power2.inOut' }, exit + .04)
    timeline.to('.od-feature-play-copy .od-label', { autoAlpha: 0, duration: .08 }, exit + .06)
    timeline.fromTo(nextCopy, { x: () => stage.clientWidth * .05, opacity: 0 }, { x: 0, opacity: 1, duration: 1 - exit - .08, ease: 'power2.out' }, exit + .08)
  }
  timeline.set({}, {}, 1)

  // Pointer micro-parallax on two planes, damped by quickTo: the screen
  // tilts toward the pointer, the title plane drifts less and the other way.
  // It fades out through the approach and stays still while the film plays.
  let pointerX = 0
  let pointerY = 0
  let near = false
  let quiet = false
  let influence = 0
  const drift = pointer && cinematic ? {
    screen: ['rotationX', 'rotationY', 'x', 'y'].map((property) => gsap.quickTo(tilt, property, { duration: .9, ease: 'power3.out' })),
    title: ['x', 'y'].map((property) => gsap.quickTo(heading, property, { duration: 1.2, ease: 'power3.out' })),
  } : null
  const settle = () => {
    if (!drift) return
    const next = playingRef.current || !near || document.hidden ? 0 : gsap.utils.clamp(0, 1, 1 - (timeline.progress() - approach) / .24)
    if (!next && !influence) return
    influence = next
    drift.screen[0](-pointerY * .8 * influence)
    drift.screen[1](pointerX * 1.25 * influence)
    drift.screen[2](pointerX * 5 * influence)
    drift.screen[3](pointerY * 4 * influence)
    drift.title[0](-pointerX * 3 * influence)
    drift.title[1](-pointerY * 2 * influence)
  }
  // While the film holds the room the site header goes quiet (styled in
  // open-day-film.css); it stays fully usable.
  timeline.eventCallback('onUpdate', () => {
    const immersed = timeline.progress() > .4 && timeline.progress() < .74
    if (immersed !== quiet) {
      quiet = immersed
      document.documentElement.toggleAttribute('data-od-film-immersed', immersed)
    }
    settle()
  })
  const move = (event) => {
    pointerX = event.clientX / innerWidth * 2 - 1
    pointerY = event.clientY / innerHeight * 2 - 1
    settle()
  }
  const watcher = drift && new IntersectionObserver(([entry]) => { near = entry.isIntersecting; settle() })
  if (drift) {
    watcher.observe(space)
    window.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('visibilitychange', settle)
  }

  // Play from anywhere in the section: bring the camera into the screen first.
  controls.present = () => {
    const trigger = timeline.scrollTrigger
    if (!trigger || (trigger.progress >= immersive && trigger.progress <= exit)) return
    const top = trigger.start + (trigger.end - trigger.start) * (immersive + .1)
    if (lenis.current) lenis.current.scrollTo(top, { duration: 1.2, force: true })
    else window.scrollTo({ top, behavior: 'smooth' })
  }
  controls.settle = settle
  requestScrollRefresh()

  return () => {
    ScrollTrigger.removeEventListener('refreshInit', forget)
    window.removeEventListener('pointermove', move)
    document.removeEventListener('visibilitychange', settle)
    watcher?.disconnect()
    document.documentElement.removeAttribute('data-od-film-immersed')
    controls.present = () => {}
    controls.settle = () => {}
    delete section.dataset.filmMode
    section.removeAttribute('data-film-handoff')
    section.removeAttribute('data-film-active')
    requestScrollRefresh()
  }
}
