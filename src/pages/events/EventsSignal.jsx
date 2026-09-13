export default function EventsSignal() {
  return (
    <figure className="events-signal" aria-label="One active Infinity Club event">
      <div className="events-signal-scroll">
        <div className="events-signal-register">
          <span>Programme signal</span>
          <span>01 active event</span>
        </div>
        <svg viewBox="0 0 560 390" role="img" aria-label="A route connecting an idea to a live event">
          <path className="events-hero-guide" d="M51 298C127 262 101 113 217 112c120-2 102 208 211 151 64-34 50-127 91-184" />
          <path className="events-hero-route" d="M51 298C127 262 101 113 217 112c120-2 102 208 211 151 64-34 50-127 91-184" />
          <g className="events-hero-grid">
            <path d="M28 64H532M28 194H532M28 326H532M95 34V354M280 34V354M465 34V354" />
          </g>
          <g className="events-hero-nodes">
            <circle cx="51" cy="298" r="5" />
            <circle cx="217" cy="112" r="5" />
            <circle cx="428" cy="263" r="5" />
            <circle cx="519" cy="79" r="5" />
          </g>
          <circle className="events-hero-head-glow" cx="0" cy="0" r="15" />
          <circle className="events-hero-head" cx="0" cy="0" r="4" />
        </svg>
        <div className="events-signal-caption">
          <strong>Idea</strong>
          <span>Team</span>
          <span>Deadline</span>
          <strong>Outcome</strong>
        </div>
        <span className="events-signal-index" aria-hidden="true">01</span>
      </div>
    </figure>
  )
}
