import { useState } from 'react'
import EventArtwork from '../../components/EventArtwork'
import InfinityMark from '../../components/InfinityMark'

function EventPlaceholder({ event }) {
  return (
    <div className="event-placeholder" aria-hidden="true">
      <span className="event-placeholder-register"><span>Infinity Club</span><span>{event.year}</span></span>
      <InfinityMark className="event-placeholder-mark" />
      <strong>{event.title}</strong>
      <span className="event-placeholder-foot">{event.category}</span>
    </div>
  )
}

// Photo when there is one, the club's typographic poster when the event has
// one, otherwise a branded placeholder. A missing file falls back silently.
export default function EventVisual({ event, sizes, priority = false }) {
  const [failed, setFailed] = useState(false)
  const { image } = event

  if (image && !failed) {
    return (
      <img
        src={image.src}
        srcSet={image.srcSet}
        sizes={image.srcSet ? sizes : undefined}
        width={image.width}
        height={image.height}
        alt={image.alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        onError={() => setFailed(true)}
      />
    )
  }
  if (event.artwork) return <EventArtwork variant={event.artwork} />
  return <EventPlaceholder event={event} />
}
