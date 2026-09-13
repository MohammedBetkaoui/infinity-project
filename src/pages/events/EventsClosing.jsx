import { Link } from 'react-router-dom'

export default function EventsClosing() {
  return (
    <section className="events-closing" aria-labelledby="events-closing-title">
      <div className="page-container events-closing-layout">
        <div>
          <h2 id="events-closing-title">There is a place for you here.</h2>
          <p>Join the team behind the next workshop, competition or student project.</p>
        </div>
        <Link to="/#contact" className="events-closing-link">Get involved</Link>
      </div>
    </section>
  )
}
