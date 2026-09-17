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
    const previousTitle = document.title
    document.title = 'Events | Infinity Club'
    return () => { document.title = previousTitle }
  }, [])

  return (
    <div id="events-page" ref={pageRef} className="events-page">
      <EventsHero />
      <EventArchive />
      <EventsCTA />
    </div>
  )
}
