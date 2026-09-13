import { ArrowUpRight } from 'lucide-react'
import { events } from '../../data/siteData'
import EventFeatureCard from './EventFeatureCard'

const currentEvents = events.filter((event) => event.href)

export default function EventsProgramme() {
  return (
    <section id="current-programme" className="events-programme" aria-labelledby="events-programme-title">
      <div className="page-container">
        <header className="events-programme-heading">
          <h2 id="events-programme-title">On the programme</h2>
          <span>{currentEvents.length} {currentEvents.length === 1 ? 'event' : 'events'}</span>
        </header>

        <div className="events-programme-list">
          {currentEvents.map((event) => (
            <EventFeatureCard key={event.name} event={event} />
          ))}
        </div>

        <div className="events-programme-footnote">
          <p>For dates, registration and the next announcement, follow the club.</p>
          <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer">
            Follow @club_.infinity <ArrowUpRight size={15} />
          </a>
        </div>
      </div>
    </section>
  )
}
