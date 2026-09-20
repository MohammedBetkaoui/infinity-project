// Single source of truth for site-level SEO: the canonical origin, the
// per-route head metadata, and the organisation facts used in JSON-LD.
//
// Imported by two very different consumers, so it stays plain ESM with no
// imports, no JSX and no browser/Node APIs:
//   - scripts/seo-build.mjs (Node, after `vite build`) bakes this into a
//     real static HTML file per public route, plus sitemap.xml/robots.txt,
//     so crawlers that do NOT run JavaScript (Facebook, WhatsApp,
//     LinkedIn, X...) still get the right title, description and preview;
//   - src/seo/RouteSeo.jsx keeps the same tags in sync during client-side
//     navigation inside the SPA.
//
// Every string here is wording that already exists on the site. Nothing is
// invented: no dates, no venue, no awards, no social accounts beyond the
// club's real Instagram, no claims the pages do not already make.

// The production domain. Not a Vercel deployment URL: those change per
// deployment and must never be canonical.
export const SITE_ORIGIN = 'https://www.infinty-bba.com'

export const SITE_NAME = 'Infinity Club'
export const DEFAULT_LOCALE = 'en'

// Real, verifiable club facts (src/pages/contact/contactData.js,
// src/components/MobileMenu.jsx, src/pages/aivex/aivexData.js).
export const ORGANIZATION = {
  name: 'Infinity Club',
  // The club's own wording for itself (index.html description).
  description: 'Science and technology club of the Faculty of Mathematics and Computer Science at the University of Bordj Bou Arreridj.',
  email: 'infinity.tech@univ-bba.dz',
  instagram: 'https://www.instagram.com/club_.infinity/',
  parentOrganization: 'University of Mohamed El Bachir El Ibrahimi',
  locality: 'Bordj Bou Arréridj',
  country: 'DZ',
}

// Social preview images. Both are real files already in public/assets:
//   og-infinity-club.png  the club mark on its brand colour (built from
//                         public/assets/infinity-logo.html + the site's own
//                         wording -- no photo of anyone, nothing invented)
//   image.png             the actual AIVEX hero visual used on the site
const OG_CLUB = { path: '/assets/og-infinity-club.png', width: 1200, height: 630, alt: 'Infinity Club — science and technology club, University of Bordj Bou Arreridj' }
const OG_AIVEX = { path: '/assets/image.png', width: 1741, height: 907, alt: 'AIVEX, the national AI application programming competition organised by Infinity Club' }

// `robots` follows Google's directive syntax. Only pages meant to be found
// are indexable; transactional and private routes are not (see the
// indexability matrix in docs/seo.md).
const INDEX = 'index,follow'
const NOINDEX_FOLLOW = 'noindex,follow'
const NOINDEX_NOFOLLOW = 'noindex,nofollow'

