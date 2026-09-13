import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'
import { firstEditionPhotos, galleryIndex, GALLERY_INTERVAL_MS } from '../src/pages/aivex/aivexGalleryData.js'
import { prepareGalleryPhoto } from '../src/pages/aivex/aivexGalleryImages.js'

import { frameOpacity, galleryPosition, galleryScrollTarget } from '../src/pages/aivex/gallery/galleryTimeline.js'

function jpegSize(buffer) {
  assert.equal(buffer.readUInt16BE(0), 0xffd8)
  let offset = 2
  while (offset < buffer.length) {
    assert.equal(buffer[offset], 0xff)
    const marker = buffer[offset + 1]
    const length = buffer.readUInt16BE(offset + 2)
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
    }
    offset += length + 2
  }
  throw new Error('JPEG dimensions not found')
}

function imageSize(buffer, path) {
  if (/\.png$/i.test(path)) {
    assert.equal(buffer.toString('ascii', 1, 4), 'PNG')
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  return jpegSize(buffer)
}

test('the album uses every supplied photograph once, with accurate dimensions and descriptions', async () => {
  const assets = await readdir(new URL('../public/assets/aivex/', import.meta.url))
  const sources = firstEditionPhotos.map((photo) => photo.src.split('/').at(-1))
  assert.deepEqual([...sources].sort(), assets.filter((path) => /\.(?:jpe?g|png)$/i.test(path)).sort())
  assert.equal(new Set(sources).size, 15)
  for (const photo of firstEditionPhotos) {
    const file = await readFile(new URL(`../public${photo.src}`, import.meta.url))
    assert.deepEqual(imageSize(file, photo.src), { width: photo.width, height: photo.height }, photo.src)
    assert(photo.alt.length > 40)
    assert(photo.caption.length > 5)
  }
})

test('navigation wraps correctly in both directions, including repeated fast inputs', () => {
  const count = firstEditionPhotos.length
  assert.equal(galleryIndex(-1), count - 1)
  assert.equal(galleryIndex(count), 0)
  assert.equal(galleryIndex(count * 3 + 1), 1)
  assert.equal(galleryIndex(-(count * 3 + 1)), count - 1)
  for (let index = -100; index <= 100; index++) {
    assert(galleryIndex(index) >= 0 && galleryIndex(index) < firstEditionPhotos.length)
  }
  assert(GALLERY_INTERVAL_MS >= 5000)
})

test('image decoding is shared, and failures can be retried rather than cached forever', async (t) => {
  const originalImage = globalThis.Image
  const instances = []
  let fail = false
  globalThis.Image = class {
    constructor() { instances.push(this) }
    decode() { return fail ? Promise.reject(new Error('Image unavailable')) : Promise.resolve() }
  }
  t.after(() => {
    if (originalImage === undefined) delete globalThis.Image
    else globalThis.Image = originalImage
  })
  const cache = new Map()
  const first = prepareGalleryPhoto(firstEditionPhotos[0], cache)
  assert.equal(first, prepareGalleryPhoto(firstEditionPhotos[0], cache))
  await first
  assert.equal(instances.length, 1)
  assert.equal(instances[0].src, firstEditionPhotos[0].src)
  fail = true
  await assert.rejects(prepareGalleryPhoto(firstEditionPhotos[1], cache), /unavailable/)
  assert.equal(cache.has(firstEditionPhotos[1].src), false)
  fail = false
  await prepareGalleryPhoto(firstEditionPhotos[1], cache)
  assert.equal(instances.length, 3)
})

test('scroll position is bounded, reversible and reaches every photograph', () => {
  const count = firstEditionPhotos.length
  assert.equal(galleryPosition(-0.4, count), 0)
  assert.equal(galleryPosition(1.4, count), count - 1)
  assert.equal(galleryPosition(0.5, 1), 0)
  for (let index = 0; index < count; index++) {
    assert(Math.abs(galleryPosition(index / (count - 1), count) - index) < 1e-9)
  }
  const forward = Array.from({ length: 101 }, (_, index) => galleryPosition(index / 100, count))
  const backward = Array.from({ length: 101 }, (_, index) => galleryPosition((100 - index) / 100, count)).reverse()
  assert.deepEqual(forward, backward)
})

test('a thumbnail seek lands at the same scroll position on desktop and mobile', () => {
  const count = firstEditionPhotos.length
  const layouts = [
    { top: 920, height: 2262, viewportHeight: 900, inset: 94 },
    { top: 1380, height: 2000, viewportHeight: 844, inset: 76 },
    { top: 1380, height: 1840, viewportHeight: 667, inset: 76 },
  ]
  for (const layout of layouts) {
    const start = layout.top - layout.inset
    const distance = layout.height - layout.viewportHeight + layout.inset
    assert.equal(galleryScrollTarget(layout, 0, count), start)
    assert.equal(galleryScrollTarget(layout, count - 1, count), layout.top + layout.height - layout.viewportHeight)
    for (let index = 0; index < count; index++) {
      const scroll = galleryScrollTarget(layout, index, count)
      assert(Math.abs(galleryPosition((scroll - start) / distance, count) - index) < 1e-9)
    }
  }
})

test('crossfades preserve an opaque base and reverse continuously without a black dip', () => {
  const count = firstEditionPhotos.length
  for (let index = 0; index < count - 1; index++) {
    assert.equal(frameOpacity(index, index), 1)
    assert.equal(frameOpacity(index, index + 1), 0)
    assert.equal(frameOpacity(index + 0.5, index + 1), 0.5)
    assert.equal(frameOpacity(index + 1, index + 1), 1)
    let previous = 0
    for (let step = 0; step <= 100; step++) {
      const value = index + step / 100
      const foreground = frameOpacity(value, index + 1)
      const background = frameOpacity(value, index)
      assert(foreground >= previous && foreground <= 1)
      assert.equal(foreground + background * (1 - foreground), 1)
      previous = foreground
    }
  }
})
