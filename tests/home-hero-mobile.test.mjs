import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { HERO_BREAKPOINTS, HERO_PROFILES, portraitFrame } from '../src/lib/heroLayouts.js'
import { beamSpan, measureRibbon, ribbonPoint } from '../src/lib/homeHeroLines.js'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

// Layouts measured on the Home hero (CSS px): viewport, logo centre, paragraph box.
const portraits = [
  { name: 'iPhone 13 Pro, toolbars', profile: 'mobile', hero: [390, 664], mark: 519.5, text: [40, 345, 350, 415] },
  { name: 'iPhone 13 Pro, full', profile: 'mobile', hero: [390, 844], mark: 609.5, text: [40, 435, 350, 505] },
  { name: 'iPhone SE', profile: 'mobile', hero: [375, 667], mark: 519, text: [33, 344, 342, 414] },
  { name: 'iPhone Pro Max', profile: 'mobile', hero: [430, 932], mark: 659, text: [60, 484, 370, 554] },
  { name: 'iPad', profile: 'tablet', hero: [768, 1024], mark: 741, text: [146, 566, 622, 620] },
  { name: 'iPad Air', profile: 'tablet', hero: [820, 1180], mark: 825, text: [172, 650, 648, 704] },
]

const frameOf = ({ profile, hero: [width, height], mark, text: [left, , right, bottom] }) => portraitFrame(
  HERO_PROFILES[profile], { width, height }, mark,
  { bottom, halfWidth: Math.max(width / 2 - left, right - width / 2) },
)

test('desktop keeps its validated values; phones and tablets end the logo before the next section rises', () => {
  assert.deepEqual(HERO_PROFILES.desktop, { logoExit: 'frame', outlineFade: [.7, .9] })
  assert.equal(HERO_BREAKPOINTS.desktop, '(min-width: 1024px)')
  for (const name of ['mobile', 'tablet']) {
    const { logoExit, outlineFade: [from, to] } = HERO_PROFILES[name]
    assert.equal(logoExit, 'largest')
    // The next section starts rising at .7 and covers half the screen near .85.
    assert(from < to && to <= .72, `${name} contour fades out by ${to}`)
  }
})

test('the portrait symbol overflows the screen, crosses on the logo and stays clear of the copy', () => {
  for (const layout of portraits) {
    const [width, height] = layout.hero
    const frame = frameOf(layout)
    const share = frame.width / width
    const { min, max } = HERO_PROFILES[layout.profile].frame
    assert(share >= min - 1e-9 && share <= max + 1e-9, `${layout.name}: ${share}`)
    assert.equal(frame.crossing, layout.mark)
    const left = (width - frame.width) / 2
    const top = frame.crossing - frame.height / 2
    let leftEdge = Infinity
    let rightEdge = -Infinity
    for (let line = 0; line < 4; line++) {
      for (const side of [-1, 1]) {
        for (let step = 0; step <= 600; step++) {
          const point = ribbonPoint(step / 600, side, line, 0, true)
          const x = left + point.x * frame.width
          const y = top + point.y * frame.height
          leftEdge = Math.min(leftEdge, x)
          rightEdge = Math.max(rightEdge, x)
          const [textLeft, textTop, textRight, textBottom] = layout.text
          assert(!(x >= textLeft && x <= textRight && y >= textTop && y <= textBottom), `${layout.name}: a fibre crosses the paragraph`)
        }
      }
    }
    // The loops leave the screen on both sides, as on desktop.
    assert(leftEdge < 0 && rightEdge > width, `${layout.name}: loops ${leftEdge}..${rightEdge}`)
    assert(frame.height <= height)
  }
})

test('the beams follow the enlarged loops and still cross the centre at .3', () => {
  for (const layout of portraits) {
    const frame = frameOf(layout)
    for (let line = 0; line < 4; line++) {
      const lobe = side => {
        const distances = new Float32Array(97)
        measureRibbon(new Float32Array(194), distances, side, line, 0, true, frame.width, frame.height)
        return distances
      }
      const span = beamSpan(lobe(-1), lobe(1))
      const crossing = .15 + .7 * span.a.upper / span.lengthA
      assert(Math.abs(crossing - .3) < .01, `${layout.name}: crossing at ${crossing}`)
      // A path several hundred pixels long, so the light reads as a beam.
      assert(span.lengthA > 300, `${layout.name}: ${span.lengthA}px`)
    }
  }
})

test('the Hero keeps its height when a mobile toolbar slides, with a short pin and a readable foot', async () => {
  const css = await read('src/sections/hero.css')
  const lines = await read('src/components/home-hero-lines.css')
  const scroll = await read('src/hooks/useHeroLogoScroll.js')
  const lenis = await read('src/hooks/useLenis.js')
  assert.match(css, /min-height: 100vh; min-height: 100svh;/)
  assert.match(css, /--runway: 100svh/)
  assert.match(css, /--runway: 115svh/)
  assert.match(css, /--runway: 130vh/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
  assert.match(css, /@media \(max-width: 399\.98px\)[^}]+\.home-hero-foot > span \{ display: none; \}/s)
  assert.match(css, /font-size: 12px; white-space: nowrap/)
  assert.match(lines, /@media \(max-width: 1023\.98px\) and \(orientation: portrait\)/)
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