// One entry per route the SPA serves. `sitemap: true` puts the URL in
// sitemap.xml -- only ever for pages that are also indexable and canonical
// to themselves.
export const ROUTES = [
  {
    path: '/',
    title: 'Infinity Club — Science & Technology Club | University of Bordj Bou Arreridj',
    description: 'Infinity Club is the science and technology student club of the Faculty of Mathematics and Computer Science at the University of Bordj Bou Arreridj: events, competitions, workshops and student projects.',
    robots: INDEX,
    sitemap: true,
    priority: '1.0',
    image: OG_CLUB,
    ogType: 'website',
  },
  {
    path: '/about',
    title: 'About Infinity Club | Science & Technology Club, Bordj Bou Arreridj',
    description: 'Infinity brings students together to explore technology, practise in public and turn early ideas into shared projects. Discover the club, its fields and how it works.',
    robots: INDEX,
    sitemap: true,
    priority: '0.8',
    image: OG_CLUB,
    ogType: 'website',
  },
  {
    path: '/events',
    title: 'Events & Competitions | Infinity Club, Bordj Bou Arreridj',
    description: 'Competitions, workshops, challenges and experiences built by Infinity Club at the University of Bordj Bou Arreridj. Browse what the club has organised through the years.',
    robots: INDEX,
    sitemap: true,
    priority: '0.8',
    image: OG_CLUB,
    ogType: 'website',
  },
  {
    path: '/community',
    title: 'Community | Infinity Club, Bordj Bou Arreridj',
    description: 'Different interests, shared afternoons, things we could not have built alone. Meet the students behind Infinity Club at the University of Bordj Bou Arreridj.',
    robots: INDEX,
    sitemap: true,
    priority: '0.6',
    image: OG_CLUB,
    ogType: 'website',
  },
  {
    path: '/contact',
    title: 'Contact Infinity Club | Bordj Bou Arreridj',
    description: 'Join the team, ask about an event or share an idea with Infinity Club, the science and technology club of the Faculty of Mathematics and Computer Science in Bordj Bou Arreridj.',
    robots: INDEX,
    sitemap: true,
    priority: '0.6',
    image: OG_CLUB,
    ogType: 'website',
  },
  {
    // The primary AIVEX landing page: everything a visitor searching for
    // the competition should find. /aivex/register must not compete with it.
    path: '/aivex',
    title: 'AIVEX — National AI Application Programming Competition | Infinity Club',
    description: 'AIVEX is the national artificial intelligence application programming competition organised by Infinity Club at the Faculty of Mathematics and Computer Science, Bordj Bou Arréridj, Algeria. Second edition: what the competition is, how to prepare and how to register.',
    robots: INDEX,
    sitemap: true,
    priority: '0.9',
    image: OG_AIVEX,
    ogType: 'website',
  },
  {
    // Transactional: the form itself should not rank for "AIVEX" queries,
    // but it must stay crawlable so the link equity reaches /aivex.
    path: '/aivex/register',
    title: 'Register your team | AIVEX, second edition',
    description: 'Team registration form for the AIVEX competition organised by Infinity Club.',
    robots: NOINDEX_FOLLOW,
    sitemap: false,
    image: OG_AIVEX,
    ogType: 'website',
  },
  {
    // Private, tokenised candidate workflow. Never indexed, never followed,
    // never in the sitemap, and no title here on purpose: the page sets its
    // own localised one (src/pages/aivex/status/AivexStatusPage.jsx).
    path: '/aivex/status',
    description: 'Private AIVEX candidate access page.',
    robots: NOINDEX_NOFOLLOW,
    sitemap: false,
    noCanonical: true,
    noSocial: true,
  },
  {
    // Membership application: a form, not a landing page.
    path: '/join',
    title: 'Join Infinity Club | Membership application',
    description: 'Apply to join Infinity Club as a member or as staff. Open to students of different levels and backgrounds at the University of Bordj Bou Arreridj.',
    robots: NOINDEX_FOLLOW,
    sitemap: false,
    image: OG_CLUB,
    ogType: 'website',
  },
  {
    // The back-office shell. Sub-paths are client-side only and fall back to
    // the SPA entry, so robots.txt disallows the whole prefix as well.
    path: '/admin',
    title: 'Infinity Club',
    description: 'Infinity Club administration.',
    robots: NOINDEX_NOFOLLOW,
    sitemap: false,
    noCanonical: true,
    noSocial: true,
  },
]

export const routeFor = (pathname) => {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return ROUTES.find((route) => route.path === clean)
    // Anything unknown (including /admin/*) inherits the safest defaults.
    || (clean.startsWith('/admin') ? ROUTES.find((route) => route.path === '/admin') : null)
}

export const absoluteUrl = (path) => (path === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`)

// JSON-LD. Only facts the site itself states.
//
// Deliberately NOT emitted: schema.org/Event for AIVEX. Structured data has
// to match what the page shows, and the AIVEX page currently publishes
// "Dates and venue: To be confirmed" and "Programme and rules: To be
// announced" (src/pages/aivex/aivexData.js). Event markup needs a real
// startDate and location, so it is added the day the club publishes them --
// see docs/seo.md.
export const organizationJsonLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE_ORIGIN}/#organization`,
  name: ORGANIZATION.name,
  url: `${SITE_ORIGIN}/`,
  description: ORGANIZATION.description,
  logo: `${SITE_ORIGIN}${OG_CLUB.path}`,
  email: ORGANIZATION.email,
  sameAs: [ORGANIZATION.instagram],
  parentOrganization: { '@type': 'CollegeOrUniversity', name: ORGANIZATION.parentOrganization },
  address: { '@type': 'PostalAddress', addressLocality: ORGANIZATION.locality, addressCountry: ORGANIZATION.country },
})

export const webSiteJsonLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE_ORIGIN}/#website`,
  name: SITE_NAME,
  url: `${SITE_ORIGIN}/`,
  inLanguage: DEFAULT_LOCALE,
  publisher: { '@id': `${SITE_ORIGIN}/#organization` },
})

export const webPageJsonLd = (route) => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  '@id': `${absoluteUrl(route.path)}#webpage`,
  url: absoluteUrl(route.path),
  name: route.title,
  description: route.description,
  isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
  about: { '@id': `${SITE_ORIGIN}/#organization` },
  inLanguage: DEFAULT_LOCALE,
})

// The structured data each route ships. Private/transactional routes get
// none at all.
export const jsonLdFor = (route) => {
  if (!route || route.robots === NOINDEX_NOFOLLOW || !route.title) return []
  if (route.path === '/') return [organizationJsonLd(), webSiteJsonLd(), webPageJsonLd(route)]
  if (route.robots === INDEX) return [webPageJsonLd(route)]
  return []
}
