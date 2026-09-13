import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { test } from 'node:test'
import postcss from 'postcss'
import tailwind from '../tailwind.config.js'
import { navigation, poles, stats, events, faqs } from '../src/data/siteData.js'
import { approach, practicalDetails, aivexFaqs } from '../src/pages/aivex/aivexData.js'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const css = postcss.parse(await read('src/index.css'))
const colors = tailwind.theme.extend.colors

function declaration(selector, property) {
  let value
  css.walkRules(selector, rule => {
    if (rule.parent.type !== 'root') return
    rule.walkDecls(property, decl => { value = decl.value })
  })
  return value
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (values[0] + .05) / (values[1] + .05)
}

test('requested forest and emerald are consistent across Tailwind, CSS and metadata', async () => {
  assert.equal(colors.background.toLowerCase(), '#0b4b37')
  assert.equal(colors.primary.toLowerCase(), '#039869')
  assert.equal(declaration(':root', '--background'), colors.background.toLowerCase())
  assert.equal(declaration(':root', '--primary'), colors.primary.toLowerCase())
  assert.equal(declaration('.hero-section', 'background'), colors.background.toLowerCase())
  assert.equal(declaration('.button-primary', 'background'), 'var(--primary)')
  assert.equal(declaration('.nav-join', 'background'), 'var(--primary)')
  assert.match(await read('index.html'), /name="theme-color" content="#0B4B37"/)
})

test('small text and primary CTA labels meet 4.5:1 contrast', () => {
  const cases = [
    [colors.ink, colors.primary],
    [colors.cream, colors.background],
    [colors['text-muted'], colors.background],
    [colors['text-muted'], colors.surface],
    [colors.sage, colors.background],
    [colors.sand, colors.background],
    [colors.ink, colors.paper],
    [colors.cream, '#0b4b37'],
    ['#c3ded0', '#08573f'],
  ]
  for (const [foreground, background] of cases) {
    assert(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`)
  }
})

test('English labels preserve existing section links and club content', async () => {
  assert.match(await read('index.html'), /<html lang="en">/)
  assert.deepEqual(navigation.map(item => item.label), ['Home', 'About', 'Community', 'Events', 'Our fields', 'Contact'])
  assert.deepEqual(navigation.map(item => item.href), ['#accueil', '#a-propos', '#communaute', '#evenements', '#poles', '#contact'])
  assert.equal(poles.length, 7)
  assert.equal(poles[4].title, 'AI & Automation')
  assert.equal(poles[6].title, 'Cybersecurity')
  assert.deepEqual(events.map(item => item.name), ['AIVEX', 'DesignLab v2', 'Ramadan Conferences', 'ACCESS0'])
  assert.equal(faqs.length, 5)
  assert.deepEqual(stats.map(item => item.value), [3000, 130, 7, 4])
  assert.match(await read('src/components/CountUp.jsx'), /toLocaleString\('en-GB'\)/)
})

test('no old French UI copy remains, including hidden controls and the loader', async () => {
  const paths = (await readdir(new URL('../src/', import.meta.url), { recursive: true }))
    .filter(path => /\.(jsx|js)$/.test(path))
  const frenchCopy = /Rejoindre|Chargement|Découvrir|Ouvrir|Fermer|Communauté|Compétition|Inscriptions|Événements|édition|Faculté|Algérie|coché|en savoir plus/i
  for (const path of paths) {
    const source = (await read(`src/${path}`)).replace(/^\s*\/\/.*$/gm, '')
    // Fragment identifiers stay stable for existing bookmarks and cross-page links.
    const withoutFragments = source.replace(/#(?:accueil|a-propos|communaute|evenements|poles)/g, '')
    assert.doesNotMatch(withoutFragments, frenchCopy, path)
  }
})

test('AIVEX keeps its separate palette, loading duration and unconfirmed details', async () => {
  const aivexCss = await read('src/pages/aivex/aivex.css')
  for (const hex of ['#111111', '#efede8', '#f59e0b', '#db0051', '#4f001d']) {
    assert(aivexCss.includes(hex), `AIVEX retains ${hex}`)
  }
  assert.equal(approach[1].title, 'Give the idea a shape.')
  assert.equal(practicalDetails.filter(item => item.pending).length, 3)
  assert.equal(aivexFaqs.length, 6)
  assert.match(await read('src/pages/aivex/AivexRoute.jsx'), /MINIMUM_LOADING_MS = 2500/)
  assert.match(await read('src/components/AivexLoader.jsx'), /Loading the AIVEX page/)
})

test('every club signature reuses the supplied emblem trace', async () => {
  const mark = await read('src/components/InfinityMark.jsx')
  assert.equal((mark.match(/<path /g) || []).length, 2, 'One official ribbon plus its matching signal contour')
  assert.match(mark, /className="infinity-mark-shape"/)
  assert.match(mark, /className="infinity-mark-signal" pathLength="1"/)
  assert.match(mark, /viewBox="14 75 432 236"/)
  for (const component of ['Logo', 'InfinityArtwork']) {
    assert.match(await read(`src/components/${component}.jsx`), /<InfinityMark/)
  }
  for (const component of ['Navbar', 'MobileMenu']) {
    assert.match(await read(`src/components/${component}.jsx`), /<Logo /)
  }
  assert.match(await read('src/sections/Footer.jsx'), /<Logo \/>/)
  assert.doesNotMatch(await read('src/lib/pageSignature.js'), /mark\.style\.(opacity|transform)/)
  assert.equal(declaration('.hero-emblem', 'color'), declaration('.brand-symbol', 'color'))
  assert.equal(declaration('.brand-symbol', 'background'), 'transparent')
  assert.equal(declaration('.hero-emblem', 'background'), undefined)
})

test('mobile AIVEX motion is scroll-driven, scoped and reversible without a custom scroll loop', async () => {
  const source = await read('src/pages/aivex/useAivexMobileMotion.js')
  assert.match(source, /prefers-reduced-motion: reduce/)
  assert.match(source, /if \(conditions\.reduced/)
  assert.equal((source.match(/scrub: true/g) || []).length, 2)
  assert.doesNotMatch(source, /pin:\s*true|repeat:\s*-1|requestAnimationFrame|\.ticker|new Lenis/)
  assert.match(source, /return \(\) => media\.revert\(\)/)
  assert.match(await read('src/pages/aivex/AivexPage.jsx'), /useAivexMobileMotion\(pageRef, ready\)/)
})
