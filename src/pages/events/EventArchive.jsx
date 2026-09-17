import { useEffect, useRef, useState } from 'react'
import { eventArchive } from '../../data/eventArchive'
import { groupEventsByYear, padCount } from './archiveLayout'
import EventYearSection from './EventYearSection'

const years = groupEventsByYear(eventArchive)

// The year whose section crosses the upper-middle band of the viewport.
function useCurrentYear(rootRef) {
  const [current, setCurrent] = useState(null)
  useEffect(() => {
    const sections = [...rootRef.current.querySelectorAll('.events-year')]
    const visible = new Map()
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => visible.set(entry.target.dataset.year, entry.isIntersecting))
      const first = sections.find((section) => visible.get(section.dataset.year))
      setCurrent(first ? Number(first.dataset.year) : null)
    }, { rootMargin: '-30% 0px -60% 0px' })
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [rootRef])
  return current
}

export default function EventArchive() {
  const rootRef = useRef(null)
  const currentYear = useCurrentYear(rootRef)

  return (
    <section id="event-archive" ref={rootRef} className="events-archive" aria-labelledby="events-archive-title">
      <div className="page-container">
        <header className="events-archive-head">
          <p className="events-archive-eyebrow">Event archive</p>
          <div className="events-archive-intro">
            <h2 id="events-archive-title">Built through the years.</h2>
            <p>Explore the competitions, workshops and experiences that shaped Infinity Club.</p>
          </div>
          {years.length > 1 && (
            <nav className="events-year-nav" aria-label="Jump to a year">
              <span aria-hidden="true">Jump to</span>
              <ul>
                {years.map(({ year }) => (
                  <li key={year}>
                    <a href={`#events-${year}`} aria-current={currentYear === year ? 'location' : undefined}>{year}</a>
                  </li>
                ))}
              </ul>
              <span className="events-archive-count">{padCount(eventArchive.length)} events</span>
            </nav>
          )}
        </header>

        {years.map(({ year, events }, index) => (
          <EventYearSection key={year} year={year} events={events} isLatest={index === 0} />
        ))}
      </div>
    </section>
  )
}
