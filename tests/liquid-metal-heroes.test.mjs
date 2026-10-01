import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the five public heroes use one shared liquid-metal component and shader', async () => {
  const home = await read('src/sections/Hero.jsx')
  const pageHero = await read('src/components/PageHero.jsx')
  const sharedComponent = await read('src/components/InfinityLiquidMetal.jsx')
  const shader = await read('src/lib/liquidMetalShader.js')

  assert.match(home, /<InfinityLiquidMetal variant="home"/)
  assert.match(pageHero, /<InfinityLiquidMetal variant=\{shaderVariant\}/)
  assert.equal((sharedComponent.match(/gl\.createProgram\(/g) || []).length, 1, 'one WebGL program is created by the shared helper')
  assert.match(shader, /for \(int octave = 0; octave < 6; octave\+\+\)/)
  assert.match(shader, /float domainWarp/)

  const pages = ['about', 'community', 'events', 'contact']
  for (const page of pages) {
    const hero = await read(`src/pages/${page}/${page[0].toUpperCase()}${page.slice(1)}Hero.jsx`)
    assert.match(hero, new RegExp(`shaderVariant="${page}"`))
    assert.doesNotMatch(hero, /WebGL|fragmentShader|createProgram/)
  }
})

test('the decorative canvas has graceful motion, visibility and WebGL fallbacks', async () => {
  const component = await read('src/components/InfinityLiquidMetal.jsx')
  const styles = await read('src/components/infinity-liquid-metal.css')

  assert.match(component, /<canvas[^>]+aria-hidden="true"/)
  assert.match(component, /matchMedia\('\(prefers-reduced-motion: reduce\)'\)/)
  assert.match(component, /IntersectionObserver/)
  assert.match(component, /visibilitychange/)
  assert.match(component, /webglcontextlost/)
  assert.match(component, /webglcontextrestored/)
  assert.match(styles, /radial-gradient\(ellipse at 70% 35%/)
  assert.match(styles, /#002a1e/)
  assert.match(styles, /\.infinity-liquid-metal-canvas\s*\{[^}]*position: absolute/s)
  assert.doesNotMatch(styles, /position:\s*fixed/)
})

test('existing hero content and semantic headings remain intact', async () => {
  const home = await read('src/sections/Hero.jsx')
  const pageHero = await read('src/components/PageHero.jsx')
  assert.match(home, /aria-label="No Limits For Infiniters"/)
  assert.match(home, />Join the club</)
  assert.match(home, />Discover Infinity</)
  assert.match(home, /<InfinityArtwork \/>/)
  assert.match(pageHero, /<h1 id=\{titleId\}/)
  assert.match(pageHero, /className="page-hero-facts"/)
  assert.match(pageHero, /className="page-hero-jump"/)
})
