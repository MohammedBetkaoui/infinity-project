import { useState } from 'react'
import EventArtwork from '../../components/EventArtwork'
import InfinityMark from '../../components/InfinityMark'

const POSTER_STYLES = ['register', 'caption', 'inverse', 'rule']

// Stable choice for events that do not name a composition.
const pickStyle = (id) => POSTER_STYLES[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % POSTER_STYLES.length]

const shortTitle = (title) => title.replace(/^Infinity\s+/i, '')

// Generated posters for events without a visual yet: four compositions from
// the same system (grid, mark, type), never an error state.
function EventPoster({ event }) {
  const style = POSTER_STYLES.includes(event.poster?.style) ? event.poster.style : pickStyle(event.id)
  const lines = event.poster?.lines

  return (
    <div className="event-poster" data-style={style} aria-hidden="true">
      {style === 'caption' ? (
        <span className="event-poster-register"><span>{shortTitle(event.title)} / {event.year}</span></span>
      ) : (
        <span className="event-poster-register"><span>Infinity Club</span><span>{event.year}</span></span>
      )}
      <InfinityMark className="event-poster-mark" />
      {style === 'caption' && lines?.length ? (
        <strong className="event-poster-lines">{lines.map((line) => <span key={line}>{line}</span>)}</strong>
      ) : (
        <strong className="event-poster-title">{shortTitle(event.title)}</strong>
      )}
      <span className="event-poster-foot">
        <span>{event.category}</span>
        {style === 'rule' && <span>{event.edition || event.year}</span>}
      </span>
    </div>
  )
}

// Photo when there is one, the club's typographic poster when the event has
// one, otherwise a generated poster. A missing file falls back silently.
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
  return <EventPoster event={event} />
}
