import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HERO_ENERGY_DURATION, heroTitleLightAt, measureRibbon, ribbonPoint } from '../src/lib/homeHeroLines.js'

test('the title waits for the currents, lights monotonically and completes within three seconds', () => {
  assert.deepEqual(heroTitleLightAt(0), { first: 0, second: 0 })
  assert.deepEqual(heroTitleLightAt(.4), { first: 0, second: 0 })
  assert(heroTitleLightAt(.9).first > 0 && heroTitleLightAt(.9).second > 0)
  let previous = { first: 0, second: 0 }
  for (let time = 0; time < 4; time += .1) {
    const current = heroTitleLightAt(time)
    assert(current.first >= previous.first && current.second >= previous.second)
    previous = current
  }
  assert.deepEqual(heroTitleLightAt(2.7), { first: 1, second: 1 })
  assert.deepEqual(heroTitleLightAt(30), { first: 1, second: 1 })
})

test('the two loops keep one stable crossing throughout their breathing cycle', () => {
  for (const compact of [false, true]) {
    for (let line = 0; line < (compact ? 4 : 7); line++) {
      for (const time of [0, 4, 8, 16, 32, 64]) {
        for (const side of [-1, 1]) {
          for (const progress of [0, 1]) {
            const point = ribbonPoint(progress, side, line, time, compact)
            assert(Math.abs(point.x - .5) < 1e-12)
            assert(Math.abs(point.y - (compact ? .5 : .48)) < 1e-12)
          }
        }
      }
    }
  }
  assert(HERO_ENERGY_DURATION >= 9 && HERO_ENERGY_DURATION <= 12)
})

test('the initial desktop curve retains the existing local silhouette', () => {
  for (const side of [-1, 1]) {
    for (let line = 0; line < 7; line++) {
      for (const progress of [.1, .25, .5, .75, .9]) {
        const angle = progress * Math.PI
        const spread = line - 3
        const point = ribbonPoint(progress, side, line)
        const x = .5 + side * (.57 + spread * .012 + Math.sin(side * .7) * .014) * Math.sin(angle)
        const y = .48 - side * (.31 + spread * .013) * Math.sin(angle * 2) + spread * .015 * Math.sin(angle) + Math.sin(angle) * .012
        assert(Math.abs(point.x - x) < 1e-12)
        assert(Math.abs(point.y - y) < 1e-12)
      }
    }
  }
})

test('all compact fibres stay inside the viewport with room for their halo', () => {
  for (const side of [-1, 1]) {
    for (let line = 0; line < 4; line++) {
      for (const time of [0, 8, 16, 32, 64, 128]) {
        for (let sample = 0; sample <= 100; sample++) {
          const point = ribbonPoint(sample / 100, side, line, time, true)
          // At 320px this leaves at least 12.8px, including the 4.5px halo.
          assert(point.x >= .04 && point.x <= .96)
          assert(point.y > 0 && point.y < 1)
        }
      }
    }
  }
})

test('screen-space distances stay monotonic and scale with the displayed curve', () => {
  for (const [width, height, compact] of [[1440, 900, false], [360, 640, true], [768, 1024, true]]) {
    const count = compact ? 65 : 129
    const points = new Float32Array(count * 2)
    const distances = new Float32Array(count)
    const length = measureRibbon(points, distances, 1, 2, 7, compact, width, height)
    assert.equal(distances[0], 0)
    assert(Math.abs(distances.at(-1) - length) < .001)
    for (let index = 1; index < count; index++) assert(distances[index] > distances[index - 1])
    const scaled = measureRibbon(points, distances, 1, 2, 7, compact, width * 2, height * 2)
    assert(Math.abs(scaled - length * 2) < .01)
  }
})
