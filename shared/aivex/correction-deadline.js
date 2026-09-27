export const AIVEX_TIME_ZONE = 'Africa/Algiers'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function aivexDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: AIVEX_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

// A date-only correction deadline is inclusive in the event's local time:
// submissions made anywhere on the due date remain valid. Candidate clients
// receive the server's decision and never authorise themselves from their own
// clock.
export function isCorrectionDeadlineExpired(dueAt, now = new Date()) {
  return DATE_RE.test(String(dueAt || '')) && String(dueAt) < aivexDateKey(now)
}

