import EventsSignal from './EventsSignal'

export default function EventsHero() {
  return (
    <section className="events-page-hero" aria-labelledby="events-page-title">
      <div className="page-container">
        <div className="events-hero-rail">
          <span>Infinity Club events</span>
          <span>Built by students in Bordj Bou Arreridj</span>
        </div>
        <div className="events-hero-layout">
          <div className="events-hero-copy">
            <p className="events-hero-lead">Ideas change when they meet a real room.</p>
            <h1 id="events-page-title" aria-label="A place for ideas in motion.">
              <span><span className="events-title-line">A place for</span></span>
              <span><span className="events-title-line">ideas in motion.</span></span>
            </h1>
            <p className="events-hero-summary">Our events turn curiosity into a shared deadline, a working team and something worth showing.</p>
            <a className="events-hero-jump" href="#current-programme">See the current programme</a>
          </div>
          <EventsSignal />
        </div>
        <dl className="events-hero-facts">
          <div><dt>Now</dt><dd>1 active event</dd></div>
          <div><dt>Format</dt><dd>National competition</dd></div>
          <div><dt>Home</dt><dd>MI Faculty, BBA</dd></div>
        </dl>
      </div>
    </section>
  )
}
