import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { ROUTES, absoluteUrl, routeFor } from './seoConfig'

// Keeps the document head correct during client-side navigation.
//
// The authoritative tags are baked into a real static HTML file per route by
// scripts/seo-build.mjs, which is what crawlers that don't run JavaScript
// read. This component only handles the other half: once the SPA takes over
// and the visitor moves between routes without a reload, the head still has
// to follow. It writes the same values from the same config, so the two can
// never disagree.
//
// Deliberately tiny: no library, no context, no re-render — a few DOM
// attribute writes per navigation.

const upsert = (selector, create) => {
  let element = document.head.querySelector(selector)
  if (!element) {
    element = create()
    document.head.appendChild(element)
  }
  return element
}

const setMeta = (name, content) => {
  const attribute = name.startsWith('og:') ? 'property' : 'name'
  if (!content) {
    document.head.querySelector(`meta[${attribute}="${name}"]`)?.remove()
    return
  }
  upsert(`meta[${attribute}="${name}"]`, () => {
    const meta = document.createElement('meta')
    meta.setAttribute(attribute, name)
    return meta
  }).setAttribute('content', content)
}

export default function RouteSeo() {
  const { pathname } = useLocation()

  useEffect(() => {
    const route = routeFor(pathname)
      // An unknown path renders the homepage (App.jsx redirects `*` to `/`),
      // so it should not advertise itself as its own indexable page.
      || { robots: 'noindex,follow', noCanonical: true, noSocial: true }

    // Titles: only when the config owns one. /aivex/status sets its own,
    // localised, and must keep doing so.
    if (route.title) document.title = route.title

    setMeta('description', route.description)
    setMeta('robots', route.robots)

    const canonical = document.head.querySelector('link[rel="canonical"]')
    if (route.noCanonical || !route.path) {
      canonical?.remove()
    } else {
      const url = absoluteUrl(route.path)
      upsert('link[rel="canonical"]', () => {
        const link = document.createElement('link')
        link.setAttribute('rel', 'canonical')
        return link
      }).setAttribute('href', url)
      setMeta('og:url', url)
    }

    if (route.noSocial) {
      for (const name of ['og:title', 'og:description', 'og:url', 'og:image', 'twitter:title', 'twitter:description', 'twitter:image']) setMeta(name, '')
    } else {
      setMeta('og:title', route.title)
      setMeta('og:description', route.description)
      setMeta('twitter:title', route.title)
      setMeta('twitter:description', route.description)
    }
  }, [pathname])

  return null
}

// Re-exported so tests and the build script agree on one route list.
export { ROUTES }
