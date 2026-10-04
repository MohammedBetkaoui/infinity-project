import assert from 'node:assert/strict'
import { test } from 'node:test'
import { heroBeamOpacity, heroBeamProgress } from '../src/lib/heroLogoZoom.js'
import { BEAM_END, BEAM_START, beamCoordinates, beamSpan, measureRibbon, ribbonPoint } from '../src/lib/homeHeroLines.js'

const layouts = [[1440, 900, false], [768, 1024, true], [375, 812, true]]

function fibres(width, height, compact) {
  const count = compact ? 65 : 129
  return Array.from({ length: compact ? 4 : 7 }, (_, line) => {
    const lobe = side => {
      const positions = new Float32Array(count * 2)
      const distances = new Float32Array(count)
      measureRibbon(positions, distances, side, line, 0, compact, width, height)
      return { positions, distances }
    }
    return { line, left: lobe(-1), right: lobe(1) }
  })
}

test('the beams are still and invisible until .15, glide with the zoom and fade with the logo', () => {
  for (const progress of [0, .05, .1, .15]) {
    assert.equal(heroBeamOpacity(progress), 0)
    assert.equal(heroBeamProgress(progress), 0)
  }
  assert(Math.abs(heroBeamProgress(.85) - 1) < 1e-12)
  for (const progress of [.2, .4, .6, .7]) assert.equal(heroBeamOpacity(progress), 1)
  // The logo's contour fades linearly over .7–.9; the beams follow it exactly.
  assert(Math.abs(heroBeamOpacity(.8) - .5) < 1e-12)
  assert.equal(heroBeamOpacity(.9), 0)
  assert.equal(heroBeamOpacity(1), 0)
  let previous = -1
  for (let progress = 0; progress <= 1; progress += .01) {
    assert(heroBeamProgress(progress) >= previous)
    previous = heroBeamProgress(progress)
  }
})

test('each beam starts where its upper stroke fades, crosses the centre near .3 and ends low in the opposite corner', () => {
  for (const [width, height, compact] of layouts) {
    for (const { line, left, right } of fibres(width, height, compact)) {
      const span = beamSpan(left.distances, right.distances)
      const at = (side, progress) => ribbonPoint(progress, side, line, 0, compact)
      // A: upper left -> lower right. B: upper right -> lower left.
      assert(at(-1, BEAM_START).x < .5 && at(-1, BEAM_START).y < at(-1, 1).y)
      assert(at(1, BEAM_END).x > .5 && at(1, BEAM_END).y > at(1, 1).y)
      assert(at(1, 1 - BEAM_START).x > .5 && at(1, 1 - BEAM_START).y < at(1, 0).y)
      assert(at(-1, 1 - BEAM_END).x < .5 && at(-1, 1 - BEAM_END).y > at(-1, 0).y)
      // Mirror paths of the same length, crossing the centre together.
      assert(Math.abs(span.lengthA - span.lengthB) / span.lengthA < .03)
      const crossA = .15 + .7 * span.a.upper / span.lengthA
      const crossB = .15 + .7 * span.b.upper / span.lengthB
      assert(Math.abs(crossA - crossB) < .01)
      assert(crossA > .27 && crossA < .34, `crossing at ${crossA} (${width}x${height}, fibre ${line})`)
    }
  }
})

test('beam coordinates run continuously from 0 to 1 through the single crossing point', () => {
  for (const [width, height, compact] of layouts) {
    for (const { left, right } of fibres(width, height, compact)) {
      const span = beamSpan(left.distances, right.distances)
      const last = left.distances.length - 1
      const lengthOf = side => (side === 1 ? right : left).distances
      const coordinate = (side, progress, beam) => {
        const distances = lengthOf(side)
        const index = progress * last
        const lower = Math.floor(index)
        const distance = distances[lower] + (distances[Math.min(last, lower + 1)] - distances[lower]) * (index - lower)
        return beamCoordinates(side, distance, span)[beam]
      }
      // Starts at 0, ends at 1.
      assert(Math.abs(coordinate(-1, BEAM_START, 0)) < 1e-6)
      assert(Math.abs(coordinate(1, BEAM_END, 0) - 1) < 1e-6)
      assert(Math.abs(coordinate(1, 1 - BEAM_START, 1)) < 1e-6)
      assert(Math.abs(coordinate(-1, 1 - BEAM_END, 1) - 1) < 1e-6)
      // Both lobes agree at the crossing: no jump as a beam changes lobe.
      assert(Math.abs(coordinate(-1, 1, 0) - coordinate(1, 1, 0)) < 1e-6)
      assert(Math.abs(coordinate(1, 0, 1) - coordinate(-1, 0, 1)) < 1e-6)
      // Monotonic along each path, so a beam glides in one direction only.
      for (const [side, from, to, beam] of [[-1, 0, 1, 0], [1, 1, 0, 0], [1, 1, 0, 1], [-1, 0, 1, 1]]) {
        let previous = -Infinity
        for (let step = 0; step <= 64; step++) {
          const value = coordinate(side, from + (to - from) * step / 64, beam)
          assert(value >= previous - 1e-9)
          previous = value
        }
      }
    }
  }
})
