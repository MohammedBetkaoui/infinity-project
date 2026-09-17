import { Link } from 'react-router-dom'

export default function EventsCTA() {
  return (
    <section className="events-cta" aria-labelledby="events-cta-title">
      <div className="page-container events-cta-layout">
        <div>
          <h2 id="events-cta-title">Want to be part of what comes next?</h2>
          <p>Join Infinity and take part in the next workshops, competitions and experiences.</p>
        </div>
        <Link to="/join" className="events-cta-link">Join the club</Link>
      </div>
    </section>
  )
}
