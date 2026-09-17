import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import EventVisual from './EventVisual'

const SIZES = {
  featured: '(max-width: 767px) calc(100vw - 40px), 58vw',
  standard: '(max-width: 767px) calc(100vw - 40px), 48vw',
}

function CardLink({ event, className, labelledBy, children }) {
  if (!event.href) return <div className={className}>{children}</div>
  const newTab = event.newTab ? { target: '_blank', rel: 'noreferrer' } : {}
  return /^https?:/.test(event.href)
    ? <a href={event.href} className={className} aria-labelledby={labelledBy} {...newTab}>{children}</a>
    : <Link to={event.href} className={className} aria-labelledby={labelledBy} {...newTab}>{children}</Link>
}

export default function EventCard({ cell, priority = false }) {
  const { event, variant } = cell
  const featured = variant === 'featured'
  const linked = Boolean(event.href)
  const titleId = `event-${event.id}-title`
  const actionId = `event-${event.id}-action`
  const actionLabel = `Explore event${event.newTab ? ' (opens in a new tab)' : ''}`

  return (
    <article
      className="event-card"
      aria-labelledby={titleId}
      data-variant={variant}
      data-linked={linked ? '' : undefined}
      // Card copy keeps still: the card itself carries the scroll reveal.
      data-animated-text=""
    >
      <CardLink event={event} className="event-card-link" labelledBy={`${titleId} ${actionId}`}>
        <div className="event-card-media">
          <EventVisual event={event} sizes={SIZES[variant]} priority={priority} />
        </div>
        <div className="event-card-body">
          <p className="event-card-meta">
            <span>{event.category}</span>
            {event.status === 'upcoming' && <span className="event-card-status">Upcoming</span>}
          </p>
          <div className="event-card-heading">
            <h3 id={titleId}>{event.title}</h3>
            {linked && !featured && <ArrowUpRight className="event-card-arrow" size={20} strokeWidth={1.6} aria-hidden="true" />}
          </div>
          <p className="event-card-edition">{event.edition || event.year}</p>
          {event.description && <p className="event-card-description">{event.description}</p>}
          {linked && (featured ? (
            <span className="event-card-action" id={actionId}>
              Explore event
              <ArrowUpRight className="event-card-arrow" size={15} aria-hidden="true" />
              {event.newTab && <span className="sr-only"> (opens in a new tab)</span>}
            </span>
          ) : (
            <span className="sr-only" id={actionId}>{actionLabel}</span>
          ))}
        </div>
      </CardLink>
    </article>
  )
}
