import { useEffect, useRef } from 'react'
import EventsClosing from './EventsClosing'
import EventsHero from './EventsHero'
import EventsProgramme from './EventsProgramme'
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
      <EventsProgramme />
      <EventsClosing />
    </div>
  )
}
