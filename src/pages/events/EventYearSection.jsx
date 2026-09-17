import { layoutYear, padCount } from './archiveLayout'
import EventCard from './EventCard'

export default function EventYearSection({ year, events, isLatest }) {
  const titleId = `events-${year}-title`
  return (
    <section id={`events-${year}`} className="events-year" aria-labelledby={titleId}>
      <header className="events-year-head">
        <h2 id={titleId} className="events-year-title">{year}</h2>
        <span className="events-year-count">{padCount(events.length)} {events.length === 1 ? 'event' : 'events'}</span>
      </header>
      <div className="events-year-grid">
        {layoutYear(events).map((cell, index) => (
          <EventCard key={cell.event.id} cell={cell} priority={isLatest && index === 0} />
        ))}
      </div>
    </section>
  )
}
