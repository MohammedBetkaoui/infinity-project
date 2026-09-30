import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function EventsCTA() {
  return (
    <section className="events-cta" aria-labelledby="events-cta-title">
      <div className="page-container events-cta-layout">
        <p className="events-cta-index" aria-hidden="true">∞ / NEXT</p>
        <div className="events-cta-copy">
          <p className="events-cta-kicker">Your place is waiting</p>
          <h2 id="events-cta-title">Don’t just watch what comes next. Help build it.</h2>
          <p>Join Infinity and take part in the next workshops, competitions and experiences.</p>
        </div>
        <Link to="/join" className="events-cta-link">Join the club <ArrowUpRight size={17} aria-hidden="true" /></Link>
      </div>
    </section>
  )
}
