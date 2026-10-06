import { ArrowDown, ArrowLeft, CirclePlay } from 'lucide-react'
import { Link } from 'react-router-dom'
import { openDayPhotos } from './openDayGallery.js'

export default function OpenDayHero() {
  const photo = openDayPhotos.hall
  return (
    <section className="od-hero" aria-labelledby="open-day-title">
      <div className="page-container">
        <div className="od-rail">
          <Link to="/events" className="od-back"><ArrowLeft size={14} aria-hidden="true" /> Events archive</Link>
          <span className="od-label">A day in motion / BBA · Algeria</span>
        </div>
        <div className="od-hero-layout">
          <div className="od-hero-copy">
            <p className="od-label od-mint">Infinity Club · Open Day</p>
            <h1 id="open-day-title"><span className="od-title-line"><span className="od-title-word">OPEN</span></span><span className="od-title-line"><span className="od-title-word">DAY<span className="od-title-stop" aria-hidden="true">.</span></span></span></h1>
            <p className="od-hero-lead">One day to meet,<br />ask, try and discover.</p>
            <time className="od-date" dateTime="2026-10-05" aria-label="5 October 2026">
              <span className="od-date-day">05</span>
              <span className="od-date-month">OCT<span>2026</span></span>
            </time>
            <div className="od-hero-actions"><a className="od-text-link" href="#club-film">Watch the film <CirclePlay size={17} aria-hidden="true" /></a><a className="od-text-link" href="#open-day-notes">Read the field notes <ArrowDown size={16} aria-hidden="true" /></a></div>
          </div>
          <figure className="od-hero-print">
            <span className="od-print-edge od-label" aria-hidden="true">Infinity Club / Faculty field notes / 05 OCT 26</span>
            <div className="od-hero-image">
              <img src={photo.src} width={photo.width} height={photo.height} alt={photo.alt} loading="eager" fetchPriority="high" decoding="async" />
            </div>
            <figcaption><span className="od-label">01 / The faculty hall</span><span className="od-label">05 · OCT · 26</span></figcaption>
          </figure>
        </div>
        <div className="od-hero-foot od-label"><span>Faculty of Mathematics and Computer Science</span><span>University of Bordj Bou Arreridj</span></div>
      </div>
    </section>
  )
}
