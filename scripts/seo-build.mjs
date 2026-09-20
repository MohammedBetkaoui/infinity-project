// Post-build SEO pass (runs after `vite build`, see package.json).
//
// The site is a client-rendered SPA: without this step every URL would ship
// the one `dist/index.html`, so every page would share one title, one
// description and one preview image — and the crawlers that matter most for
// sharing (Facebook, WhatsApp, LinkedIn, X) never run JavaScript, so they
// would never see the per-page tags the app sets at runtime.
//
// So for each public route this writes a real static HTML file with the
// right <head> baked in. The body is untouched: the same SPA boots, React
// Router renders the same page, nothing about the application changes.
// Vercel serves a matching static file before it applies the SPA rewrite in
// vercel.json, so /aivex hits dist/aivex/index.html and everything else
// still falls through to the SPA entry.
//
// It also emits sitemap.xml and robots.txt from the same config, so the
// canonical origin and the route list can never drift apart.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  ROUTES, SITE_NAME, SITE_ORIGIN, absoluteUrl, jsonLdFor,
} from '../src/seo/seoConfig.js'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const tag = (name, content) => (content ? `    <meta ${name.startsWith('og:') || name.startsWith('article:') ? 'property' : 'name'}="${name}" content="${escapeHtml(content)}" />\n` : '')

export function headFor(route) {
  const url = absoluteUrl(route.path)
  const image = route.image ? `${SITE_ORIGIN}${route.image.path}` : null
  let head = ''

  head += tag('description', route.description)
  head += tag('robots', route.robots)
  // Canonical: exactly one per indexable page, no query string, no
  // deployment URL. Private/tokenised routes get none on purpose — a
  // canonical there would only advertise the URL.
  if (!route.noCanonical) head += `    <link rel="canonical" href="${escapeHtml(url)}" />\n`

  if (!route.noSocial) {
    head += tag('og:site_name', SITE_NAME)
    head += tag('og:type', route.ogType || 'website')
    head += tag('og:title', route.title)
    head += tag('og:description', route.description)
    head += tag('og:url', url)
    head += tag('og:locale', 'en_US')
    if (image) {
      head += tag('og:image', image)
      head += tag('og:image:width', String(route.image.width))
      head += tag('og:image:height', String(route.image.height))
      head += tag('og:image:alt', route.image.alt)
      head += tag('twitter:card', 'summary_large_image')
      head += tag('twitter:image', image)
    } else {
      head += tag('twitter:card', 'summary')
    }
    head += tag('twitter:title', route.title)
    head += tag('twitter:description', route.description)
  }

  for (const block of jsonLdFor(route)) {
    // JSON-LD is data, not markup: the only character that can break out of
    // a <script> block is '<', which JSON.stringify leaves untouched.
    head += `    <script type="application/ld+json">${JSON.stringify(block).replace(/</g, '\\u003c')}</script>\n`
  }
  return head
}

export function renderRoute(template, route) {
  let html = template

  if (route.title) {
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(route.title)}</title>`)
  }
  // index.html carries the homepage's own description, canonical and social
  // tags, as the fallback for any route without a generated document. Every
  // generated route strips them first: two canonicals (one of them pointing
  // at the homepage) or two og:url values would be worse than none.
  html = html
    .replace(/\n\s*<meta\s+name="description"[\s\S]*?\/>/g, '')
    .replace(/\n\s*<link\s+rel="canonical"[^>]*\/>/g, '')
    .replace(/\n\s*<meta\s+property="og:[^"]*"[^>]*\/>/g, '')
    .replace(/\n\s*<meta\s+name="twitter:[^"]*"[^>]*\/>/g, '')

  html = html.replace('</head>', `${headFor(route)}  </head>`)
  return html
}

export function sitemap(routes) {
  // No <lastmod>: the repository has no trustworthy per-page modification
  // date, and a made-up one is worse than none.
  const entries = routes.map((route) => [
    '  <url>',
    `    <loc>${absoluteUrl(route.path)}</loc>`,
    route.priority ? `    <priority>${route.priority}</priority>` : '',
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`
}

export function robots() {
  return [
    '# Infinity Club — https://www.infinty-bba.com',
    'User-agent: *',
    'Allow: /',
    '',
    '# Private candidate workflow: tokenised URLs, never meant to be fetched.',
    '# The pages themselves also serve noindex,nofollow.',
    'Disallow: /aivex/status',
    '',
    '# Back-office and API surface.',
    'Disallow: /admin',
    'Disallow: /api/',
    '',
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    '',
  ].join('\n')
}

export async function main() {
  const template = await readFile(join(DIST, 'index.html'), 'utf8')
  const written = []

  for (const route of ROUTES) {
    const html = renderRoute(template, route)
    const target = route.path === '/' ? join(DIST, 'index.html') : join(DIST, route.path.slice(1), 'index.html')
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, html, 'utf8')
    written.push(route.path)
  }

  const indexable = ROUTES.filter((route) => route.sitemap)
  await writeFile(join(DIST, 'sitemap.xml'), sitemap(indexable), 'utf8')
  await writeFile(join(DIST, 'robots.txt'), robots(), 'utf8')

  console.log(`[seo] ${written.length} route documents, ${indexable.length} sitemap URLs, robots.txt — canonical origin ${SITE_ORIGIN}`)
  console.log(`[seo] indexable: ${indexable.map((route) => route.path).join(', ')}`)
}

// Only when run as a script (`node scripts/seo-build.mjs`); tests import the
// pure builders above without writing anything.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
