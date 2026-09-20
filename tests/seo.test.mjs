// SEO regression tests. The rules that must never silently regress are the
// privacy ones: a candidate's tokenised page must never become indexable,
// never reach the sitemap, and never carry a token in metadata.
import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { headFor, renderRoute, robots, sitemap } from '../scripts/seo-build.mjs'
import {
  ROUTES, SITE_ORIGIN, absoluteUrl, jsonLdFor, organizationJsonLd, routeFor,
} from '../src/seo/seoConfig.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = (path) => access(new URL(`../${path}`, import.meta.url)).then(() => true, () => false)

const PRIVATE_PATHS = ['/aivex/status', '/admin']
const TRANSACTIONAL_PATHS = ['/aivex/register', '/join']
const byPath = (path) => ROUTES.find((route) => route.path === path)

test('canonical origin is the production domain, never a deployment URL', () => {
  assert.equal(SITE_ORIGIN, 'https://www.infinty-bba.com')
  assert.doesNotMatch(SITE_ORIGIN, /vercel\.app|localhost|\/$/)
  assert.equal(absoluteUrl('/'), 'https://www.infinty-bba.com/')
  assert.equal(absoluteUrl('/aivex'), 'https://www.infinty-bba.com/aivex')
})

test('every route declares a robots directive, and only public pages are indexable', () => {
  for (const route of ROUTES) {
    assert.match(route.robots, /^(index|noindex),(follow|nofollow)$/, route.path)
    assert.ok(route.description, `${route.path} needs a description`)
  }
  for (const path of PRIVATE_PATHS) assert.equal(byPath(path).robots, 'noindex,nofollow', path)
  // Transactional forms stay crawlable so their links still pass authority
  // to /aivex, but they must not compete with it in search results.
  for (const path of TRANSACTIONAL_PATHS) assert.equal(byPath(path).robots, 'noindex,follow', path)
  assert.equal(byPath('/aivex').robots, 'index,follow')
})

test('the sitemap lists only indexable public pages — never a private, tokenised or transactional URL', () => {
  const listed = ROUTES.filter((route) => route.sitemap)
  const xml = sitemap(listed)
  for (const route of listed) assert.equal(route.robots, 'index,follow', `${route.path} is in the sitemap`)
  for (const path of [...PRIVATE_PATHS, ...TRANSACTIONAL_PATHS]) {
    assert.ok(!xml.includes(absoluteUrl(path)), `${path} must not be in the sitemap`)
  }
  // Check the URLs themselves: the XML declaration legitimately contains '?'.
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, value]) => value)
  assert.ok(locs.length > 0)
  for (const loc of locs) {
    assert.doesNotMatch(loc, /token|\?|#|\/api\//, loc)
    assert.ok(loc.startsWith(`${SITE_ORIGIN}/`), loc)
  }
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
  assert.ok(xml.includes(`<loc>${SITE_ORIGIN}/aivex</loc>`), 'the AIVEX landing page is listed')
})

test('robots.txt allows the public site, blocks private areas and points at the sitemap', () => {
  const text = robots()
  assert.match(text, /^User-agent: \*$/m)
  assert.match(text, /^Allow: \/$/m)
  assert.match(text, /^Disallow: \/aivex\/status$/m)
  assert.match(text, /^Disallow: \/admin$/m)
  assert.match(text, /^Disallow: \/api\/$/m)
  assert.match(text, new RegExp(`^Sitemap: ${SITE_ORIGIN}/sitemap\\.xml$`, 'm'))
  // Public pages must never be blocked.
  for (const path of ['/aivex', '/events', '/about']) {
    assert.ok(!new RegExp(`^Disallow: ${path}$`, 'm').test(text), `${path} must stay crawlable`)
  }
})

test('the private candidate page carries no canonical, no social tags and no structured data', () => {
  const head = headFor(byPath('/aivex/status'))
  assert.match(head, /name="robots" content="noindex,nofollow"/)
  assert.doesNotMatch(head, /canonical|og:|twitter:|ld\+json/)
  assert.deepEqual(jsonLdFor(byPath('/aivex/status')), [])
  assert.deepEqual(jsonLdFor(byPath('/admin')), [])
  // Nothing in the config may reference a token, a query string or a file.
  assert.doesNotMatch(JSON.stringify(ROUTES), /token|\?|magic-link/i)
})

