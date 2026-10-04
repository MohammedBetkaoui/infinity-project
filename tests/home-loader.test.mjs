import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the home loader draws the club emblem of public/infinity-favicon.svg', async () => {
  const favicon = await read('public/infinity-favicon.svg')
  const mark = await read('src/components/InfinityClubMark.jsx')
  const loader = await read('src/components/HomeLoader.jsx')

  assert.equal(mark.match(/INFINITY_CLUB_PATH = '([^']+)'/)[1], favicon.match(/ d="([^"]+)"/)[1])
  assert.equal(mark.match(/INFINITY_CLUB_VIEWBOX = '([^']+)'/)[1], favicon.match(/viewBox="([^"]+)"/)[1])
  assert.match(loader, /d=\{INFINITY_CLUB_PATH\}/)
})

test('only Home mounts it; its emblem lands in a decorative slot under the Hero actions', async () => {
  const app = await read('src/App.jsx')
  const hero = await read('src/sections/Hero.jsx')
  const aivexRoute = await read('src/pages/aivex/AivexRoute.jsx')
  const homePage = app.slice(app.indexOf('function HomePage'), app.indexOf('function HomeRoute'))

  assert.equal((app.match(/<HomeLoader\b/g) || []).length, 1)
  assert.match(homePage, /<HomeLoader ready=/)
  assert.match(aivexRoute, /<AivexLoader\b/)
  assert.doesNotMatch(aivexRoute, /HomeLoader/)

  assert(hero.indexOf('data-home-logo-target') > hero.indexOf('>Discover Infinity<'))
  assert.match(hero, /<span className="home-hero-mark" data-home-logo-target aria-hidden="true">/)
  // The slot is not a control: the Hero keeps its three links.
  assert.equal((hero.match(/<(?:Link|a)\b/g) || []).length, 3)
})
