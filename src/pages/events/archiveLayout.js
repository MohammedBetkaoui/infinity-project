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

// Places a year's events on a 12-column grid.
//   lg / md: column span on desktop / tablet (mobile is always one column)
//   lgWide / mdWide: horizontal presentation (visual beside the text)
// Featured events and a lone event get the horizontal presentation, so no
// visual ever stretches across the whole page. Regular events fill rows of
// three; a row that would hold one card is rebalanced into pairs.
export function layoutYear(events) {
  const featured = events.filter((event) => event.featured)
  const regular = events.filter((event) => !event.featured)
  const wide = (event) => ({ event, lg: 12, md: 12, lgWide: true, mdWide: true })

  if (regular.length === 1) return [...featured, regular[0]].map(wide)

  const count = regular.length
  const remainder = count % 3
  const lgSpan = (index) => {
    if (count === 2 || count === 4) return 6
    if (remainder === 1 && index >= count - 4) return 6
    if (remainder === 2 && index >= count - 2) return 6
    return 4
  }
  const loneOnTablet = (index) => count % 2 === 1 && index === count - 1

  return [
    ...featured.map(wide),
    ...regular.map((event, index) => ({
      event,
      lg: lgSpan(index),
      md: loneOnTablet(index) ? 12 : 6,
      lgWide: false,
      mdWide: loneOnTablet(index),
    })),
  ]
}

export const padCount = (value) => String(value).padStart(2, '0')
