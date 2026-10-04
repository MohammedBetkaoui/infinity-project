import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { HERO_BREAKPOINTS, HERO_PROFILES, portraitSymbol } from '../src/lib/heroLayouts.js'
import { beamSpan, measureRibbon, PORTRAIT_ASPECT, ribbonPoint } from '../src/lib/homeHeroLines.js'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

// Layouts measured on the Home hero (CSS px): viewport, logo centre, copy block (brand to buttons).
const portraits = [
  { name: 'iPhone 13 Pro, toolbars', profile: 'mobile', hero: [390, 664], logo: [195, 519.5], copy: [20, 205, 370, 490] },
  { name: 'iPhone 13 Pro, full', profile: 'mobile', hero: [390, 844], logo: [195, 609.5], copy: [20, 295, 370, 580] },
  { name: 'iPhone SE', profile: 'mobile', hero: [375, 667], logo: [187.5, 519], copy: [20, 209, 355, 489] },
  { name: 'iPhone Pro Max', profile: 'mobile', hero: [430, 932], logo: [215, 659], copy: [20, 334, 410, 629] },
  { name: 'iPad', profile: 'tablet', hero: [768, 1024], logo: [384, 741], copy: [32, 362, 736, 700] },
]

const symbolOf = ({ profile, hero: [width, height], logo: [x, y], copy: [left, top, right, bottom] }) => portraitSymbol(
  HERO_PROFILES[profile], { width, height }, { x, y }, { left, top, width: right - left, height: bottom - top },
)

test('desktop keeps its validated values; phones and tablets follow its dissolve rule', () => {
  assert.deepEqual(HERO_PROFILES.desktop, { logoExit: 'frame', outlineFade: [.7, .9] })
  assert.equal(HERO_BREAKPOINTS.desktop, '(min-width: 1024px)')
  for (const name of ['mobile', 'tablet']) {
    const { logoExit, outlineFade, beamLength } = HERO_PROFILES[name]
    assert.equal(logoExit, 'largest')
    // Between .7 and .9 the dissolving logo and the rising section show together.
    assert.deepEqual(outlineFade, [.7, .9])
    // Beam wake ~20–25% of the path (the desktop wake is 19% of it).
    assert(.19 * beamLength >= .2 && .19 * beamLength <= .25)
  }
})

