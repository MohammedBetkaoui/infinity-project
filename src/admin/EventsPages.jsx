import { useDeferredValue, useMemo, useState } from 'react'
import {
  ArrowLeft, CalendarDays, CheckCircle2, Copy, Download, MapPin,
  Plus, RefreshCw, TriangleAlert, UserRound, UsersRound, X,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAdmin } from './AdminStore'
import { RecordTable, RecordToolbar, SummaryStrip, Facts, History } from './AdminRecords'
import {
  Avatar, Button, ChipGroup, EmptyState, Modal, PageHeader, Pagination, SearchField, StatusBadge, Tabs,
} from './AdminUI'
import {
  ATTENDANCE_FILTERS, ATTENDANCE_STATE_LABELS, EVENT_STATUS_FILTERS, EVENT_TYPE_FILTERS,
  EVENT_TYPE_LABELS, EVENT_TYPES, MAX_EVENT_DAYS, MAX_EVENT_SPEAKERS, buildEventPayload, eventCheckedAt,
  eventFormFieldValues, eventScheduleDays, formatEventDateSpan, formatEventDayCount, formatEventSchedule,
  formatEventSpeakers, formatScheduleDay, validateEventForm,
} from './adminEventsModel'
import {
  useAdminEvent, useAdminEventActions, useAdminEventAttendance,
  useAdminEventInvitationOverview, useAdminEventParticipants, useAdminEventScanner, useAdminEvents,
} from './useAdminEvents'

const initialsFor = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'EV'

const ATTENDANCE_LABELS = Object.freeze({
  present: 'Present', not_checked_in: 'Not checked in', absent: 'Absent',
})

const EventCell = ({ record }) => (
  <div className="adm-event-cell">
    <span className={`adm-event-cell__mark is-${record.statusKey}`}><CalendarDays size={17}/></span>
    <span className="adm-event-cell__copy">
      <b>{record.title}</b>
      <small><MapPin size={12}/>{record.location}</small>
    </span>
  </div>
)

// One-day events show their time window; longer events show the day span
// (the exact start and end stay in the tooltip and on the detail page).
const EventScheduleCell = ({ record }) => {
  const days = eventScheduleDays(record)
  const multiDay = days.length > 1
  return <div className="adm-event-schedule-cell" title={multiDay ? days.map(formatScheduleDay).join('\n') : undefined}>
    <b>{multiDay ? formatEventDateSpan(record.startsAt, record.endsAt) : formatEventSchedule(record.startsAt, record.endsAt)}</b>
    <span>{multiDay ? `${formatEventDayCount(days.length)} · ` : ''}{record.typeLabel}</span>
  </div>
}

const EventLeadCell = ({ record }) => {
  const [first, ...others] = record.speakers?.length ? record.speakers : (record.speaker ? [record.speaker] : [])
  return <div className="adm-event-lead-cell" title={formatEventSpeakers(record.speakers)}>
    <Avatar initials={initialsFor(first)} small/>
    <span>{first || 'Not assigned'}{others.length > 0 && <small className="adm-event-lead-more"> +{others.length}</small>}</span>
  </div>
}

