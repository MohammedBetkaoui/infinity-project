import { messageSteps } from './contactData'

export default function ContactRoute() {
  return (
    <section className="contact-route" aria-labelledby="contact-route-title">
      <div className="page-container contact-route-heading">
        <h2 id="contact-route-title">A useful first<br />message travels further.</h2>
        <p>A little context helps the right person in the club understand your message and continue the conversation.</p>
      </div>

      <div className="page-container contact-route-layout">
        <figure className="contact-route-map" aria-label="A message moving through three points towards Infinity Club">
          <div className="contact-route-map-top"><span>Message route</span><span>BBA / INFINITY</span></div>
          <svg viewBox="0 0 560 320" role="img" aria-hidden="true">
            <path className="contact-route-grid" d="M30 50C178 50 134 160 280 160S392 270 530 270" />
            <path className="contact-route-ink" d="M30 50C178 50 134 160 280 160S392 270 530 270" />
            <g className="contact-route-stations">
              <circle cx="30" cy="50" r="5" />
              <circle cx="280" cy="160" r="5" />
              <circle cx="530" cy="270" r="5" />
            </g>
            <circle className="contact-route-signal" cx="0" cy="0" r="6" />
          </svg>
          <figcaption><span>From a question</span><span>To a conversation</span></figcaption>
        </figure>

        <ol className="contact-message-steps">
          {messageSteps.map((step, index) => (
            <li key={step.title} data-step={index}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div><h3>{step.title}</h3><p>{step.note}</p></div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
