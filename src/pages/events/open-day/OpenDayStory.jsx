import { ArrowUpRight } from 'lucide-react'
import { openDayPhotos } from './openDayGallery.js'
import OpenDayFilms from './OpenDayFilms.jsx'

function NotePhoto({ id, className = '', annotation }) {
  const photo = openDayPhotos[id]
  return (
    <figure className={`od-note-photo ${className}`} data-od-reveal="">
      <img src={photo.src} width={photo.width} height={photo.height} alt={photo.alt} loading="lazy" decoding="async" />
      <figcaption><span className="od-label">{annotation}</span><span>{photo.caption}</span></figcaption>
    </figure>
  )
}

export default function OpenDayStory() {
  return (
    <>
      <section id="open-day-notes" className="od-intro od-paper" aria-labelledby="od-intro-title">
        <div className="page-container od-intro-layout">
          <div className="od-intro-register"><p className="od-label">Open Day field notes</p><span aria-hidden="true">05<span>/ OCT / 26</span></span><p className="od-label">Bordj Bou Arreridj</p></div>
          <div>
            <h2 id="od-intro-title">Outside the<br />classroom rhythm.</h2>
            <div className="od-intro-copy">
              <p>Open Day was a chance to meet students outside the usual classroom rhythm: to introduce Infinity, answer questions, share what we build and turn curiosity into conversation.</p>
              <p>On 5 October 2026, the Faculty of Mathematics and Computer Science became a place to discover the club, talk technology and take part. Conversations, chessboards, a clue board and a frame to step into: small ways to meet the community.</p>
            </div>
          </div>
        </div>
      </section>

      <OpenDayFilms />

      <section className="od-conversations" aria-labelledby="od-moments-title">
        <div className="page-container">
          <header className="od-section-rail"><h2 id="od-moments-title" className="od-label">What the day felt like</h2><span className="od-label" aria-hidden="true">Notes from the faculty / 2026</span></header>
          <div className="od-conversation-layout">
            <div className="od-discover">
              <div className="od-moment-copy"><p className="od-label od-mint">Moment 01 / Discover</p><h3>Stop by.<br />Get curious.</h3><p>A first look at Infinity Club, its fields and the people behind the projects. A table in the hall. A reason to start talking.</p></div>
              <NotePhoto id="gathering" annotation="Field note 01 / At the stands" />
            </div>
            <div className="od-ask">
              <NotePhoto id="conversation" annotation="Field note 02 / Across the table" />
              <div className="od-moment-copy"><p className="od-label od-mint">Moment 02 / Ask · AI / Dev</p><h3>Questions become<br />conversations.</h3><p>The AI &amp; Development presence gave students a place to ask about these fields, talk about programming and explore where to begin.</p><p className="od-topics od-label">AI / Development / Programming / Learning</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="od-play od-paper" aria-labelledby="od-play-title">
        <div className="page-container">
          <header className="od-play-heading"><p className="od-label">Moment 03 / Play</p><h2 id="od-play-title">Your move.</h2><p>There was more than one way to join in. A chessboard invited the next move; <em>The Last Equation</em> clue board invited a closer look.</p></header>
          <div className="od-play-layout">
            <NotePhoto id="chess" annotation="03.A / At the chessboards" />
            <div className="od-clue-note"><span className="od-label od-margin-note">Look closer. Follow a thread.</span><NotePhoto id="clue-board" annotation="03.B / The Last Equation" /></div>
          </div>
        </div>
      </section>

      <section className="od-spin" aria-labelledby="od-spin-title">
        <div className="page-container od-spin-layout">
          <NotePhoto id="spin" annotation="03.C / Spin-game artwork" />
          <div className="od-spin-copy">
            <p className="od-label od-mint">Another way to take part</p>
            <h2 id="od-spin-title">SPIN. PLAY.<br />REPEAT.</h2>
            <p>One spin, one challenge. The Open Day game gave students a playful way to interact with the stand, with prompts to guess, think and answer.</p>
            <a className="od-text-link od-spin-link" href="https://open-day-psi.vercel.app/" target="_blank" rel="noopener noreferrer">
              Play the spin game <ArrowUpRight size={18} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
            </a>
            <span className="od-label od-spin-foot">Infinity Club / Open Day / 05 OCT 26</span>
          </div>
        </div>
      </section>
    </>
  )
}