const EventParticipationCell = ({ record }) => {
  const rate = record.attendanceCount ? record.attendanceRate : 0
  return <div className="adm-event-participation">
    <div><b>{record.presentCount}</b><span>present</span><small>{record.registeredCount} registered · {record.invitedCount} invited</small></div>
    <span className="adm-event-participation__track" role="progressbar" aria-label={`Attendance: ${rate}%`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={rate}><i style={{ width: `${rate}%` }}/></span>
  </div>
}

function EventsSkeleton() {
  return <div className="adm-skeleton-group" role="status" aria-label="Loading events">
    {Array.from({ length: 5 }, (_, index) => <div className="adm-skeleton-row" key={index}><i/><span/><span/></div>)}
  </div>
}

const EMPTY_DAY = Object.freeze({ date: '', startTime: '', endTime: '' })
const FORM_INITIAL = Object.freeze({ title: '', days: Object.freeze([EMPTY_DAY]), location: '', speakers: Object.freeze(['']) })

// The day after a YYYY-MM-DD date, or '' when it cannot be worked out.
function nextDate(date) {
  const time = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(time) ? new Date(time + 86_400_000).toISOString().slice(0, 10) : ''
}

// Plain-language reminder of how long the event runs, shown under the days.
function eventDurationNote(days) {
  const filled = days.filter((day) => day.date).length
  if (!filled) return 'Pick the date and the start and end time of the first day. Add another day if the event runs longer.'
  return days.length === 1 ? 'One-day event.' : `${days.length}-day event. Each day has its own start and end time.`
}

// Shared step-2 form for creating and editing a workshop.
function EventScheduleForm({ values, onChange, errors }) {
  const set = (name) => (event) => onChange({ ...values, [name]: event.target.value })
  const setDay = (index, field, value) => onChange({ ...values, days: values.days.map((day, position) => position === index ? { ...day, [field]: value } : day) })
  // A new day continues the previous one: the next date and the same hours.
  const addDay = () => {
    const previous = values.days.at(-1) || EMPTY_DAY
    onChange({ ...values, days: [...values.days, { date: nextDate(previous.date), startTime: previous.startTime, endTime: previous.endTime }] })
  }
  const removeDay = (index) => onChange({ ...values, days: values.days.filter((_, position) => position !== index) })
  const setSpeaker = (index, name) => onChange({ ...values, speakers: values.speakers.map((current, position) => position === index ? name : current) })
  const addSpeaker = () => onChange({ ...values, speakers: [...values.speakers, ''] })
  const removeSpeaker = (index) => onChange({ ...values, speakers: values.speakers.filter((_, position) => position !== index) })
  const multiDay = values.days.length > 1
  const dayErrors = errors.days || {}
  return <div className="adm-event-form">
    <label className="adm-form-field is-wide">
      <span>Title<em>Required</em></span>
      <input name="title" type="text" placeholder="e.g. Introduction to React Hooks" value={values.title} onChange={set('title')}/>
      {errors.title && <small role="alert" className="adm-form-error">{errors.title}</small>}
    </label>
    <div className="adm-form-field adm-event-days is-wide" role="group" aria-label="Event days">
      <span>{multiDay ? 'Days' : 'Day'}<em>Required</em></span>
      {values.days.map((day, index) => <div className="adm-event-day-row" key={index}>
        {multiDay && <b className="adm-event-day-row__label">Day {index + 1}</b>}
        <label className="adm-event-day-cell">
          <small>Date</small>
          <input name={`day-${index}-date`} type="date" aria-label={`Day ${index + 1} date`} value={day.date} onChange={(event) => setDay(index, 'date', event.target.value)}/>
          {dayErrors[index]?.date && <small role="alert" className="adm-form-error">{dayErrors[index].date}</small>}
        </label>
        <label className="adm-event-day-cell">
          <small>Start time</small>
          <input name={`day-${index}-start`} type="time" aria-label={`Day ${index + 1} start time`} value={day.startTime} onChange={(event) => setDay(index, 'startTime', event.target.value)}/>
          {dayErrors[index]?.startTime && <small role="alert" className="adm-form-error">{dayErrors[index].startTime}</small>}
        </label>
        <label className="adm-event-day-cell">
          <small>End time{multiDay ? '' : ' (optional)'}</small>
          <input name={`day-${index}-end`} type="time" aria-label={`Day ${index + 1} end time`} value={day.endTime} onChange={(event) => setDay(index, 'endTime', event.target.value)}/>
          {dayErrors[index]?.endTime && <small role="alert" className="adm-form-error">{dayErrors[index].endTime}</small>}
        </label>
        {multiDay && <button type="button" className="adm-event-speaker-remove" aria-label={`Remove day ${index + 1}`} onClick={() => removeDay(index)}><X size={15}/></button>}
      </div>)}
      {errors.schedule && <small role="alert" className="adm-form-error">{errors.schedule}</small>}
      <p className="adm-event-duration" aria-live="polite"><CalendarDays size={14}/>{eventDurationNote(values.days)}</p>
      <Button type="button" variant="secondary" className="adm-event-speaker-add" disabled={values.days.length >= MAX_EVENT_DAYS} onClick={addDay} icon={<Plus size={15}/>}>Add another day</Button>
    </div>
    <label className="adm-form-field is-wide">
      <span>Location<em>Required</em></span>
      <input name="location" type="text" placeholder="Building or room" value={values.location} onChange={set('location')}/>
      {errors.location && <small role="alert" className="adm-form-error">{errors.location}</small>}
    </label>
    <div className="adm-form-field adm-event-speakers is-wide" role="group" aria-label="Facilitators">
      <span>{values.speakers.length > 1 ? 'Facilitators' : 'Facilitator'}<em>Required</em></span>
      {values.speakers.map((name, index) => <div className="adm-event-speaker-row" key={index}>
        <input name={`speaker-${index}`} type="text" aria-label={`Facilitator ${index + 1}`} placeholder={index === 0 ? 'Who guides the workshop?' : 'Another facilitator'} value={name} onChange={(event) => setSpeaker(index, event.target.value)}/>
        {values.speakers.length > 1 && <button type="button" className="adm-event-speaker-remove" aria-label={`Remove facilitator ${index + 1}`} onClick={() => removeSpeaker(index)}><X size={15}/></button>}
      </div>)}
      {errors.speakers && <small role="alert" className="adm-form-error">{errors.speakers}</small>}
      <Button type="button" variant="secondary" className="adm-event-speaker-add" disabled={values.speakers.length >= MAX_EVENT_SPEAKERS} onClick={addSpeaker} icon={<Plus size={15}/>}>Add a facilitator</Button>
    </div>
  </div>
}

export function CreateEventModal({ open, onClose, onCreated }) {
  const [step, setStep] = useState('type')
  const [values, setValues] = useState(FORM_INITIAL)
  const [errors, setErrors] = useState({})
  const [pending, setPending] = useState(false)
  const [formError, setFormError] = useState('')
  const { create } = useAdminEventActions()
  const submit = async (event) => {
    event.preventDefault()
    const validation = validateEventForm(values)
    if (Object.keys(validation).length) { setErrors(validation); return }
    setErrors({})
    setPending(true)
    setFormError('')
    try {
      const result = await create({ ...buildEventPayload(values), status: 'planned' })
      if (!result.ok) { setFormError(result.message); return }
      onCreated?.(result.event)
    } finally {
      setPending(false)
    }
  }
  return <Modal open={open} onClose={pending ? () => {} : onClose} className="adm-event-create-modal" wide
    eyebrow={step === 'type' ? 'New event' : 'New workshop'} title={step === 'type' ? 'Choose the event type' : 'Workshop details'}
    closeLabel="Close"
    footer={step === 'type'
      ? <><Button variant="secondary" onClick={onClose}>Cancel</Button></>
      : <><Button variant="secondary" disabled={pending} onClick={() => setStep('type')} icon={<ArrowLeft size={15}/>}>Back</Button><Button type="submit" form="adm-event-create-form" disabled={pending}>{pending ? 'Creating…' : 'Create workshop'}</Button></>}>
    {step === 'type' ? <div className="adm-events-type-grid">
      {EVENT_TYPES.map((option) => <button key={option.value} type="button" disabled={option.value !== 'workshop'} aria-label={option.label} onClick={() => setStep('details')}>
        <b>{option.label}</b>
        <small>{option.copy}</small>
        {option.value === 'workshop' && <StatusBadge tone="success">Available</StatusBadge>}
        {option.value !== 'workshop' && <StatusBadge tone="neutral">Coming in a later phase</StatusBadge>}
      </button>)}
    </div> : <>
      <p className="adm-modal-intro">Times are entered in Africa/Algiers (UTC+01:00). An event can run over one day or several: set the day and time it starts, then the day and time it ends. The workshop stays internal and is saved to the protected live database.</p>
      <form id="adm-event-create-form" onSubmit={submit}>
        <EventScheduleForm values={values} onChange={setValues} errors={errors}/>
        {formError && <p role="alert" className="adm-form-error">{formError}</p>}
      </form>
    </>}
  </Modal>
}

function EditEventModal({ event, open, onClose, onSaved }) {
  const [values, setValues] = useState(() => eventFormFieldValues(event))
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState(false)
  const { addToast } = useAdmin()
  const { update } = useAdminEventActions()
  const submit = async (formEvent) => {
    formEvent.preventDefault()
    const validation = validateEventForm(values)
    if (Object.keys(validation).length) { setErrors(validation); return }
    setErrors({})
    setPending(true)
    setFormError('')
    try {
      const result = await update(event.id, { ...buildEventPayload(values, { statusKey: event.statusKey }), expectedUpdatedAt: event.updatedAt })
      if (!result.ok) { setFormError(result.message); return }
      addToast('Workshop updated', 'The workshop details were saved to the live record.')
      onSaved?.(result.event)
      onClose()
    } finally {
      setPending(false)
    }
  }
  return <Modal open={open} onClose={pending ? () => {} : onClose} wide eyebrow={`${event.typeLabel} · ${event.ref}`} title="Edit workshop" closeLabel="Close"
    footer={<><Button variant="secondary" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" form="adm-event-edit-form" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</Button></>}>
    <form id="adm-event-edit-form" onSubmit={submit}>
      <EventScheduleForm values={values} onChange={setValues} errors={errors}/>
      {formError && <p role="alert" className="adm-form-error">{formError}</p>}
    </form>
  </Modal>
}

export default function EventsListPage() {
  const navigate = useNavigate()
  const { state: routeState } = useLocation()
  const [search, setSearch] = useState(() => routeState?.globalSearch || '')
  const deferredSearch = useDeferredValue(search.trim())
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ key: 'starts', asc: false })
  const [creating, setCreating] = useState(false)
  const { addToast } = useAdmin()
  const sortValue = `${sort.key}_${sort.asc ? 'asc' : 'desc'}`
  const { events, summary, pagination, loading, error, refresh } = useAdminEvents({ page, search: deferredSearch, filters, sort: sortValue })
  const filterDefinitions = useMemo(() => [
    { key: 'type', label: 'Event type', options: EVENT_TYPE_FILTERS.map(({ value }) => value).filter(Boolean) },
    { key: 'status', label: 'Event status', options: EVENT_STATUS_FILTERS.map(({ value }) => value).filter(Boolean) },
  ], [])
  const columns = useMemo(() => [
    { key: 'title', label: 'Event', render: (record) => <EventCell record={record}/> },
    { key: 'starts', label: 'Schedule', render: (record) => <EventScheduleCell record={record}/> },
    { key: 'speaker', label: 'Facilitators', render: (record) => <EventLeadCell record={record}/> },
    { key: 'present', label: 'Participation', render: (record) => <EventParticipationCell record={record}/> },
    { key: 'status', label: 'Status', render: (record) => <StatusBadge>{record.status}</StatusBadge> },
  ], [])
  const openEvent = (record) => navigate(`/admin/events/${encodeURIComponent(record.id)}`)

  return <div className="adm-page adm-events-page">
    <PageHeader
      eyebrow="Operations · Events"
      title="Events"
      description="Plan and coordinate Infinity Club workshops, competitions and community events."
      actions={<>
        <Button variant="secondary" onClick={refresh} icon={<RefreshCw size={16}/>}>Refresh</Button>
        <Button onClick={() => setCreating(true)} icon={<Plus size={16}/>}>New event</Button>
      </>}/>
    <SummaryStrip items={summary.map(({ key, label, value }) => ({ value, label, ...(key === 'total' ? { meta: 'Live events core' } : {}) }))}/>
    <div className="adm-work-panel">
      <div className="adm-events-panel-head">
        <div><span>Event workspace</span><h2>Calendar & operations</h2></div>
        <p className={loading ? 'is-loading' : ''}><i/>{loading ? 'Updating events…' : `${pagination.total} event${pagination.total === 1 ? '' : 's'} in view`}</p>
      </div>
      <RecordToolbar
        search={search}
        onSearch={(value) => { setSearch(value); setPage(1) }}
        placeholder="Search title, facilitator or location..."
        filters={filters}
        onFilters={(value) => { setFilters(value); setPage(1) }}
        definitions={filterDefinitions}
        resultCount={pagination.total}
        filterLabel="All filters"
        getOptionLabel={(value) => value === 'upcoming' ? 'Upcoming' : value === 'other' ? 'Other (remaining types)' : EVENT_TYPE_LABELS[value] || value}/>
      <div className="adm-events-filter-rail">
        <div><span>Type</span><ChipGroup label="Filter events by type" options={EVENT_TYPE_FILTERS} value={filters.type || ''} onChange={(value) => { setFilters({ ...filters, type: value }); setPage(1) }}/></div>
        <div><span>Status</span><ChipGroup label="Filter events by status" options={EVENT_STATUS_FILTERS} value={filters.status || ''} onChange={(value) => { setFilters({ ...filters, status: value }); setPage(1) }}/></div>
      </div>
      {error ? <div className="adm-state-error" role="alert"><TriangleAlert size={24}/><h3>Events could not be loaded</h3><p>{error}</p><Button onClick={refresh} variant="secondary">Try again</Button></div>
        : loading && !events.length ? <EventsSkeleton/>
        : <RecordTable
          className={`adm-events-table ${loading ? 'is-refreshing' : ''}`}
          records={events}
          columns={columns}
          emptyTitle="No events yet"
          emptyCopy="Create the first workshop to start planning the calendar."
          onOpen={openEvent}
          pagination={pagination}
          onPageChange={setPage}
          controlledSort={sort}
          onSortChange={(value) => setSort(value)}
          rowClassName={(record) => record.statusKey === 'ongoing' ? 'is-event-ongoing' : ''}
          labels={{ open: 'Open event', record: 'event', empty: 'No events yet' }}/>}
    </div>
    {creating && <CreateEventModal
      open={creating}
      onClose={() => setCreating(false)}
      onCreated={(event) => { setCreating(false); refresh(); addToast('Workshop created', `${event.title} is ready to manage.`); navigate(`/admin/events/${encodeURIComponent(event.id)}`) }}/>} 
  </div>
}