test('a generated document has exactly one canonical, one description and one og:url', async () => {
  const template = await read('index.html')
  for (const route of ROUTES) {
    const html = renderRoute(template, route)
    const count = (pattern) => (html.match(pattern) || []).length
    assert.equal(count(/name="description"/g), 1, `${route.path} description`)
    assert.equal(count(/name="robots"/g), 1, `${route.path} robots`)
    assert.equal(count(/rel="canonical"/g), route.noCanonical ? 0 : 1, `${route.path} canonical`)
    assert.equal(count(/property="og:url"/g), route.noSocial ? 0 : 1, `${route.path} og:url`)
    assert.equal(count(/property="og:image"/g), route.noSocial || !route.image ? 0 : 1, `${route.path} og:image`)
    if (!route.noCanonical) assert.ok(html.includes(`href="${absoluteUrl(route.path)}"`), `${route.path} self-canonical`)
    // The SPA must still boot from every generated document.
    assert.match(html, /<div id="root">/)
    assert.match(html, /<script type="module"/)
  }
})

test('structured data is valid JSON, describes only real club facts, and claims no unpublished event', () => {
  const org = organizationJsonLd()
  assert.equal(org['@type'], 'Organization')
  assert.equal(org.name, 'Infinity Club')
  assert.equal(org.sameAs[0], 'https://www.instagram.com/club_.infinity/')
  assert.equal(org.email, 'infinity.tech@univ-bba.dz')

  for (const route of ROUTES) {
    for (const block of jsonLdFor(route)) {
      const parsed = JSON.parse(JSON.stringify(block))
      assert.equal(parsed['@context'], 'https://schema.org')
      const flat = JSON.stringify(parsed)
      // No placeholders, no invented dates, no personal data.
      assert.doesNotMatch(flat, /YOUR-|TODO|PLACEHOLDER|example\.com|xxx@/i, route.path)
      assert.doesNotMatch(flat, /"startDate"|"endDate"|"eventStatus"/, `${route.path} must not claim event dates`)
    }
  }
  // AIVEX publishes "Dates and venue: To be confirmed", so Event markup
  // would contradict the page. See docs/seo.md.
  assert.ok(!JSON.stringify(ROUTES.flatMap(jsonLdFor)).includes('"Event"'))
})

test('social preview images exist on disk and are referenced as absolute HTTPS URLs', async () => {
  for (const route of ROUTES) {
    if (!route.image) continue
    assert.ok(await exists(`public${route.image.path}`), `${route.image.path} must exist in public/`)
    assert.ok(route.image.alt && !/infinity club aivex algeria/i.test(route.image.alt), 'alt text describes, never stuffs')
    const head = headFor(route)
    assert.ok(head.includes(`content="https://www.infinty-bba.com${route.image.path}"`), `${route.path} absolute og:image`)
  }
})

test('vercel.json routes every generated document explicitly, before the SPA fallback', async () => {
  const { rewrites } = JSON.parse(await read('vercel.json'))
  const fallbackIndex = rewrites.findIndex((rule) => rule.source.includes('(?!api/)'))
  assert.ok(fallbackIndex > 0, 'the SPA catch-all stays last')
  for (const route of ROUTES) {
    if (route.path === '/') continue
    const index = rewrites.findIndex((rule) => rule.source === route.path)
    assert.ok(index !== -1, `vercel.json needs a rewrite for ${route.path}`)
    assert.ok(index < fallbackIndex, `${route.path} must come before the catch-all`)
    assert.equal(rewrites[index].destination, `${route.path}/index.html`)
  }
  // The API must never be swallowed by the SPA fallback.
  assert.match(rewrites[fallbackIndex].source, /\(\?!api\/\)/)
})

test('routeFor resolves admin sub-paths and trailing slashes to the safest entry', () => {
  assert.equal(routeFor('/aivex').path, '/aivex')
  assert.equal(routeFor('/aivex/').path, '/aivex')
  assert.equal(routeFor('/admin/events').path, '/admin')
  assert.equal(routeFor('/admin/events').robots, 'noindex,nofollow')
  assert.equal(routeFor('/nope-not-a-route'), null, 'unknown paths resolve to nothing, so RouteSeo falls back to noindex')
})

test('titles and descriptions are unique per page and sized for search results', () => {
  const indexable = ROUTES.filter((route) => route.robots === 'index,follow')
  const titles = indexable.map((route) => route.title)
  const descriptions = indexable.map((route) => route.description)
  assert.equal(new Set(titles).size, titles.length, 'no duplicate titles')
  assert.equal(new Set(descriptions).size, descriptions.length, 'no duplicate descriptions')
  for (const route of indexable) {
    assert.ok(route.title.length <= 95, `${route.path} title is ${route.title.length} chars`)
    assert.ok(route.description.length >= 70 && route.description.length <= 340, `${route.path} description is ${route.description.length} chars`)
  }
  // /aivex/register must not compete with /aivex for the same query.
  assert.ok(!byPath('/aivex/register').title.startsWith('AIVEX —'))
})

test('the client-side head sync reuses the same config and never persists anything', async () => {
  const source = await read('src/seo/RouteSeo.jsx')
  assert.match(source, /from '\.\/seoConfig'/)
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|fetch\(/)
  // Unknown paths render the homepage, so they must not self-canonicalise.
  assert.match(source, /noindex,follow/)
})