test('the portrait variant is the same symbol, taller: seven fibres, one crossing, 1.5 wide for 1 tall', () => {
  for (let line = 0; line < 7; line++) {
    for (const side of [-1, 1]) {
      for (const progress of [0, 1]) {
        const point = ribbonPoint(progress, side, line, 12, 'portrait')
        assert(Math.abs(point.x - .5) < 1e-12 && Math.abs(point.y - .5) < 1e-12)
      }
    }
  }
  // The middle fibre spans as much of the frame's width as of its height,
  // so the drawn symbol keeps the frame's 1.5 proportion.
  let [left, right, top, bottom] = [1, 0, 1, 0]
  for (const side of [-1, 1]) {
    for (let step = 0; step <= 400; step++) {
      const { x, y } = ribbonPoint(step / 400, side, 3, 0, 'portrait')
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
  }
  const aspect = (right - left) * PORTRAIT_ASPECT / (bottom - top)
  assert(aspect > 1.4 && aspect < 1.6, `aspect ${aspect}`)
})

test('on 375–430px and 768px portraits the loops overflow a little, the crossing sits under the logo, the copy is masked', () => {
  for (const layout of portraits) {
    const [width] = layout.hero
    const symbol = symbolOf(layout)
    const { min, max } = HERO_PROFILES[layout.profile].symbol
    const share = symbol.width / width
    assert(share >= min - 1e-9 && share <= max + 1e-9, `${layout.name}: ${share}`)
    assert(share >= 1.2 && share <= 1.5)
    assert.deepEqual([symbol.x, symbol.y], layout.logo)
    // Curvature in view: the tops of the loops are on screen, their ends just off it.
    let outer = 0
    let tops = 0
    for (const side of [-1, 1]) {
      for (let step = 0; step <= 400; step++) {
        const point = ribbonPoint(step / 400, side, 3, 0, 'portrait')
        const x = symbol.x + (point.x - .5) * symbol.width
        outer = Math.max(outer, Math.max(-x, x - width))
        if (step === 100 || step === 300) tops += x > 0 && x < width ? 1 : 0
      }
    }
    assert(outer > 0 && outer < width * .25, `${layout.name}: loops overflow by ${outer}px`)
    assert.equal(tops, 4, `${layout.name}: loop tops and bottoms on screen`)
    // The mask is centred on the copy block and covers it.
    const [left, top, right, bottom] = layout.copy
    assert.equal(symbol.mask.x, (left + right) / 2)
    assert.equal(symbol.mask.y, (top + bottom) / 2)
    assert(symbol.mask.halfWidth >= (right - left) / 2 && symbol.mask.halfHeight >= (bottom - top) / 2)
  }
})

test('the portrait beams start at the upper strokes, cross under the logo near .3, glide with a ~24% wake', () => {
  for (const layout of portraits) {
    const symbol = symbolOf(layout)
    for (let line = 0; line < 7; line++) {
      const lobe = side => {
        const distances = new Float32Array(129)
        measureRibbon(new Float32Array(258), distances, side, line, 0, 'portrait', 0, 0, { left: 0, top: 0, width: symbol.width, height: symbol.height })
        return distances
      }
      const span = beamSpan(lobe(-1), lobe(1))
      const crossing = .15 + .7 * span.a.upper / span.lengthA
      assert(crossing > .28 && crossing < .34, `${layout.name}: crossing at ${crossing}`)
      assert(Math.abs(span.lengthA - span.lengthB) / span.lengthA < .03)
      assert(span.lengthA > 250, `${layout.name}: ${span.lengthA}px`)
    }
  }
})

test('the pin, the dissolve and the toolbar: shorter runways, svh heights, width-only relayout', async () => {
  const css = await read('src/sections/hero.css')
  const lines = await read('src/components/home-hero-lines.css')
  const component = await read('src/components/HomeHeroLines.jsx')
  const scroll = await read('src/hooks/useHeroLogoScroll.js')
  const lenis = await read('src/hooks/useLenis.js')
  assert.match(css, /min-height: 100vh; min-height: 100svh;/)
  assert.match(css, /--runway: 120svh/)
  assert.match(css, /--runway: 125svh/)
  assert.match(css, /--runway: 130vh/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
  assert.match(css, /@media \(max-width: 399\.98px\)[^}]+\.home-hero-foot > span \{ display: none; \}/s)
  assert.match(lines, /@media \(max-width: 1023\.98px\) and \(orientation: portrait\)/)
  assert.match(lines, /\.home-hero-lines-still\.is-portrait/)
  // The variant is chosen by orientation, and the symbol follows the logo.
  assert.match(component, /window\.matchMedia\(LINES_PORTRAIT\)/)
  assert.match(component, /symbol \? 'portrait' : compact/)
  assert.match(lenis, /ScrollTrigger\.config\(\{ ignoreMobileResize: true \}\)/)
  assert.match(scroll, /\.\.\.HERO_BREAKPOINTS/)
})

test('on touch screens only a new width re-lays the Hero out; elsewhere every resize does', async () => {
  const { onLayoutResize } = await import('../src/lib/viewportResize.js')
  for (const touch of [true, false]) {
    const listeners = new Set()
    globalThis.window = {
      innerWidth: 390, innerHeight: 664,
      matchMedia: () => ({ matches: touch }),
      addEventListener: (type, listener) => listeners.add(listener),
      removeEventListener: (type, listener) => listeners.delete(listener),
    }
    let calls = 0
    const stop = onLayoutResize(() => { calls += 1 })
    const resize = (width, height) => { Object.assign(window, { innerWidth: width, innerHeight: height }); listeners.forEach(listener => listener()) }
    resize(390, 750) // the address bar slides away
    resize(390, 664) // and back
    assert.equal(calls, touch ? 0 : 2)
    resize(844, 390) // rotation
    assert.equal(calls, touch ? 1 : 3)
    stop()
    assert.equal(listeners.size, 0)
  }
  delete globalThis.window
})
