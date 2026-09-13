import { Link } from 'react-router-dom'

export default function EventsClosing() {
  return (
    <section className="events-closing" aria-labelledby="events-closing-title">
      <div className="page-container events-closing-layout">
        <p>Events are where the club becomes visible.</p>
        <h2 id="events-closing-title">Come with curiosity.<br />Leave with evidence.</h2>
        <Link to="/#contact" className="events-closing-link">Build the next one with us</Link>
      </div>
    </section>
  )
}