const TABS = Object.freeze(['Overview', 'Participants', 'Attendance', 'Scanner'])

function EventCommandBar({ event }) {
  const attendanceRate = event.attendanceCount ? event.attendanceRate : 0
  return <section className="adm-event-command" aria-label="Event at a glance">
    <div className="adm-event-command__facts">
      <article><span><CalendarDays size={17}/></span><div><small>Schedule</small><b>{formatEventSchedule(event.startsAt, event.endsAt, event.scheduleDays)}</b></div></article>
      <article><span><MapPin size={17}/></span><div><small>Location</small><b>{event.location}</b></div></article>
      <article><span><UserRound size={17}/></span><div><small>{event.speakers.length > 1 ? 'Facilitators' : 'Facilitator'}</small><b>{formatEventSpeakers(event.speakers)}</b></div></article>
    </div>
    <div className="adm-event-command__attendance">
      <div><span><UsersRound size={17}/></span><p><small>Live participation</small><b>{event.presentCount} present <em>of {event.registeredCount} registered</em></b></p><strong>{attendanceRate}%</strong></div>
      <span className="adm-event-command__track" role="progressbar" aria-label={`Attendance: ${attendanceRate}%`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={attendanceRate}><i style={{ width: `${attendanceRate}%` }}/></span>
    </div>
  </section>
}

function OverviewTab({ event, history }) {
  const statistics = event.statistics
  return <>
    <SummaryStrip items={[
      { value: statistics.totalInvited, label: 'Member applicants invited' },
      { value: statistics.totalRegistered, label: 'Registered' },
      { value: statistics.totalPresent, label: 'Present' },
      { value: statistics.totalNotCheckedIn, label: 'Not checked in' },
      { value: statistics.totalAbsent, label: 'Absent' },
    ]}/>
    <div className="adm-event-overview-grid">
      <section className="adm-detail-section adm-event-information"><h4>Workshop information</h4><Facts items={[
        ['Reference', event.ref], ['Schedule', formatEventSchedule(event.startsAt, event.endsAt, event.scheduleDays)],
        ...(eventScheduleDays(event).length > 1 ? [['Days', <ol className="adm-event-days-list" key="days">{eventScheduleDays(event).map((day, index) => <li key={day.date}><b>Day {index + 1}</b>{formatScheduleDay(day)}</li>)}</ol>]] : []),
        ['Location', event.location], [event.speakers.length > 1 ? 'Facilitators' : 'Facilitator', formatEventSpeakers(event.speakers)],
        ['Visibility', event.visibility === 'internal' ? 'Internal' : 'Public'], ['Status', event.status],
        ['Created', eventCheckedAt(event.createdAt)], ['Last update', eventCheckedAt(event.updatedAt)],
      ]}/></section>
      <section className="adm-detail-section adm-event-operations-section"><h4>Operations summary</h4><div className="adm-event-operations">
        <p><span><UsersRound size={16}/></span><b>Participants</b><small>{statistics.totalRegistered} registered · {statistics.totalPresent} present · {statistics.totalNotCheckedIn} not checked in</small></p>
        <p><span><CheckCircle2 size={16}/></span><b>Attendance</b><small>{ATTENDANCE_STATE_LABELS[event.attendanceState] || 'Not started'} · {statistics.attendanceRate}% rate</small></p>
        {event.absentCount > 0 && <StatusBadge tone="warning">Attendance finalized with absences</StatusBadge>}
      </div></section>
    </div>
    <section className="adm-detail-section"><h4>History</h4>{history.length
      ? <History items={history}/>
      : <p className="adm-muted">No administrative history yet.</p>}</section>
  </>
}

const PARTICIPANT_TYPE_FILTERS = Object.freeze([
  { value: '', label: 'All' }, { value: 'member', label: 'Members' }, { value: 'staff', label: 'Staff' },
])
const PARTICIPANT_LINK_FILTERS = Object.freeze([
  { value: '', label: 'All' }, { value: 'missing', label: 'No link yet' },
  { value: 'new', label: 'Not exported' }, { value: 'ready', label: 'Link ready' },
])

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`
const typeBreakdown = ({ members, staff }) => `${plural(members, 'member')} · ${staff} staff`

// Where the private links stand for this event: first batch for everyone
// already on the site, then only the applications that joined afterwards.
function PrivateLinksPanel({ overview, loading, error, pending, onGenerate, onExport, onQueueExisting, onRetryDeliveries, onRetry }) {
  const { eligible, linked, missing, unexported, delivery } = overview
  const busy = Boolean(pending) || loading
  return <section className="adm-event-quick-invite adm-event-links" aria-label="Private registration links">
    <h4>Private registration links</h4>
    {error ? <div className="adm-state-error" role="alert"><TriangleAlert size={20}/><p>{error}</p><Button variant="secondary" onClick={onRetry}>Try again</Button></div> : <>
      <dl className="adm-event-links__stats">
        <div><dt>Applications</dt><dd>{eligible.total}</dd><small>{typeBreakdown(eligible)}</small></div>
        <div><dt>With a private link</dt><dd>{linked.total}</dd><small>{typeBreakdown(linked)}</small></div>
        <div className={missing.total > 0 ? 'is-attention' : ''}><dt>Waiting for a link</dt><dd>{missing.total}</dd><small>{typeBreakdown(missing)}</small></div>
        <div><dt>Not exported yet</dt><dd>{unexported.total}</dd><small>{typeBreakdown(unexported)}</small></div>
      </dl>
      <div className="adm-event-section-heading"><div><h4>Automatic email delivery</h4><p>Durable n8n jobs are dispatched server-side. CSV history remains independent.</p></div></div>
      <dl className="adm-event-links__stats" aria-label="Invitation delivery status">
        <div><dt>Pending</dt><dd>{delivery.pending}</dd></div>
        <div><dt>Processing</dt><dd>{delivery.processing}</dd></div>
        <div><dt>Delivered</dt><dd>{delivery.delivered}</dd></div>
        <div className={delivery.failed > 0 ? 'is-attention' : ''}><dt>Failed</dt><dd>{delivery.failed}</dd></div>
        <div><dt>Retry scheduled</dt><dd>{delivery.retryScheduled}</dd></div>
      </dl>
      <div className="adm-event-invite-actions">
        <Button variant="secondary" disabled={busy || linked.total === 0} onClick={onQueueExisting}>
          {pending === 'queue-existing' ? 'Queueingâ€¦' : 'Queue existing invitations'}
        </Button>
        <Button variant="secondary" disabled={busy || delivery.failed === 0} onClick={onRetryDeliveries}>
          {pending === 'retry-deliveries' ? 'Retryingâ€¦' : `Retry failed deliveries${delivery.failed ? ` Â· ${delivery.failed}` : ''}`}
        </Button>
      </div>
      {linked.total === 0
        ? <>
          <p>No private link has been generated for this event yet. Generate them once for every member and staff application already on the site, then export them as a CSV.</p>
          <div className="adm-event-invite-actions">
            <Button onClick={() => onGenerate('first')} disabled={busy || eligible.total === 0}>
              {pending === 'first' ? 'Generating…' : `Generate private links for all ${plural(eligible.total, 'application')}`}
            </Button>
          </div>
        </>
        : missing.total > 0
          ? <div className="adm-event-links__alert" role="status">
            <TriangleAlert size={18}/>
            <div><b>{plural(missing.total, 'new application')} without a private link</b><small>{typeBreakdown(missing)} joined after the links were generated.</small></div>
            <Button onClick={() => onGenerate('new')} disabled={busy}>{pending === 'new' ? 'Generating…' : 'Generate links for the new applications'}</Button>
          </div>
          : <p className="adm-event-links__ok"><CheckCircle2 size={16}/>Every member and staff application has a private link.</p>}
      {linked.total > 0 && <div className="adm-event-invite-actions">
        <Button variant={unexported.total > 0 ? 'primary' : 'secondary'} icon={<Download size={15}/>} disabled={busy || unexported.total === 0} onClick={() => onExport('new')}>
          {pending === 'export:new' ? 'Exporting…' : `Export new links (CSV)${unexported.total > 0 ? ` · ${unexported.total}` : ''}`}
        </Button>
        <Button variant="secondary" icon={<Download size={15}/>} disabled={busy} onClick={() => onExport('all')}>
          {pending === 'export:all' ? 'Exporting…' : 'Export all links (CSV)'}
        </Button>
      </div>}
      <p className="adm-muted">New registrations and newly eligible events are queued automatically. CSV export remains an optional fallback and keeps its own history. Private links are hashed in storage.</p>
    </>}
  </section>
}

function ParticipantsTab({ event, onChanged }) {
  const { addToast } = useAdmin()
  const { invite, invitationLink, exportInvitations, queueExistingDeliveries, retryInvitationDeliveries } = useAdminEventActions()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [typeFilter, setTypeFilter] = useState('')
  const [linkFilter, setLinkFilter] = useState('')
  const [selected, setSelected] = useState([])
  const [page, setPage] = useState(1)
  const [pending, setPending] = useState('')
  const { participants, pagination, loading, error, refresh } = useAdminEventParticipants({ eventId: event.id, page, limit: 25, search: deferredSearch, type: typeFilter, link: linkFilter })
  const overviewState = useAdminEventInvitationOverview(event.id)
  const refreshAll = () => { refresh(); overviewState.refresh(); onChanged?.() }
  const generated = async (input, label) => {
    if (pending) return
    setPending(label)
    try {
      const result = await invite(event.id, input)
      if (!result.ok) return addToast('Private links not generated', result.message)
      const { added, addedMembers, addedStaff } = result.invited || {}
      addToast(
        added ? 'Private links generated' : 'No new applications',
        added ? `${plural(added, 'private link')} created (${plural(addedMembers, 'member')}, ${addedStaff} staff).` : 'Every application already had a private link.',
      )
      setSelected([])
      refreshAll()
    } finally { setPending('') }
  }
  const toggleParticipant = (id) => setSelected(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id])
  const copyPrivateLink = async (record, regenerate = false) => {
    if (pending) return
    if (regenerate && !window.confirm(`Regenerate ${record.name}'s private registration link? The previous link will stop working immediately.`)) return
    const label = `${regenerate ? 'regenerate' : 'copy'}:${record.id}`
    setPending(label)
    try {
      const result = await invitationLink(event.id, record.invitationId, regenerate ? 'regenerate' : 'reveal', regenerate)
      if (!result.ok) return addToast('Private link unavailable', result.message)
      await navigator.clipboard.writeText(result.privateLink)
      addToast(regenerate ? 'Private link regenerated' : 'Private link copied', regenerate ? 'The previous link is no longer valid.' : 'The personal registration link is ready to paste.')
      refresh()
    } finally { setPending('') }
  }
  const exportCsv = async (scope) => {
    if (pending) return
    setPending(`export:${scope}`)
    try {
      const result = await exportInvitations(event.id, scope)
      if (!result.ok) return addToast('Export unavailable', result.message)
      addToast(
        scope === 'new' ? 'New links exported' : 'Invitation CSV exported',
        `${plural(result.rowCount, 'private registration link')} prepared for n8n.`,
      )
      refreshAll()
    } finally { setPending('') }
  }
  const deliveryAction = async (action) => {
    if (pending) return
    const isRetry = action === 'retry'
    const label = isRetry ? 'retry-deliveries' : 'queue-existing'
    if (!window.confirm(isRetry
      ? 'Retry all currently failed invitation deliveries for this event?'
      : 'Queue eligible existing invitations that have no delivery job yet?')) return
    setPending(label)
    try {
      const result = isRetry
        ? await retryInvitationDeliveries(event.id)
        : await queueExistingDeliveries(event.id)
      if (!result.ok) return addToast('Invitation delivery not updated', result.message)
      const count = isRetry ? Number(result.retried || 0) : Number(result.queued || 0)
      addToast(
        isRetry ? 'Failed deliveries scheduled' : 'Existing invitations queued',
        count ? `${plural(count, 'delivery')} ready for the worker.` : 'No eligible delivery needed to be added.',
      )
      refreshAll()
    } finally { setPending('') }
  }
  const changeFilter = (setter) => (value) => { setter(value); setSelected([]); setPage(1) }
  return <>
    <div className="adm-event-section-heading"><div><h4>Workshop participants</h4><p>Every member and staff application of the club, with its private link, registration and attendance.</p></div></div>
    <PrivateLinksPanel
      overview={overviewState.overview} loading={overviewState.loading} error={overviewState.error} pending={pending}
      onGenerate={(label) => generated({ scope: 'all_applicants' }, label)} onExport={exportCsv}
      onQueueExisting={() => deliveryAction('queue')} onRetryDeliveries={() => deliveryAction('retry')} onRetry={overviewState.refresh}/>
    <div className="adm-toolbar">
      <SearchField value={search} onChange={(value) => { setSearch(value); setPage(1) }} placeholder="Search participants by name, email or speciality..." label="Search participants"/>
      <div className="adm-toolbar__filters">
        <Button onClick={() => generated({ applicationIds: selected }, 'selected')} disabled={Boolean(pending) || !selected.length}>{pending === 'selected' ? 'Generating…' : `Generate for selected (${selected.length})`}</Button>
      </div>
    </div>
    <div className="adm-events-filter-rail">
      <div><span>Type</span><ChipGroup label="Filter participants by type" options={PARTICIPANT_TYPE_FILTERS} value={typeFilter} onChange={changeFilter(setTypeFilter)}/></div>
      <div><span>Private link</span><ChipGroup label="Filter participants by private link" options={PARTICIPANT_LINK_FILTERS} value={linkFilter} onChange={changeFilter(setLinkFilter)}/></div>
    </div>
    {error ? <div className="adm-state-error" role="alert"><TriangleAlert size={22}/><p>{error}</p><Button variant="secondary" onClick={refresh}>Try again</Button></div>
      : loading ? <EventsSkeleton/>
      : participants.length ? <div className="adm-table-wrap">
        <table className="adm-table adm-event-select-table">
          <thead><tr><th className="is-checkbox"><span className="sr-only">Select participant</span></th><th>Name</th><th>Email</th><th>Type</th><th>University speciality</th><th>Private link</th><th>Registration</th><th>Attendance</th><th aria-label="Actions"/></tr></thead>
          <tbody>{participants.map((record) => <tr key={record.id}>
            <td className="is-checkbox"><input
              type="checkbox"
              disabled={record.invitationReady}
              checked={selected.includes(record.id)}
              onChange={() => toggleParticipant(record.id)}
              aria-label={record.invitationReady ? `${record.name} already has a private link` : `Select ${record.name}`}/></td>
            <td><div className="adm-person-cell"><Avatar initials={record.initials} small/><span><b>{record.name}</b></span></div></td>
            <td>{record.email || '—'}</td>
            <td><StatusBadge tone={record.type === 'staff' ? 'info' : 'neutral'}>{record.typeLabel}</StatusBadge></td>
            <td>{record.universitySpeciality || <span className="adm-muted">—</span>}</td>
            <td>{record.invitationReady
              ? <span className="adm-event-link-state"><StatusBadge>{record.invitationStatus}</StatusBadge>{record.linkIsNew && <StatusBadge tone="warning">New</StatusBadge>}</span>
              : <StatusBadge tone="warning">No link yet</StatusBadge>}</td>
            <td>{record.registrationStatus ? <StatusBadge tone={record.registrationStatus === 'Registered' ? 'success' : 'neutral'}>{record.registrationStatus}</StatusBadge> : <span className="adm-muted">—</span>}</td>
            <td>{record.attendance
              ? <StatusBadge tone={record.attendance === 'present' ? 'success' : record.attendance === 'absent' ? 'danger' : 'neutral'}>{ATTENDANCE_LABELS[record.attendance]}</StatusBadge>
              : <span className="adm-muted">—</span>}</td>
            <td className="adm-row-action">{record.invitationReady && <>
              <button disabled={Boolean(pending) || !['invited', 'registered'].includes(record.invitationStatusKey)} onClick={() => copyPrivateLink(record)}>{pending === `copy:${record.id}` ? 'Copying…' : 'Copy link'}</button>
              <button disabled={Boolean(pending) || !record.privateLinkReady} onClick={() => copyPrivateLink(record, true)}>{pending === `regenerate:${record.id}` ? 'Regenerating…' : 'Regenerate link'}</button>
            </>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      : <EmptyState title="No participants match" copy="Adjust the search or the filters; participants come from the member and staff applications of the club."/>}
    <Pagination current={pagination.page} count={pagination.total} pageSize={pagination.limit} onChange={setPage}/>
  </>
}

function ScannerTab({ event, onChanged }) {
  const { addToast } = useAdmin()
  const { scannerAccess } = useAdminEventActions()
  const { scanner, copyable, loading, error, refresh } = useAdminEventScanner(event.id, true)
  const [pending, setPending] = useState('')
  const [privateUrl, setPrivateUrl] = useState('')
  const act = async (action, { confirm = false, message = '' } = {}) => {
    if (pending) return
    if (message && !window.confirm(message)) return
    setPending(action)
    try {
      const result = await scannerAccess(event.id, action, confirm)
      if (!result.ok) return addToast('Workshop scanner not updated', result.message)
      if (result.privateUrl) {
        setPrivateUrl(result.privateUrl)
        try { await navigator.clipboard.writeText(result.privateUrl); addToast('Workshop scanner link ready', 'The shared link was copied to the clipboard.') }
        catch { addToast('Workshop scanner link ready', 'Copy the shared link below and open it on each door phone.') }
      } else if (action === 'revoke') {
        setPrivateUrl('')
        addToast(result.revoked ? 'Workshop scanner link revoked' : 'Already revoked', result.revoked ? 'The shared link and any live scanner session stopped working.' : 'There was no active scanner link to revoke.')
      }
      refresh()
      onChanged?.()
    } finally { setPending('') }
  }
  const copyRevealed = async () => {
    try { await navigator.clipboard.writeText(privateUrl); addToast('Workshop scanner link copied', 'The link is ready to share.') }
    catch { addToast('Copy unavailable', 'Select and copy the generated link manually.') }
  }
  return <>
    <div className="adm-event-section-heading"><div><h4>Workshop scanner</h4><p>One shared check-in link for the whole workshop. Open it on as many door phones as you need; it grants no administrator access.</p></div></div>
    {error ? <div className="adm-state-error" role="alert"><TriangleAlert size={22}/><p>{error}</p><Button variant="secondary" onClick={refresh}>Try again</Button></div>
      : loading ? <EventsSkeleton/>
      : <div className="adm-table-wrap">
        <div className="adm-event-scanner-state">
          <StatusBadge tone={copyable ? 'success' : 'neutral'}>
            {copyable ? 'Active shared link' : scanner?.id ? scanner.status === 'revoked' || scanner.revokedAt ? 'Revoked' : 'Expired' : 'Not generated'}
          </StatusBadge>
          {scanner?.expiresAt && <small>{copyable ? `Valid until ${eventCheckedAt(scanner.expiresAt)}` : `Ended ${eventCheckedAt(scanner.expiresAt)}`}</small>}
          {scanner?.lastUsedAt && <small>Last used {eventCheckedAt(scanner.lastUsedAt)}</small>}
        </div>
        {privateUrl && <div className="adm-private-link"><input readOnly value={privateUrl} aria-label="Shared workshop scanner link"/><button onClick={copyRevealed}><Copy size={14}/> Copy shared link</button></div>}
        <p className="adm-muted">Every phone that opens the link keeps working at the same time. Regenerating or revoking the link stops it on all of them at once, so do it if the link reaches someone it shouldn't.</p>
        <div className="adm-event-invite-actions">
          <Button onClick={() => act('generate')} disabled={Boolean(pending)}>
            {pending === 'generate' ? 'Generating…' : copyable ? 'Reveal shared link' : 'Generate shared scanner link'}
          </Button>
          <Button variant="secondary" onClick={() => act('copy')} disabled={Boolean(pending) || !copyable}>{pending === 'copy' ? 'Copying…' : 'Copy shared link'}</Button>
          <Button variant="secondary" disabled={Boolean(pending) || !scanner?.id} onClick={() => act('regenerate', { confirm: true, message: 'Regenerate the shared workshop scanner link? The previous link and all live scanner sessions stop working immediately.' })}>
            {pending === 'regenerate' ? 'Regenerating…' : 'Regenerate link'}
          </Button>
          <Button variant="secondary" disabled={Boolean(pending) || !copyable} onClick={() => act('revoke', { confirm: true, message: 'Revoke the shared workshop scanner link? Check-in stops until a new link is generated.' })}>
            {pending === 'revoke' ? 'Revoking…' : 'Revoke link'}
          </Button>
        </div>
      </div>}
  </>
}

function AttendanceTab({ event }) {
  const { addToast } = useAdmin()
  const { finalizeAttendance } = useAdminEventActions()
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [finalizing, setFinalizing] = useState(false)
  const { records, summary, pagination, loading, error, refresh } = useAdminEventAttendance({ eventId: event.id, page, limit: 50, status })
  const columns = useMemo(() => [
    { key: 'name', label: 'Participant', render: (row) => <div className="adm-person-cell"><Avatar initials={row.initials} small/><span><b>{row.name}</b><small>{row.email || ''}</small></span></div> },
    { key: 'universitySpeciality', label: 'University speciality' },
    { key: 'attendance', label: 'Attendance', render: (row) => <StatusBadge tone={row.absentAt ? 'danger' : row.checkedInAt ? 'success' : 'neutral'}>{row.absentAt ? 'Absent' : row.checkedInAt ? 'Present' : 'Not checked in'}</StatusBadge> },
    { key: 'checkedInAt', label: 'Check-in', render: (row) => eventCheckedAt(row.checkedInAt) },
    { key: 'checkedInBy', label: 'Scanner', render: (row) => row.checkedInBy || '—' },
  ], [])
  return <>
    {summary && <SummaryStrip items={[
      { value: summary.registered, label: 'Registered' },
      { value: summary.present, label: 'Present' },
      { value: summary.notCheckedIn, label: 'Not checked in' },
      { value: summary.absent, label: 'Absent' },
      { value: `${summary.attendanceRate}%`, label: 'Attendance rate', meta: `${summary.present} present` },
    ]}/>}
    <div className="adm-chip-row"><ChipGroup label="Filter attendance" options={ATTENDANCE_FILTERS} value={status} onChange={(value) => { setStatus(value); setPage(1) }}/></div>
    <div className="adm-toolbar">
      <p className="adm-toolbar-note">Registrations stay pending until scanned. Participants are never marked absent automatically.</p>
      <div className="adm-toolbar__filters">
        <Button variant="secondary" onClick={refresh} icon={<RefreshCw size={15}/>}>Refresh</Button>
        {event.statusKey === 'completed' && <Button variant="secondary" disabled={finalizing} onClick={async () => {
          if (!window.confirm('Finalize every remaining registration as absent? This action is explicit and auditable.')) return
          setFinalizing(true)
          const result = await finalizeAttendance(event.id)
          setFinalizing(false)
          if (!result.ok) return addToast('Attendance not finalized', result.message)
          addToast('Attendance finalized', `${result.finalized} participant${result.finalized === 1 ? '' : 's'} marked absent.`)
          refresh()
        }}>{finalizing ? 'Finalizing…' : 'Finalize remaining as absent'}</Button>}
      </div>
    </div>
    {error ? <div className="adm-state-error" role="alert"><TriangleAlert size={22}/><p>{error}</p><Button variant="secondary" onClick={refresh}>Try again</Button></div>
      : loading ? <EventsSkeleton/>
      : records.length ? <RecordTable
        className="adm-events-attendance-table"
        records={records}
        columns={columns}
        pagination={pagination}
        onPageChange={setPage}
        emptyTitle="No attendance rows"
        labels={{ empty: 'No attendance rows', record: 'participant' }}/>
      : <EmptyState title="No attendance recorded yet" copy="Participants appear here once they register through their private invitation link."/>}
  </>
}

export function EventDetailPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { addToast } = useAdmin()
  const { transition } = useAdminEventActions()
  const { event, loading, error, refresh } = useAdminEvent(eventId)
  const [tab, setTab] = useState('Overview')
  const [editing, setEditing] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  if (loading && !event) return <div className="adm-page adm-events-page"><EventsSkeleton/></div>
  if (error || !event) {
    return <div className="adm-page adm-events-page">
      <div className="adm-state-error" role="alert">
        <TriangleAlert size={24}/>
        <h3>Event unavailable</h3>
        <p>{error || 'This event no longer exists.'}</p>
        <div className="adm-error-actions"><Button variant="secondary" onClick={() => navigate('/admin/events')} icon={<ArrowLeft size={15}/>}>All events</Button><Button onClick={refresh}>Try again</Button></div>
      </div>
    </div>
  }
  // Registration is open at every stage, so the workshop goes straight from planned to ongoing.
  const nextStatus = ({ draft: 'planned', planned: 'ongoing', registration_open: 'ongoing', registration_closed: 'ongoing', ongoing: 'completed', completed: 'archived', cancelled: 'archived' })[event.statusKey]
  const nextLabel = ({ planned: 'Plan workshop', ongoing: 'Start workshop', completed: 'Complete workshop', archived: 'Archive workshop' })[nextStatus]
  const move = async (statusKey) => {
    if (transitioning) return
    if (['completed', 'cancelled'].includes(statusKey) && !window.confirm(`Move this workshop to ${statusKey}?`)) return
    setTransitioning(true)
    const result = await transition(event.id, statusKey, event.updatedAt)
    setTransitioning(false)
    if (!result.ok) return addToast('Workshop status not changed', result.message)
    addToast('Workshop status changed', `The workshop is now ${result.event.status}.`)
    refresh()
  }
  return <div className="adm-page adm-events-page">
    <Link to="/admin/events" className="adm-back-link"><ArrowLeft size={15}/> All events</Link>
    <PageHeader
      eyebrow={`${event.typeLabel} · ${event.ref}`}
      title={event.title}
      description={event.description || 'Coordinate invitations, participants and attendance from one operational workspace.'}
      meta={<StatusBadge>{event.status}</StatusBadge>}
      actions={<>
        <Button variant="secondary" onClick={refresh} icon={<RefreshCw size={16}/>}>Refresh</Button>
        {nextStatus && <Button variant="secondary" disabled={transitioning} onClick={() => move(nextStatus)}>{transitioning ? 'Updating…' : nextLabel}</Button>}
        {!['completed', 'cancelled', 'archived'].includes(event.statusKey) && <Button variant="secondary" disabled={transitioning} onClick={() => move('cancelled')}>Cancel workshop</Button>}
        <Button onClick={() => setEditing(true)}>Edit workshop</Button>
      </>}/>
    <EventCommandBar event={event}/>
    <Tabs items={TABS} value={tab} onChange={setTab} label="Event sections" counts={{ Participants: event.invitedCount, Attendance: event.attendanceCount }}/>
    <div className="adm-event-detail-body">
      {tab === 'Overview' && <OverviewTab event={event} history={event.history}/>}
      {tab === 'Participants' && <ParticipantsTab event={event} onChanged={refresh}/>}
      {tab === 'Attendance' && <AttendanceTab event={event}/>}
      {tab === 'Scanner' && <ScannerTab event={event} onChanged={refresh}/>}
    </div>
    {editing && <EditEventModal event={event} open onClose={() => setEditing(false)} onSaved={refresh}/>} 
  </div>
}
