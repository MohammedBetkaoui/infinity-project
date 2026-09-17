import { eventArchive } from '../../data/eventArchive'
import { groupEventsByYear, padCount } from './archiveLayout'
import EventYearSection from './EventYearSection'

const years = groupEventsByYear(eventArchive)

export default function EventArchive() {
  return (
    <section id="event-archive" className="events-archive" aria-labelledby="events-archive-title">
      <div className="page-container">
        <header className="events-archive-head">
          <p className="events-archive-eyebrow">Event archive</p>
          <div className="events-archive-intro">
            <h2 id="events-archive-title">Built through the years.</h2>
            <div>
              <p>Explore the competitions, workshops and experiences that shaped Infinity Club.</p>
              <span className="events-archive-count">{padCount(eventArchive.length)} events · {years.length} years</span>
            </div>
          </div>
          {years.length > 1 && (
            <nav className="events-year-nav" aria-label="Jump to a year">
              <span aria-hidden="true">Jump to</span>
              <ul>
                {years.map(({ year }) => (
                  <li key={year}><a href={`#events-${year}`}>{year}</a></li>
                ))}
              </ul>
            </nav>
          )}
        </header>

        {years.map(({ year, events }, index) => (
          <EventYearSection key={year} year={year} events={events} isLatest={index === 0} />
        ))}
      </div>
    </section>
  )
}
