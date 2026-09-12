import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import SectionHeading from '../components/SectionHeading'
import EventArtwork from '../components/EventArtwork'
import TiltCard from '../components/TiltCard'
import { events } from '../data/siteData'
import { GSAP_EASE } from '../lib/motion'

gsap.registerPlugin(ScrollTrigger)

export default function Events() {
  const sectionRef = useRef(null)
  const years = [...new Set(events.map((event) => event.year))]

  useLayoutEffect(() => {
    const media = gsap.matchMedia()
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from('.event-network-path', {
        strokeDasharray: 1, strokeDashoffset: 1, duration: 1.1, stagger: .14,
        ease: GSAP_EASE.smooth,
        scrollTrigger: { trigger: '[data-aivex-network]', start: 'top 85%', once: true },
      })
    }, sectionRef)
    return () => media.revert()
  }, [])

  return (
    <section id="evenements" ref={sectionRef} className="events-section section-space">
      <div className="page-container">
        <div className="section-intro">
          <SectionHeading title="Des idées qui se rencontrent." />
          <p>Un atelier, une conférence, une première démo. Des rendez-vous pour sortir des cours et passer à la pratique.</p>
        </div>
        {years.map((year) => (
          <div key={year} className="event-year-group">
            <h3 className="event-year"><span>{year}</span><i aria-hidden="true" /></h3>
            <div className="event-grid">
              {events.filter((event) => event.year === year).map((event) => (
                <TiltCard key={event.name} className={`event-card event-card-${event.visual}`}>
                  <EventArtwork variant={event.visual} />
                  <div className="event-copy">
                    <p className="event-type">{event.type}</p>
                    <div className="event-title-row">
                      <h4>{event.name}</h4>
                      {event.href ? <Link to={event.href} className="event-page-link" aria-label={`Découvrir la compétition ${event.name}`}>Découvrir</Link> : <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer"
                        aria-label={`Découvrir ${event.name} sur Instagram`} className="event-external">
                        <ArrowUpRight size={20} />
                      </a>}
                    </div>
                    <p className="event-description">{event.description}</p>
                  </div>
                </TiltCard>
              ))}
            </div>
          </div>
        ))}
        <p className="event-note">Les annonces et les souvenirs du club se retrouvent sur <a href="https://www.instagram.com/club_.infinity/" target="_blank" rel="noreferrer">Instagram <ArrowUpRight size={12} /></a>.</p>
      </div>
    </section>
  )
}
