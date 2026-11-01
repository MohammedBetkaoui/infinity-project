// Pure events model shared by the Events pages: labels, filters, schedule
// formatting and form building. No React, no network, no storage.
// Formatting follows the Africa/Algiers schedule the club runs on (UTC+01,
// no daylight changes), while storage stays in absolute timestamptz UTC.

export const EVENT_TYPES = Object.freeze([
  { value: 'workshop', label: 'Workshop', copy: 'Guided training session for members.' },
  { value: 'competition', label: 'Competition', copy: 'Coming in a later phase.' },
  { value: 'conference', label: 'Conference', copy: 'Coming in a later phase.' },
  { value: 'open_day', label: 'Open Day', copy: 'Coming in a later phase.' },
  { value: 'hackathon', label: 'Hackathon', copy: 'Coming in a later phase.' },
  { value: 'meeting', label: 'Meeting', copy: 'Coming in a later phase.' },
  { value: 'training', label: 'Training', copy: 'Coming in a later phase.' },
  { value: 'other', label: 'Other', copy: 'Coming in a later phase.' },
])
export const CREATION_EVENT_TYPES = Object.freeze(['workshop'])
export const EVENT_TYPE_LABELS = Object.freeze(Object.fromEntries(EVENT_TYPES.map(({ value, label }) => [value, label])))

export const EVENT_STATUS_LABELS = Object.freeze({
  draft: 'Draft', planned: 'Planned', registration_open: 'Registration open',
  registration_closed: 'Registration closed', ongoing: 'Ongoing',
  completed: 'Completed', cancelled: 'Cancelled', archived: 'Archived',
})
export const CREATE_EVENT_STATUSES = Object.freeze(['Draft', 'Planned'])
const STATUS_KEYS = Object.freeze({
  Draft: 'draft', Planned: 'planned', 'Registration open': 'registration_open',
  'Registration closed': 'registration_closed', Ongoing: 'ongoing', Completed: 'completed',
  Cancelled: 'cancelled', Archived: 'archived',
})

export const EVENT_TYPE_FILTERS = Object.freeze([
  { value: '', label: 'All' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'competition', label: 'Competition' },
  { value: 'conference', label: 'Conference' },
  { value: 'other', label: 'Other' },
])
export const EVENT_STATUS_FILTERS = Object.freeze([
  { value: '', label: 'All' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
])
export const EVENT_STATUS_KEYS = STATUS_KEYS

// Attendance is read straight from registrations: participation states the
// server keeps (present / not checked in / absent after finalize / cancelled).
export const ATTENDANCE_FILTERS = Object.freeze([
  { value: '', label: 'All' },
  { value: 'present', label: 'Present' },
  { value: 'not_checked_in', label: 'Not checked in' },
  { value: 'absent', label: 'Absent' },
  { value: 'cancelled', label: 'Cancelled' },
])
export const ATTENDANCE_STATE_LABELS = Object.freeze({
  not_started: 'Not started', in_progress: 'In progress', completed: 'Completed',
})

const ALGIERS = 'Africa/Algiers'
// Algiers keeps UTC+01 all year, so a local wall-clock pick maps to UTC with a
// fixed offset. Storage and every API value stay absolute ISO UTC.
const ALGIERS_OFFSET = '+01:00'
export const eventDate = (value) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: ALGIERS }).format(new Date(value))
export const eventTime = (value) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: ALGIERS }).format(new Date(value))
export const formatEventWindow = (startsAt, endsAt) => (endsAt ? `${eventTime(startsAt)}–${eventTime(endsAt)}` : eventTime(startsAt))
export const eventCheckedAt = (value) => value ? `${eventDate(value)} · ${eventTime(value)}` : '—'

const halves = (iso) => [...new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: ALGIERS }).formatToParts(new Date(iso))]
  .filter((part) => part.type !== 'literal').map((part) => part.value)
export const eventDateInput = (iso) => halves(iso).join('-')

