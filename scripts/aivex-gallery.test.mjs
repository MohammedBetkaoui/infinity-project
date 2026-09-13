import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'
import { firstEditionPhotos, galleryIndex, GALLERY_INTERVAL_MS } from '../src/pages/aivex/aivexGalleryData.js'
import { prepareGalleryPhoto } from '../src/pages/aivex/aivexGalleryImages.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

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

test('the gallery is scoped to AIVEX and retains motion and accessibility safeguards', async () => {
  const page = await read('src/pages/aivex/AivexPage.jsx')
  const component = await read('src/pages/aivex/AivexGallery.jsx')
  const hook = await read('src/pages/aivex/useAivexGallery.js')
  const styles = await read('src/pages/aivex/aivex-gallery.css')
  assert.match(page, /<AivexHero \/>\s*<AivexGallery ready={ready} \/>\s*<AivexApproach \/>/)
  assert.match(component, /aria-roledescription="carousel"/)
  assert.match(component, /aria-hidden={!present \|\| undefined}/)
  assert.match(component, /Previous photograph/)
  assert.match(component, /Next photograph/)
  assert.match(component, /Pause slideshow/)
  assert.match(component, /onPointerCancel/)
  assert.match(component, /event\.key === 'ArrowRight'/)
  assert.match(styles, /object-fit: contain/)
  assert.match(styles, /touch-action: pan-y pinch-zoom/)
  assert.match(styles, /prefers-reduced-motion: reduce/)
  assert.match(hook, /autoplay && visible && pageVisible && !hovered && !reduced && !loading/)
  assert.match(hook, /if \(cancelled\) return/)
  assert.match(hook, /request !== requestRef\.current/)
  assert.match(hook, /window\.clearTimeout\(timer\)/)
  assert.doesNotMatch(hook, /requestAnimationFrame|\.ticker|new Lenis/)
})
