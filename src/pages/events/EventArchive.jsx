import { LayoutGrid, List, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { eventArchive } from '../../data/eventArchive'
import { groupEventsByYear, padCount } from './archiveLayout'
import EventYearSection from './EventYearSection'

const FILTERS = [
  { value: 'all', label: 'All events' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
]

const eventStatus = (event) => event.status || 'past'
const EVENT_COUNTS = eventArchive.reduce((counts, event) => {
  counts.all += 1
  counts[eventStatus(event)] += 1
  return counts
}, { all: 0, upcoming: 0, past: 0 })
const CATEGORIES = [...new Set(eventArchive.map((event) => event.category).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b))

// Tracks the year that crosses the upper-middle band of the viewport.
function useCurrentYear(rootRef, sectionKey) {
  const [current, setCurrent] = useState(null)

  useEffect(() => {
    const sections = [...rootRef.current.querySelectorAll('.events-year')]
    if (!sections.length) {
      setCurrent(null)
      return undefined
    }

    const visible = new Map()
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => visible.set(entry.target.dataset.year, entry.isIntersecting))
      const first = sections.find((section) => visible.get(section.dataset.year))
      setCurrent(first ? Number(first.dataset.year) : null)
    }, { rootMargin: '-30% 0px -60% 0px' })

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [rootRef, sectionKey])

  return current
}

export default function EventArchive() {
  const rootRef = useRef(null)
  const [filter, setFilter] = useState('all')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [view, setView] = useState('grid')

  const filteredEvents = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    return eventArchive.filter((event) => {
      const matchesStatus = filter === 'all' || eventStatus(event) === filter
      const matchesCategory = category === 'all' || event.category === category
      const matchesSearch = !search || [event.title, event.category, event.edition, event.description, event.year]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(search))
      return matchesStatus && matchesCategory && matchesSearch
    })
  }, [category, filter, query])

  const years = useMemo(() => groupEventsByYear(filteredEvents), [filteredEvents])
  const sectionKey = years.map(({ year }) => year).join('-')
  const currentYear = useCurrentYear(rootRef, sectionKey)
  const resetFilters = () => {
    setFilter('all')
    setCategory('all')
    setQuery('')
  }
  const hasActiveFilters = filter !== 'all' || category !== 'all' || Boolean(query.trim())

  return (
    <section id="event-archive" ref={rootRef} className={`events-archive is-${view}-view`} aria-labelledby="events-archive-title">
      <div className="page-container">
        <header className="events-archive-head">
          <p className="events-archive-eyebrow" data-animated-text=""><span>Curated archive</span><span>2024 — 2026</span></p>
          <div className="events-archive-intro">
            <h2 id="events-archive-title">Every event leaves a trace.</h2>
            <p>Browse the competitions, workshops and community experiences that continue to shape Infinity Club.</p>
          </div>
        </header>

        <div className="events-toolbar" aria-label="Event archive controls">
          <div className="events-filter" role="group" aria-label="Filter events by status">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={filter === item.value ? 'is-active' : undefined}
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
              >
                <span>{item.label}</span><small>{padCount(EVENT_COUNTS[item.value])}</small>
              </button>
            ))}
          </div>
          <div className="events-toolbar-tools">
            <label className="events-category">
              <SlidersHorizontal size={15} strokeWidth={1.8} aria-hidden="true" />
              <span className="sr-only">Filter by category</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">All categories</option>
                {CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="events-search">
              <span className="sr-only">Search events</span>
              <Search size={16} strokeWidth={1.8} aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search events"
              />
              {query && (
                <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </label>
            <div className="events-view-switch" role="group" aria-label="Change event display">
              <button type="button" className={view === 'grid' ? 'is-active' : undefined} aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={16} aria-hidden="true" /></button>
              <button type="button" className={view === 'list' ? 'is-active' : undefined} aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17} aria-hidden="true" /></button>
            </div>
          </div>
        </div>

        <div className="events-archive-subnav">
          {years.length > 0 && (
            <nav className="events-year-nav" aria-label="Jump to a year">
              <span aria-hidden="true">Jump to</span>
              <ul>
                {years.map(({ year }) => (
                  <li key={year}>
                    <a href={`#events-${year}`} aria-current={currentYear === year ? 'location' : undefined}>{year}</a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <p className="events-result-count" role="status" aria-live="polite">
            <strong>{padCount(filteredEvents.length)}</strong> {filteredEvents.length === 1 ? 'result' : 'results'}
          </p>
          {hasActiveFilters && <button type="button" className="events-clear-filters" onClick={resetFilters}><X size={13} aria-hidden="true" />Clear filters</button>}
        </div>

        {years.map(({ year, events }, index) => (
          <EventYearSection key={year} year={year} events={events} isLatest={index === 0} view={view} />
        ))}

        {!years.length && (
          <div className="events-empty" role="status">
            <span aria-hidden="true">00</span>
            <div>
              <h3>No event found.</h3>
              <p>Try another keyword or reset the archive filters.</p>
            </div>
            <button type="button" onClick={resetFilters}>Reset filters</button>
          </div>
        )}
      </div>
    </section>
  )
}
