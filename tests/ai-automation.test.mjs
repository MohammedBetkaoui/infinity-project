import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { aiAutomationGallery } from '../src/pages/events/ai-automation/aiAutomationMedia.js'
import { eventArchive } from '../src/data/eventArchive.js'
import { ROUTES, routeFor, jsonLdFor } from '../src/seo/seoConfig.js'
import { renderRoute, sitemap } from '../scripts/seo-build.mjs'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url))

test('AI Automation derivatives preserve the supplied originals, dimensions and a useful byte budget', async () => {
  const inventory = JSON.parse(await read('public/ai-automation/optimized/inventory.json'))
  assert.equal(inventory.length, 25)
  assert.equal(aiAutomationGallery.length, 23)
  assert.equal(new Set(aiAutomationGallery.map((photo) => photo.id)).size, 23)
  assert.equal(aiAutomationGallery.filter((photo) => photo.day === '01').length, 8)
  assert.equal(aiAutomationGallery.filter((photo) => photo.day === '02').length, 15)
  for (const item of inventory) {
    const original = await read(`public/${item.source}`)
    assert.equal(createHash('sha256').update(original).digest('hex'), item.sha256, 'original stays intact')
    assert.equal(original.readUInt32BE(16), item.width)
    assert.equal(original.readUInt32BE(20), item.height)
  }
  for (const photo of aiAutomationGallery) {
    assert.match(photo.original, photo.day === '01' ? /^\/ai-automation\/Day1-20261110T190451Z-1-001\/Day1\// : /^\/ai-automation\/Day2-20261110T190453Z-1-001\/Day2\//)
    assert.ok(photo.alt.length > 50)
    assert.ok(photo.category && photo.caption)
    const item = inventory.find((entry) => `/${entry.source}` === photo.original)
    assert.ok(item?.selected)
    assert.equal(photo.width, item.width)
    assert.equal(photo.height, item.height)
    for (const variant of item.variants) {
      const file = await read(`public/ai-automation/optimized/${variant.file}`)
      assert.equal(file.subarray(8, 12).toString(), 'WEBP')
      assert.equal(file.length, variant.bytes)
      assert.equal(variant.width / variant.height, photo.width / photo.height)
      assert.ok(file.length < 160_000)
    }
    for (const path of [photo.src, photo.fullSrc, photo.thumb]) assert.ok((await read(`public${path}`)).length)
  }
})

test('the archive and static SEO agree on the public route without inventing a date or venue', async () => {
  const path = '/events/ai-automation-2026'
  const event = eventArchive.find((entry) => entry.id === 'ai-automation-2026')
  assert.equal(event.href, path)
  assert.equal(event.status, 'past')
  assert.equal(event.edition, undefined)
  const route = routeFor(path)
  assert.equal(route.robots, 'index,follow')
  const html = renderRoute((await read('index.html')).toString(), route)
  assert.ok(html.includes(`rel="canonical" href="https://www.infinty-bba.com${path}"`))
  assert.ok(html.includes(route.title))
  assert.ok(html.includes(route.image.path))
  assert.ok(sitemap(ROUTES.filter((entry) => entry.sitemap)).includes(`${path}</loc>`))
  assert.deepEqual(jsonLdFor(route).map((block) => block['@type']), ['WebPage'])
  for (const privatePath of ['/workshops/register', '/workshops/scan', '/admin', '/aivex/status']) {
    assert.equal(routeFor(privatePath).sitemap, false)
  }
})