// An event runs from one absolute start to one absolute end and may cross
// several Algiers calendar days. Day counts follow the local calendar, never
// the 24h distance between the two instants.
const dayNumber = (dateInput) => Date.parse(`${dateInput}T00:00:00Z`) / 86_400_000
export const eventDayCount = (startsAt, endsAt) => {
  if (!startsAt || !endsAt) return 1
  return Math.max(1, Math.round(dayNumber(eventDateInput(endsAt)) - dayNumber(eventDateInput(startsAt))) + 1)
}
export const isMultiDayEvent = (startsAt, endsAt) => eventDayCount(startsAt, endsAt) > 1
export const formatEventDayCount = (days) => `${days} day${days === 1 ? '' : 's'}`
const eventDayMonth = (value) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: ALGIERS }).format(new Date(value))
// "28 Oct 2026" for one day, "28 Oct → 30 Oct 2026" across several.
export const formatEventDateSpan = (startsAt, endsAt) => {
  if (!isMultiDayEvent(startsAt, endsAt)) return eventDate(startsAt)
  const sameYear = eventDateInput(startsAt).slice(0, 4) === eventDateInput(endsAt).slice(0, 4)
  return `${sameYear ? eventDayMonth(startsAt) : eventDate(startsAt)} → ${eventDate(endsAt)}`
}
// scheduleDays (when the event has its own list of days) decides the day count:
// two days on Monday and Wednesday are "2 days", not the 3 the calendar spans.
export const formatEventSchedule = (startsAt, endsAt, scheduleDays = []) => {
  if (scheduleDays.length > 1) return `${formatEventDateSpan(startsAt, endsAt)} · ${formatEventDayCount(scheduleDays.length)}`
  return isMultiDayEvent(startsAt, endsAt)
    ? `${eventDate(startsAt)} · ${eventTime(startsAt)} → ${eventDate(endsAt)} · ${eventTime(endsAt)}`
    : `${eventDate(startsAt)} · ${formatEventWindow(startsAt, endsAt)}`
}

export const MAX_EVENT_SPEAKERS = 8
export const cleanEventSpeakers = (speakers) => (Array.isArray(speakers) ? speakers : [])
  .map((name) => String(name || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
// Facilitators are shown as one line wherever a single string is needed.
export const formatEventSpeakers = (speakers) => cleanEventSpeakers(speakers).join(', ')

const algiersIso = (date, time) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return ''
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute))
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59) return ''
  const parsed = new Date(`${date}T${time}:00${ALGIERS_OFFSET}`)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : ''
}

export const MAX_EVENT_DAYS = 14
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const cleanDay = (day) => ({
  date: String(day?.date || '').trim(),
  startTime: String(day?.startTime || '').trim(),
  endTime: String(day?.endTime || '').trim(),
})
// "28 Oct 2026 · 09:00–12:00" for one entry of an event's day list.
export const formatScheduleDay = (day) => {
  const { date, startTime, endTime } = cleanDay(day)
  const noon = algiersIso(date, '12:00')
  const hours = startTime ? (endTime ? `${startTime}–${endTime}` : startTime) : ''
  return [noon ? eventDate(noon) : date, hours].filter(Boolean).join(' · ')
}

// Each day carries its own date and hours. One day may omit its end time;
// with several days every day needs one, and the dates must strictly increase.
// Returns {} when valid, else { schedule } (list level) and/or { days: { [index]: {...} } }.
export function validateEventDays(days) {
  const rows = (Array.isArray(days) ? days : []).map(cleanDay)
  if (!rows.length) return { schedule: 'Add at least one day.' }
  if (rows.length > MAX_EVENT_DAYS) return { schedule: `Keep an event to ${MAX_EVENT_DAYS} days at most.` }
  const dayErrors = {}
  let previous = ''
  rows.forEach((day, index) => {
    const errors = {}
    const dateValid = DATE_RE.test(day.date) && Boolean(algiersIso(day.date, '00:00'))
    if (!dateValid) errors.date = 'Choose the date.'
    else if (previous && day.date === previous) errors.date = 'This date is already in the list.'
    else if (previous && day.date < previous) errors.date = 'Days must follow each other in order.'
    if (dateValid && !errors.date) previous = day.date
    if (!TIME_RE.test(day.startTime)) errors.startTime = 'Choose a start time.'
    if (day.endTime) {
      if (!TIME_RE.test(day.endTime)) errors.endTime = 'Choose a valid end time.'
      else if (TIME_RE.test(day.startTime) && day.endTime <= day.startTime) errors.endTime = 'The day must end after it starts.'
    } else if (rows.length > 1) {
      errors.endTime = 'Add the time this day ends.'
    }
    if (Object.keys(errors).length) dayErrors[index] = errors
  })
  return Object.keys(dayErrors).length ? { days: dayErrors } : {}
}

