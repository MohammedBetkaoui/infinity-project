// Newest year first; inside a year, featured events lead and the data order is
// otherwise kept (Array#sort is stable).
export function groupEventsByYear(events) {
  const byYear = events.reduce((groups, event) => {
    if (!groups[event.year]) groups[event.year] = []
    groups[event.year].push(event)
    return groups
  }, {})
  return Object.keys(byYear)
    .map(Number)
    .sort((a, b) => b - a)
    .map((year) => ({
      year,
      events: [...byYear[year]].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))),
    }))
}

// A year reads in one predictable rhythm: featured events take a full row
// (visual beside the text), every other event sits in a two-column grid with
// identical proportions. A year with a single event presents it as featured.
export function layoutYear(events) {
  const lone = events.length === 1
  return events.map((event) => ({ event, variant: lone || event.featured ? 'featured' : 'standard' }))
}

export const padCount = (value) => String(value).padStart(2, '0')
