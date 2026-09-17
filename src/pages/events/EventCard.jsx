import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import EventVisual from './EventVisual'

const SIZES_WIDE = '(max-width: 767px) calc(100vw - 40px), 58vw'
const SIZES_TILE = '(max-width: 767px) calc(100vw - 40px), (max-width: 1023px) 48vw, 32vw'

function CardLink({ event, className, labelledBy, children }) {
  if (!event.href) return <div className={className}>{children}</div>
  const newTab = event.newTab ? { target: '_blank', rel: 'noreferrer' } : {}
  return /^https?:/.test(event.href)
    ? <a href={event.href} className={className} aria-labelledby={labelledBy} {...newTab}>{children}</a>
    : <Link to={event.href} className={className} aria-labelledby={labelledBy} {...newTab}>{children}</Link>
}

export default function EventCard({ cell, priority = false }) {
  const { event, lg, md, lgWide, mdWide } = cell
  const titleId = `event-${event.id}-title`
  const actionId = `event-${event.id}-action`

  return (
    <article
      className="event-card"
      aria-labelledby={titleId}
      data-lg={lgWide ? 'wide' : 'tile'}
      data-md={mdWide ? 'wide' : 'tile'}
      data-linked={event.href ? '' : undefined}
      data-featured={event.featured ? '' : undefined}
      // Card copy keeps still: the card itself carries the scroll reveal.
      data-animated-text=""
      style={{ '--span-lg': lg, '--span-md': md }}
    >
      <CardLink event={event} className="event-card-link" labelledBy={`${titleId} ${actionId}`}>
        <div className="event-card-media">
          <EventVisual event={event} sizes={lgWide ? SIZES_WIDE : SIZES_TILE} priority={priority} />
          {event.mock && <span className="event-card-sample">Sample</span>}
        </div>
        <div className="event-card-body">
          <p className="event-card-meta">
            <span>{event.category}</span>
            {event.status === 'upcoming'
              ? <span className="event-card-status">Upcoming</span>
              : <span>{event.year}</span>}
          </p>
          <h3 id={titleId}>{event.title}</h3>
          {event.edition && <p className="event-card-edition">{event.edition}</p>}
          <p className="event-card-description">{event.description}</p>
          {event.href && (
            <span className="event-card-action" id={actionId}>
              Explore event <ArrowUpRight size={15} aria-hidden="true" />
              {event.newTab && <span className="sr-only"> (opens in a new tab)</span>}
            </span>
          )}
        </div>
      </CardLink>
    </article>
  )
}
