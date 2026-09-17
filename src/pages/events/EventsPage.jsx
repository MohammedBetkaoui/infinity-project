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
    const previousTitle = document.title
    const previousPage = html.dataset.page
    document.title = 'Events | Infinity Club'
    // Scopes the compact sticky header (events.css) to this page only.
    html.dataset.page = 'events'
    return () => {
      document.title = previousTitle
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