export function validateEventForm(values) {
  const errors = {}
  const title = String(values.title || '').trim()
  if (title.length < 3 || title.length > 160) errors.title = 'Give the event a title of 3 to 160 characters.'
  const location = String(values.location || '').trim()
  if (location.length < 2 || location.length > 160) errors.location = 'Add where the event takes place.'
  const speakers = cleanEventSpeakers(values.speakers)
  if (!speakers.length) errors.speakers = 'Name at least one facilitator.'
  else if (speakers.length > MAX_EVENT_SPEAKERS) errors.speakers = `List at most ${MAX_EVENT_SPEAKERS} facilitators.`
  else if (speakers.some((name) => name.length < 2 || name.length > 120)) errors.speakers = 'Each facilitator name needs 2 to 120 characters.'
  else if (new Set(speakers.map((name) => name.toLowerCase())).size !== speakers.length) errors.speakers = 'List each facilitator only once.'
  return { ...errors, ...validateEventDays(values.days) }
}

// startsAt / endsAt are the absolute bounds of the day list (first start, last
// end); the server derives them again from scheduleDays and stores both.
export function buildEventPayload(values, { statusKey } = {}) {
  const days = (Array.isArray(values.days) ? values.days : []).map(cleanDay)
  const first = days[0]
  const last = days.at(-1)
  return {
    eventType: 'workshop',
    title: String(values.title || '').trim(),
    startsAt: first ? algiersIso(first.date, first.startTime) : '',
    endsAt: last?.endTime ? algiersIso(last.date, last.endTime) : undefined,
    scheduleDays: days.map((day) => ({ date: day.date, startTime: day.startTime, endTime: day.endTime || null })),
    location: String(values.location || '').trim(),
    speakerNames: cleanEventSpeakers(values.speakers),
    ...(statusKey ? { status: statusKey } : {}),
  }
}

const eventTimeInput = (iso) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ALGIERS }).format(new Date(iso))

// The day list of an event. Events saved before per-day hours existed have no
// stored list, so one is rebuilt from their start and end: the first day keeps
// the start time, the last day the end time, days in between are left to fill.
export function eventScheduleDays(event) {
  const stored = Array.isArray(event?.scheduleDays) ? event.scheduleDays : []
  if (stored.length) return stored.map(cleanDay)
  if (!event?.startsAt) return []
  const firstDay = dayNumber(eventDateInput(event.startsAt))
  const lastDay = Math.max(firstDay, dayNumber(eventDateInput(event.endsAt || event.startsAt)))
  const days = []
  for (let day = firstDay; day <= lastDay && days.length < MAX_EVENT_DAYS; day += 1) {
    days.push({
      date: new Date(day * 86_400_000).toISOString().slice(0, 10),
      startTime: day === firstDay ? eventTimeInput(event.startsAt) : '',
      endTime: day === lastDay && event.endsAt ? eventTimeInput(event.endsAt) : '',
    })
  }
  return days
}

export const eventFormFieldValues = (event) => ({
  title: event.title,
  days: eventScheduleDays(event),
  location: event.location,
  speakers: event.speakers?.length ? [...event.speakers] : [event.speaker || ''],
})
