import { PORTRAIT_ASPECT } from './homeHeroLines.js'

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

// Portrait phones and tablets draw the portrait variant of the symbol
// (homeHeroLines). Touch screens from 1024px keep the compact frame they
// always had; everything else draws the desktop symbol.
export const LINES_PORTRAIT = '(max-width: 1023.98px) and (orientation: portrait)'
export const LINES_COMPACT = '(min-width: 1024px) and (pointer: coarse)'

export const HERO_PROFILES = {
  desktop: {
    // Exits through its nearer edges; the contour fades over .7–.9 while
    // the next section covers the Hero.
    logoExit: 'frame',
    outlineFade: [.7, .9],
  },
  tablet: {
    // The desktop rule for the dissolve; the exit is sized on the largest
    // side, so the logo also leaves by the top and the bottom.
    logoExit: 'largest',
    outlineFade: [.7, .9],
    // Symbol width, from the viewport height, within these shares of its width.
    symbol: { min: 1.2, perHeight: .9, max: 1.35 },
    // Beam wake as a share of the desktop one (~24% of the path).
    beamLength: 1.25,
  },
  mobile: {
    logoExit: 'largest',
    outlineFade: [.7, .9],
    symbol: { min: 1.3, perHeight: .75, max: 1.4 },
    beamLength: 1.25,
  },
}

// Margins of the soft mask around the copy, in CSS pixels.
const MASK_PADDING = [18, 12]

// The portrait symbol in Hero pixels: as wide as the profile allows from the
// viewport height, PORTRAIT_ASPECT times as wide as tall, its crossing right
// under the centre of the logo. `copy` is the box of the text block (brand
// to buttons); the mask that dims the fibres passing behind it is centred on
// it, as a rounded rectangle with soft edges.
export function portraitSymbol(profile, hero, logo, copy) {
  const { min, perHeight, max } = profile.symbol
  const width = Math.min(max * hero.width, Math.max(min * hero.width, perHeight * hero.height))
  return {
    width,
    height: width / PORTRAIT_ASPECT,
    x: logo.x,
    y: logo.y,
    mask: copy && {
      x: copy.left + copy.width / 2,
      y: copy.top + copy.height / 2,
      halfWidth: copy.width / 2 + MASK_PADDING[0],
      halfHeight: copy.height / 2 + MASK_PADDING[1],
    },
  }
}
