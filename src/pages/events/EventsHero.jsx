import { ArrowDown, ArrowUpRight, Radio } from 'lucide-react'
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { eventArchive } from '../../data/eventArchive'
import '../../components/page-hero.css'
import usePageHeroMotion from '../../hooks/usePageHeroMotion'
import EventVisual from './EventVisual'

const nextEvent = eventArchive.find((event) => event.status === 'upcoming')
const yearCount = new Set(eventArchive.map((event) => event.year)).size
const upcomingCount = eventArchive.filter((event) => event.status === 'upcoming').length

export default function EventsHero() {
  const heroRef = useRef(null)
  usePageHeroMotion(heroRef)

  return (
    <section ref={heroRef} className="page-hero events-page-hero" aria-labelledby="events-page-title">
      <div className="page-container">
        <div className="page-hero-rail">
          <span>Infinity Club / Event programme</span>
          <span>MI Faculty, Bordj Bou Arreridj</span>
        </div>

        <div className="page-hero-layout events-hero-layout">
          <div className="events-hero-copy">
            <p className="events-hero-kicker">Ideas become experiences</p>
            <h1 id="events-page-title" aria-label="Events.">
              <span className="page-hero-title-mask" aria-hidden="true">
                Events<span className="page-hero-title-stop">.</span>
              </span>
            </h1>
            <div className="events-hero-intro">
              <p className="page-hero-lead">Good things happen when we meet.</p>
              <p className="page-hero-summary">
                Competitions, workshops and shared moments designed to move ambitious ideas forward.
              </p>
              <a className="page-hero-jump" href="#event-archive">
                Explore the programme <ArrowDown size={14} strokeWidth={1.8} aria-hidden="true" />
              </a>
            </div>
          </div>

          {nextEvent && (
            <Link
              to={nextEvent.href || '#event-archive'}
              className="events-hero-feature"
              target={nextEvent.newTab ? '_blank' : undefined}
              rel={nextEvent.newTab ? 'noreferrer' : undefined}
              aria-label={`Explore ${nextEvent.title}${nextEvent.newTab ? ' (opens in a new tab)' : ''}`}
            >
              <div className="events-hero-feature-media">
                <EventVisual event={nextEvent} sizes="(max-width: 767px) calc(100vw - 40px), 38vw" priority />
                <span className="events-hero-feature-shade" aria-hidden="true" />
                <span className="events-hero-live"><Radio size={13} aria-hidden="true" /> Now on the programme</span>
                <span className="events-hero-feature-code" aria-hidden="true">IF / {nextEvent.year}</span>
              </div>
              <div className="events-hero-feature-body">
                <div>
                  <span>{nextEvent.category}</span>
                  <h2>{nextEvent.title}</h2>
                  <p>{nextEvent.edition}</p>
                </div>
                <span className="events-hero-feature-action" aria-hidden="true">
                  <ArrowUpRight size={20} strokeWidth={1.6} />
                </span>
              </div>
            </Link>
          )}
        </div>

        <dl className="events-hero-metrics" aria-label="Event archive overview">
          <div><dt>{String(eventArchive.length).padStart(2, '0')}</dt><dd>Experiences</dd></div>
          <div><dt>{String(yearCount).padStart(2, '0')}</dt><dd>Seasons archived</dd></div>
          <div><dt>{String(upcomingCount).padStart(2, '0')}</dt><dd>Coming next</dd></div>
          <div className="events-hero-metrics-note"><dt>Build. Meet. Grow.</dt><dd>The Infinity event rhythm</dd></div>
        </dl>

        <div className="page-hero-rule" aria-hidden="true"><i /></div>
      </div>
    </section>
  )
}
