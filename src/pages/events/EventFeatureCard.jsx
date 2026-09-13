import { Link } from 'react-router-dom'
import AivexWordmark from '../aivex/AivexWordmark'

export default function EventFeatureCard({ event, index, total }) {
  const serial = String(index + 1).padStart(2, '0')
  const count = String(total).padStart(2, '0')

  return (
    <article id={`event-${event.name.toLowerCase()}`} className="events-feature">
      <svg className="events-feature-network" viewBox="0 0 1200 600" preserveAspectRatio="none" aria-hidden="true">
        <path className="events-feature-guide" d="M34 112H208c72 0 52-67 132-67h624c92 0 55 81 202 81v370h-146" />
        <path className="events-feature-route" d="M34 112H208c72 0 52-67 132-67h624c92 0 55 81 202 81v370h-146" />
        <circle className="events-feature-head-glow" cx="0" cy="0" r="17" />
        <circle className="events-feature-head" cx="0" cy="0" r="4" />
      </svg>

      <Link to={event.href} className="events-feature-visual" aria-label={`Open the ${event.name} event page`}>
        <div className="events-feature-media">
          <img src="/assets/aivex-brain-chip.jpg" alt="Artificial intelligence represented by a brain connected to a processor" />
        </div>
        <span className="events-feature-edition">Second edition</span>
        <span className="events-feature-open">View event</span>
      </Link>

      <div className="events-feature-copy">
        <div className="events-feature-register">
          <span>{serial} / {count}</span>
          <span>Current programme</span>
        </div>
        <AivexWordmark />
        <h3>National AI application programming competition.</h3>
        <p>{event.description}</p>
        <dl>
          <div><dt>Discipline</dt><dd>Artificial intelligence</dd></div>
          <div><dt>Edition</dt><dd>Second</dd></div>
          <div><dt>Location</dt><dd>Bordj Bou Arreridj</dd></div>
        </dl>
        <Link to={event.href} className="events-feature-link" data-magnetic data-ripple>Explore AIVEX</Link>
      </div>
    </article>
  )
}
