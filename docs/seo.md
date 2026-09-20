# SEO — Infinity Club & AIVEX

> Status: implemented 2026-09-20. Canonical domain `https://www.infinty-bba.com`.
> Nothing here changes the application's behaviour, routing or security: the
> SEO layer only adds head metadata, a sitemap and a robots file.

## How it works

The site is a client-rendered SPA. Without help, every URL would serve the
single `dist/index.html`, so every page would share one title, one
description and one social preview — and the crawlers that matter for
sharing (Facebook, WhatsApp, LinkedIn, X) never execute JavaScript, so
runtime metadata would be invisible to them.

Three pieces solve that, all fed by **one config**,
[`src/seo/seoConfig.js`](../src/seo/seoConfig.js):

| Piece | Runs | Responsibility |
|---|---|---|
| [`scripts/seo-build.mjs`](../scripts/seo-build.mjs) | after `vite build` | Writes a real static HTML document per route with the right `<head>` baked in, plus `sitemap.xml` and `robots.txt`. |
| [`src/seo/RouteSeo.jsx`](../src/seo/RouteSeo.jsx) | in the browser | Keeps title/description/canonical/robots correct during client-side navigation, from the same config. |
| [`vercel.json`](../vercel.json) | at the edge | Routes each public path to its generated document, before the SPA catch-all. |

Because both the static document and the runtime read the same config, the
two can never disagree — a regression test asserts it.

**Adding a route:** add it to `ROUTES` in `src/seo/seoConfig.js` *and* add a
rewrite in `vercel.json`. `tests/seo.test.mjs` fails if you forget the second.

## Indexability matrix

| URL | Indexable | Sitemap | Canonical | Structured data | Reason |
|---|---|---|---|---|---|
| `/` | YES | YES | self | Organization + WebSite + WebPage | Main brand page |
| `/about` | YES | YES | self | WebPage | Public club information |
| `/events` | YES | YES | self | WebPage | Public events archive |
| `/aivex` | YES | YES | self | WebPage | **Primary AIVEX landing page** |
| `/community` | YES | YES | self | WebPage | Public club information |
| `/contact` | YES | YES | self | WebPage | Public contact information |
| `/aivex/register` | NO (`noindex,follow`) | NO | self | none | Transactional form; must not compete with `/aivex` |
| `/join` | NO (`noindex,follow`) | NO | self | none | Membership form, transactional |
| `/aivex/status` | **NO (`noindex,nofollow`)** | NO | **none** | none | **Private, tokenised candidate workflow** |
| `/admin`, `/admin/*` | NO (`noindex,nofollow`) | NO | none | none | Back-office |
| `/api/*` | NO (disallowed) | NO | none | none | Serverless API |

`follow` on the two forms is deliberate: the pages stay crawlable so their
links still pass authority to `/aivex`, they just never rank themselves.

## Privacy rules enforced by tests

The AIVEX system handles student names, phone numbers, RFIDs, student-card
images and signed documents. None of it may ever surface through SEO, so
[`tests/seo.test.mjs`](../tests/seo.test.mjs) asserts:

- `/aivex/status` is `noindex,nofollow`, has **no canonical**, no Open Graph
  tags and no structured data — a canonical there would only advertise the URL;
- no sitemap entry contains a query string, a token or `/api/`;
- nothing in the SEO config mentions a token or a magic link;
- no structured data block contains personal data or a placeholder.

A browser check also confirmed that loading `/aivex/status?token=…` leaves
the token entirely out of the document head.

## Two decisions that need the club, not code

**1. No `Event` structured data for AIVEX yet — and no year in the title.**

The brief asked for `Event` markup and "AIVEX 2026" targeting. The public
AIVEX page currently states:

> Dates and venue — **To be confirmed** · Programme and rules — **To be announced**
> (`src/pages/aivex/aivexData.js`)

and never states a year. Schema.org `Event` requires a real `startDate` and
location, and Google requires structured data to match the visible page, so
publishing dates — or a "2026" title — would mean inventing information the
site does not claim. Both were therefore left out.

*This is the single highest-impact SEO action available:* the day the club
publishes the confirmed edition year, dates and venue on `/aivex`, add them
to the page and then to `seoConfig.js`, and the `Event` block plus a
year-bearing title become a small, safe follow-up.

**2. Thin crawlable copy on the homepage.**

`/` renders ~95 words of text (`/aivex` renders ~260). For brand queries
like "Infinity Club BBA", a short real paragraph of club description on the
homepage would help considerably. Writing it is an editorial decision for
the club — no placeholder copy was added.

## Known limitation

Unknown URLs (e.g. `/typo`) render the homepage: `App.jsx` redirects `*` to
`/` client-side, and the served document canonicalises to `/`, which
consolidates rather than duplicates. It is a soft 404, not a real one —
returning a true 404 status would require server-side handling, which is
outside the scope of an SEO pass.

## Verification

```
npm run build        # regenerates the documents, sitemap.xml and robots.txt
npm test             # includes tests/seo.test.mjs
```

After deploying, check `https://www.infinty-bba.com/robots.txt` and
`/sitemap.xml`, then submit the sitemap in Google Search Console and use the
URL Inspection tool on `/` and `/aivex`.
