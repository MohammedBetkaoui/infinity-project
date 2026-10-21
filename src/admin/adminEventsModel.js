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

export const INVITATION_STATUS_KEYS = Object.freeze({ Invited: 'invited', Registered: 'registered', Declined: 'declined', Cancelled: 'cancelled' })
export const ATTENDANCE_STATUS_KEYS = Object.freeze({ Expected: 'expected', Present: 'present', Absent: 'absent', Excused: 'excused' })
export const ATTENDANCE_FILTERS = Object.freeze([
  { value: '', label: 'All' },
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'expected', label: 'Expected' },
])
export const ATTENDANCE_STATE_LABELS = Object.freeze({
  not_started: 'Not started', in_progress: 'In progress', completed: 'Completed',
})
export const DEPARTMENT_KEYS = Object.freeze({
  'Dev / Tech': 'dev-tech', 'Design / Content Creation': 'design-content', 'Management / Logistics': 'management-logistics',
})
export const DEPARTMENT_FILTERS = Object.freeze([
  { value: '', label: 'All departments' },
  { value: 'dev-tech', label: 'Dev / Tech' },
  { value: 'design-content', label: 'Design / Content Creation' },
  { value: 'management-logistics', label: 'Management / Logistics' },
])

const ALGIERS = 'Africa/Algiers'
// Algiers keeps UTC+01 all year, so a local wall-clock pick maps to UTC with a
// fixed offset. Storage and every API value stay absolute ISO UTC.
const ALGIERS_OFFSET = '+01:00'
export const eventDate = (value) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: ALGIERS }).format(new Date(value))
export const eventTime = (value) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: ALGIERS }).format(new Date(value))
export const formatEventWindow = (startsAt, endsAt) => (endsAt ? `${eventTime(startsAt)}–${eventTime(endsAt)}` : eventTime(startsAt))
export const formatEventSchedule = (startsAt, endsAt) => `${eventDate(startsAt)} · ${formatEventWindow(startsAt, endsAt)}`
export const eventCheckedAt = (value) => value ? `${eventDate(value)} · ${eventTime(value)}` : '—'

const halves = (iso) => [...new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: ALGIERS }).formatToParts(new Date(iso))]
  .filter((part) => part.type !== 'literal').map((part) => part.value)
export const eventDateInput = (iso) => halves(iso).join('-')

const algiersIso = (date, time) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return ''
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute))
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59) return ''
  const parsed = new Date(`${date}T${time}:00${ALGIERS_OFFSET}`)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : ''
}

export function validateEventForm(values) {
  const errors = {}
  const title = String(values.title || '').trim()
  if (title.length < 3 || title.length > 160) errors.title = 'Give the event a title of 3 to 160 characters.'
  const location = String(values.location || '').trim()
  if (location.length < 2 || location.length > 160) errors.location = 'Add where the event takes place.'
  const speaker = String(values.speaker || '').trim()
  if (speaker.length < 2 || speaker.length > 120) errors.speaker = 'Name the facilitator or lead.'
  const date = String(values.date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !algiersIso(date, '00:00')) errors.date = 'Choose the event date.'
  const startsAt = algiersIso(date, String(values.start || '').trim())
  if (!startsAt) errors.start = 'Choose a start time.'
  if (String(values.end || '').trim()) {
    const endsAt = algiersIso(date, String(values.end || '').trim())
    if (!endsAt) errors.end = 'Choose a valid end time.'
    else if (startsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) errors.end = 'The end time must be after the start time.'
  }
  const description = String(values.description || '').trim()
  if (description.length > 2000) errors.description = 'Keep the description under 2000 characters.'
  return errors
}

export function buildEventPayload(values, { statusKey } = {}) {
  return {
    eventType: 'workshop',
    title: String(values.title || '').trim(),
    description: String(values.description || '').trim() || undefined,
    startsAt: algiersIso(String(values.date || '').trim(), String(values.start || '').trim()),
    endsAt: String(values.end || '').trim() ? algiersIso(String(values.date || '').trim(), String(values.end || '').trim()) : undefined,
    location: String(values.location || '').trim(),
    speakerName: String(values.speaker || '').trim(),
    ...(statusKey ? { status: statusKey } : {}),
  }
}

const eventTimeInput = (iso) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ALGIERS }).format(new Date(iso))

export const eventFormFieldValues = (event) => ({
  title: event.title,
  description: event.description,
  date: eventDateInput(event.startsAt),
  start: eventTimeInput(event.startsAt),
  end: event.endsAt ? eventTimeInput(event.endsAt) : '',
  location: event.location,
  speaker: event.speaker,
})
