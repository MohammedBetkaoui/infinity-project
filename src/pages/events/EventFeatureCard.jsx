import { Link } from 'react-router-dom'
import EventPreview from './EventPreview'

export default function EventFeatureCard({ event }) {
  const titleId = `event-${event.name.toLowerCase()}-title`

  return (
    <article className="events-feature" aria-labelledby={titleId}>
      <Link to={event.href} target={event.newTab ? '_blank' : undefined} rel={event.newTab ? 'noreferrer' : undefined} className="events-feature-link" aria-labelledby={`${titleId} ${titleId}-action`}>
        <header className="events-feature-heading">
          <div className="events-feature-name">
            <h3 id={titleId}>{event.name}</h3>
            <span className="events-feature-edition">{event.edition}</span>
          </div>
          <p>{event.type}</p>
        </header>

        <EventPreview preview={event.preview} />

        <div className="events-feature-details">
          <p className="events-feature-summary">{event.summary}</p>
          <p className="events-feature-location">Infinity Club<span>Bordj Bou Arreridj, Algeria</span></p>
          <span className="events-feature-action" id={`${titleId}-action`}>Explore {event.name}</span>
        </div>
      </Link>
    </article>
  )
}
