import { useEffect, useRef } from 'react'
import EventArchive from './EventArchive'
import EventsCTA from './EventsCTA'
import EventsHero from './EventsHero'
import useEventsPageMotion from './useEventsPageMotion'
import './events.css'

export default function EventsPage() {
  const pageRef = useRef(null)
  useEventsPageMotion(pageRef)

  useEffect(() => {
    const html = document.documentElement
    const previousPage = html.dataset.page
    // Scopes the compact sticky header (events.css) to this page only.
    // The document title belongs to src/seo/RouteSeo.jsx.
    html.dataset.page = 'events'
    return () => {
      if (previousPage) html.dataset.page = previousPage
      else delete html.dataset.page
    }
  }, [])

  return (
    <div id="events-page" ref={pageRef} className="events-page">
      <EventsHero />
      <EventArchive />
      <EventsCTA />
    </div>
  )
}
