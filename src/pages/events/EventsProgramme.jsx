import { ArrowUpRight } from 'lucide-react'
import { events } from '../../data/siteData'
import EventFeatureCard from './EventFeatureCard'

const currentEvents = events.filter((event) => event.href)

export default function EventsProgramme() {
  return (
    <section id="current-programme" className="events-programme" aria-labelledby="events-programme-title">
      <div className="page-container">
        <header className="events-programme-heading">
          <div>
            <span>{String(currentEvents.length).padStart(2, '0')} current event</span>
            <h2 id="events-programme-title">The current brief.</h2>
          </div>
          <p>One focused programme, presented properly. New events will join this index as the club announces them.</p>
        </header>

        <div className="events-programme-list">
          {currentEvents.map((event, index) => (
            <EventFeatureCard key={event.name} event={event} index={index} total={currentEvents.length} />
          ))}
        </div>

        <div className="events-programme-footnote">
          <p>Announcements, registration dates and behind-the-scenes work are published by the club.</p>
          <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer">
            Follow @club_.infinity <ArrowUpRight size={15} />
          </a>
        </div>
      </div>
    </section>
  )
}
