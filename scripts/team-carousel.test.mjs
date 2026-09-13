import assert from 'node:assert/strict'
import { test } from 'node:test'
import { access, readdir } from 'node:fs/promises'
import { coverflowPose, snapPortrait } from '../src/pages/community/teamMotion.js'
import { communityPortraits } from '../src/pages/community/communityData.js'

test('slow drags settle on the nearest portrait in either direction', () => {
  for (const step of [176, 248.5, 322.5]) {
    assert.equal(snapPortrait(-3.4 * step, 0, step, 8), 3)
    assert.equal(snapPortrait(-3.6 * step, 0, step, 8), 4)
    assert.equal(snapPortrait(-.4 * step, 0, step, 8), 0)
    assert.equal(snapPortrait(-6.8 * step, 0, step, 8), 7)
  }
})

test('a flick carries momentum, stays bounded, and cannot skip the whole gallery', () => {
  assert.equal(snapPortrait(-900, -1200, 300, 8), 4)
  assert.equal(snapPortrait(-900, 1200, 300, 8), 2)
  assert.equal(snapPortrait(-900, -50000, 300, 8), 5)
  assert.equal(snapPortrait(-900, 50000, 300, 8), 1)
  assert.equal(snapPortrait(40, 1500, 300, 8), 0)
  assert.equal(snapPortrait(-2200, -1500, 300, 8), 7)
  assert.equal(snapPortrait(-10, 200, 0, 8), 0)
  assert.equal(snapPortrait(-100, -200, 300, 1), 0)
})

test('the central frame is flat and clear; lateral parallax is bounded and reversible', () => {
  for (const compact of [false, true]) {
    for (const progress of [0, .2, .5, .8, 1]) {
      const centre = coverflowPose(0, progress, compact)
      assert.equal(Math.abs(centre.rotateY), 0)
      assert.equal(centre.scale, 1)
      assert.equal(centre.shade, 0)
      assert.equal(centre.y, 0)
      assert.equal(centre.opacity, 1)
      const left = coverflowPose(-1, progress, compact)
      const right = coverflowPose(1, 1 - progress, compact)
      assert.equal(left.rotateY, -right.rotateY)
      assert(Math.abs(left.y - right.y) < .00001)
      assert(left.scale < 1 && left.scale >= .8)
      assert(Math.abs(left.y) <= 30)
    }
    for (let distance = -9; distance <= 9; distance += .25) {
      const pose = coverflowPose(distance, .5, compact)
      assert(Object.values(pose).every(Number.isFinite))
      assert(pose.opacity >= 0 && pose.opacity <= 1)
    }
  }
})

test('all supplied portraits remain in the gallery with the president surrounded by members', async () => {
  const files = await readdir(new URL('../public/assets/communty/', import.meta.url))
  assert.deepEqual(communityPortraits.map(member => member.file).sort(), files.sort())
  const president = communityPortraits.findIndex(member => member.role === 'President')
  assert(president > 0 && president < communityPortraits.length - 1)
  for (const member of communityPortraits) {
    await access(new URL(`../public${member.src}`, import.meta.url))
    assert(member.alt.includes(member.name))
  }
})
