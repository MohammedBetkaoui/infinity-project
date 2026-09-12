import { ArrowUpRight, CalendarDays } from 'lucide-react'
import { INSTAGRAM_URL, practicalDetails } from './aivexData'

export default function AivexDetails() {
  return (
    <section className="ax-details" id="participer" aria-labelledby="ax-details-title" tabIndex={-1}>
      <div className="ax-container ax-details-layout">
        <div className="ax-details-intro">
          <h2 id="ax-details-title">Your next step<br />starts here.</h2>
          <p>Want to take part in AIVEX? Here is what we can share about the second edition so far.</p>
          <div className="ax-announcement"><CalendarDays size={21} aria-hidden="true" /><div><strong>The details are taking shape.</strong><p>Dates, rules and registration: follow the club account for official announcements.</p></div></div>
          <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="ax-text-link">See announcements on Instagram <ArrowUpRight size={16} aria-hidden="true" /></a>
        </div>
        <dl className="ax-facts">
          {practicalDetails.map(item => (
            <div className="ax-fact" key={item.label}>
              <dt>{item.label}</dt>
              <dd><strong className={item.pending ? 'ax-pending' : undefined}>{item.pending && <i aria-hidden="true" />}{item.value}</strong><p>{item.detail}</p></dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
