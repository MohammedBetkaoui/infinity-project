import { ribbonPoint } from './homeHeroLines.js'

// One profile per breakpoint for the Home hero sequence. Desktop (from
// 1024px) holds the values the sequence was designed and validated with;
// phones and tablets get their own. The same media queries drive
// gsap.matchMedia (useHeroLogoScroll), window.matchMedia (HomeHeroLines) and
// the hero CSS, so a breakpoint means the same thing everywhere.
export const HERO_BREAKPOINTS = {
  mobile: '(max-width: 767.98px)',
  tablet: '(min-width: 768px) and (max-width: 1023.98px)',
  desktop: '(min-width: 1024px)',
}

// Portrait phones and tablets draw the infinity in a wide frame anchored on
// the logo. Touch screens from 1024px keep the compact frame they always had.
export const LINES_WIDE = '(max-width: 1023.98px) and (orientation: portrait)'
export const LINES_COMPACT = `${LINES_WIDE}, (min-width: 1024px) and (pointer: coarse)`

export const HERO_PROFILES = {
  desktop: {
    // Exits through its nearer edges; the contour fades over .7–.9.
    logoExit: 'frame',
    outlineFade: [.7, .9],
  },
  tablet: {
    logoExit: 'largest',
    // Gone by .72: no stray stroke of the logo as the next section arrives (.7).
    outlineFade: [.58, .72],
    // Frame width: from the viewport height, between these shares of its width.
    frame: { min: 1.3, perHeight: 1.05, max: 1.7 },
  },
  mobile: {
    // Exits through every edge, top and bottom included, and has faded out by
    // the time the next section starts to rise (.7), long before it covers
    // half the screen (~.85): no isolated stroke is ever left alone.
    logoExit: 'largest',
    outlineFade: [.56, .7],
    frame: { min: 2.2, perHeight: 1.11, max: 2.6 },
  },
}

// Desktop's proportions; the frame only flattens where the paragraph needs it.
const FRAME_ASPECT = 1.6
// Gap kept between the paragraph and the highest fibre beneath it, including
// the curves' slow breathing (±0.4% of the frame height).
const TEXT_CLEARANCE = 12
const COMPACT_FIBRES = 4

// How high, as a share of the frame height, the compact fibres' upper
// branches rise above the crossing within this share of the frame width on
// either side of its centre.
export function upperReach(halfWidthShare) {
  let reach = 0
  for (let line = 0; line < COMPACT_FIBRES; line++) {
    for (const side of [-1, 1]) {
      for (let step = 0; step <= 480; step++) {
        const { x, y } = ribbonPoint(step / 480, side, line, 0, true)
        if (Math.abs(x - .5) <= halfWidthShare) reach = Math.max(reach, .5 - y)
      }
    }
  }
  return reach
}

// Wide frame for portrait screens, in CSS pixels of the Hero: sized from the
// viewport height within the profile's range, centred, crossing on the logo,
// and low enough for no fibre to cross the paragraph above it.
export function portraitFrame(profile, hero, crossing, text) {
  const { min, perHeight, max } = profile.frame
  const width = Math.min(max * hero.width, Math.max(min * hero.width, perHeight * hero.height))
  let height = width / FRAME_ASPECT
  const reach = text ? upperReach(text.halfWidth / width) : 0
  if (reach > 0) height = Math.min(height, (crossing - text.bottom - TEXT_CLEARANCE) / reach)
  // A layout leaving no room at all still gets a readable, flatter symbol.
  return { width, height: Math.max(height, width / 4), crossing }
}
