import { useDeferredValue, useMemo, useState } from 'react'
import {
  ArrowLeft, CalendarDays, CheckCircle2, Copy, Download, MapPin,
  Plus, RefreshCw, TriangleAlert, UserRound, UsersRound,
} from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAdmin } from './AdminStore'
import { RecordTable, RecordToolbar, SummaryStrip, Facts, History } from './AdminRecords'
import {
  Avatar, Button, ChipGroup, EmptyState, Modal, PageHeader, Pagination, SearchField, StatusBadge, Tabs,
} from './AdminUI'
import {
  ATTENDANCE_FILTERS, ATTENDANCE_STATE_LABELS, EVENT_STATUS_FILTERS, EVENT_TYPE_FILTERS,
  EVENT_TYPE_LABELS, EVENT_TYPES, buildEventPayload, eventCheckedAt, eventFormFieldValues,
  formatEventSchedule, validateEventForm,
} from './adminEventsModel'
import {
  useAdminEvent, useAdminEventActions, useAdminEventAttendance,
  useAdminEventParticipants, useAdminEventScanner, useAdminEvents,
} from './useAdminEvents'

const SCHEDULE_FIELDS = [
  { name: 'title', label: 'Title', placeholder: 'e.g. Introduction to React Hooks', required: true },
  { name: 'date', label: 'Date', type: 'date', required: true },
  { name: 'start', label: 'Start time', type: 'time', required: true },
  { name: 'end', label: 'End time', type: 'time' },
  { name: 'speaker', label: 'Facilitator / Lead', placeholder: 'Who guides the workshop?', required: true },
  { name: 'location', label: 'Location', placeholder: 'Building or room', required: true },
  { name: 'description', label: 'Description', type: 'textarea', placeholder: 'What members will learn and do...' },
]

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

const EventScheduleCell = ({ record }) => (
  <div className="adm-event-schedule-cell">
    <b>{formatEventSchedule(record.startsAt, record.endsAt)}</b>
    <span>{record.typeLabel}</span>
  </div>
)

const EventLeadCell = ({ record }) => (
  <div className="adm-event-lead-cell">
    <Avatar initials={initialsFor(record.speaker)} small/>
    <span>{record.speaker || 'Not assigned'}</span>
  </div>
)

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

const FORM_INITIAL = Object.freeze({ title: '', date: '', start: '', end: '', speaker: '', location: '', description: '' })

// Shared step-2 form for creating and editing a workshop.
function EventScheduleForm({ values, onChange, errors }) {
  return <div className="adm-event-form">
    {SCHEDULE_FIELDS.map((field) => <label className="adm-form-field" key={field.name}>
      <span>{field.label}{field.required && <em>Required</em>}</span>
      {field.type === 'textarea'
        ? <textarea name={field.name} rows={3} maxLength={2000} placeholder={field.placeholder} value={values[field.name]} onChange={(event) => onChange({ ...values, [field.name]: event.target.value })}/>
        : <input name={field.name} type={field.type || 'text'} placeholder={field.placeholder} value={values[field.name]} onChange={(event) => onChange({ ...values, [field.name]: event.target.value })}/>}
      {errors[field.name] && <small role="alert" className="adm-form-error">{errors[field.name]}</small>}
    </label>)}
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
      <p className="adm-modal-intro">Times are entered in Africa/Algiers (UTC+01:00). The workshop stays internal and is saved to the protected live database.</p>
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
    { key: 'speaker', label: 'Facilitator / Lead', render: (record) => <EventLeadCell record={record}/> },
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
      <article><span><CalendarDays size={17}/></span><div><small>Schedule</small><b>{formatEventSchedule(event.startsAt, event.endsAt)}</b></div></article>
      <article><span><MapPin size={17}/></span><div><small>Location</small><b>{event.location}</b></div></article>
      <article><span><UserRound size={17}/></span><div><small>Facilitator / Lead</small><b>{event.speaker}</b></div></article>
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
        ['Reference', event.ref], ['Schedule', formatEventSchedule(event.startsAt, event.endsAt)],
        ['Location', event.location], ['Facilitator / Lead', event.speaker],
        ['Visibility', event.visibility === 'internal' ? 'Internal' : 'Public'], ['Status', event.status],
        ['Description', event.description], ['Created', eventCheckedAt(event.createdAt)], ['Last update', eventCheckedAt(event.updatedAt)],
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

function ParticipantsTab({ event, onChanged }) {
  const { addToast } = useAdmin()
  const { invite, invitationLink, exportInvitations } = useAdminEventActions()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [selected, setSelected] = useState([])
  const [page, setPage] = useState(1)
  const [pending, setPending] = useState('')
  const { participants, pagination, loading, error, refresh } = useAdminEventParticipants({ eventId: event.id, page, limit: 25, search: deferredSearch })
  const invited = async (input, label) => {
    if (pending) return
    setPending(label)
    try {
      const result = await invite(event.id, input)
      if (!result.ok) return addToast('Invitations not sent', result.message)
      const added = Number(result.invited?.added || 0)
      addToast('Member applicants invited', `${added} new invitation record${added === 1 ? '' : 's'} created for this workshop.`)
      setSelected([])
      refresh()
      onChanged?.()
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
  const exportCsv = async () => {
    if (pending) return
    setPending('export')
    try {
      const result = await exportInvitations(event.id)
      if (!result.ok) return addToast('Export unavailable', result.message)
      addToast('Invitation CSV exported', `${result.rowCount} private registration link${result.rowCount === 1 ? '' : 's'} prepared for n8n.`)
      refresh()
    } finally { setPending('') }
  }
  return <>
    <div className="adm-event-section-heading"><div><h4>Workshop participants</h4><p>Every member application of the club, with its invitation and registration state.</p></div></div>
    <div className="adm-event-quick-invite">
      <h4>Invitations</h4>
      <p>Invitations target member applications directly. Re-running never creates duplicates, and applications already invited keep their state.</p>
      <div className="adm-event-invite-actions">
        <Button variant="primary" onClick={() => invited({ scope: 'all_member_applicants' }, 'scope')} disabled={Boolean(pending)}>
          {pending === 'scope' ? 'Generating…' : 'Generate invitations for all Member registrations'}
        </Button>
      </div>
    </div>
    <div className="adm-toolbar">
      <SearchField value={search} onChange={(value) => { setSearch(value); setPage(1) }} placeholder="Search participants by name, email or speciality..." label="Search participants"/>
      <div className="adm-toolbar__filters">
        <Button onClick={() => invited({ applicationIds: selected }, 'selected')} disabled={Boolean(pending) || !selected.length}>{pending === 'selected' ? 'Inviting…' : `Invite selected (${selected.length})`}</Button>
      </div>
    </div>
    {error ? <div className="adm-state-error" role="alert"><TriangleAlert size={22}/><p>{error}</p><Button variant="secondary" onClick={refresh}>Try again</Button></div>
      : loading ? <EventsSkeleton/>
      : participants.length ? <div className="adm-table-wrap">
        <table className="adm-table adm-event-select-table">
          <thead><tr><th className="is-checkbox"><span className="sr-only">Select participant</span></th><th>Name</th><th>Email</th><th>University speciality</th><th>Invitation</th><th>Registration</th><th>Attendance</th><th aria-label="Actions"/></tr></thead>
          <tbody>{participants.map((record) => <tr key={record.id}>
            <td className="is-checkbox"><input
              type="checkbox"
              disabled={record.invitationReady}
              checked={selected.includes(record.id)}
              onChange={() => toggleParticipant(record.id)}
              aria-label={record.invitationReady ? `${record.name} already invited` : `Select ${record.name}`}/></td>
            <td><div className="adm-person-cell"><Avatar initials={record.initials} small/><span><b>{record.name}</b></span></div></td>
            <td>{record.email || '—'}</td>
            <td>{record.universitySpeciality || <span className="adm-muted">—</span>}</td>
            <td>{record.invitationReady ? <StatusBadge>{record.invitationStatus}</StatusBadge> : <span className="adm-muted">Not invited</span>}</td>
            <td>{record.registrationStatus ? <StatusBadge tone={record.registrationStatus === 'Registered' ? 'success' : 'neutral'}>{record.registrationStatus}</StatusBadge> : <span className="adm-muted">—</span>}</td>
            <td>{record.attendance
              ? <StatusBadge tone={record.attendance === 'present' ? 'success' : record.attendance === 'absent' ? 'danger' : 'neutral'}>{ATTENDANCE_LABELS[record.attendance]}</StatusBadge>
              : <span className="adm-muted">—</span>}</td>
            <td className="adm-row-action">{record.invitationReady && <>
              <button disabled={Boolean(pending) || !record.privateLinkReady} onClick={() => copyPrivateLink(record)}>{pending === `copy:${record.id}` ? 'Copying…' : 'Copy link'}</button>
              <button disabled={Boolean(pending) || !record.privateLinkReady} onClick={() => copyPrivateLink(record, true)}>{pending === `regenerate:${record.id}` ? 'Regenerating…' : 'Regenerate link'}</button>
            </>}</td>
          </tr>)}</tbody>
        </table>
        {!selected.length && <EmptyState title="No participants are selected" copy="Tick the box next to uninvited member applications to invite them individually."/>}
      </div>
      : <EmptyState title="No participants match" copy="Adjust the search; participants come from member applications of the club."/>}
    <Pagination current={pagination.page} count={pagination.total} pageSize={pagination.limit} onChange={setPage}/>
    <section className="adm-detail-section">
      <div className="adm-event-section-heading"><div><h4>Private registration links</h4><p>Links are hashed in storage and delivered manually; export prepares one row per active invitation.</p></div>
        <Button variant="secondary" icon={<Download size={15}/>} disabled={Boolean(pending)} onClick={exportCsv}>
          {pending === 'export' ? 'Exporting…' : 'Export invitations CSV'}
        </Button>
      </div>
      <p className="adm-muted">Copy or regenerate a personal link directly from the participant table above. Exported CSV rows contain the same private links plus names and emails for delivery.</p>
    </section>
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
        catch { addToast('Workshop scanner link ready', 'Copy the shared link below and open it on the door device.') }
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
    <div className="adm-event-section-heading"><div><h4>Workshop scanner</h4><p>One shared check-in link for the whole workshop. It grants no administrator access.</p></div></div>
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
        <p className="adm-muted">Regenerating stops the previous link and all live scanner sessions immediately. Revoke the link whenever the door device is unpaired.</p>
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
  const nextStatus = ({ draft: 'planned', planned: 'registration_open', registration_open: 'registration_closed', registration_closed: 'ongoing', ongoing: 'completed', completed: 'archived', cancelled: 'archived' })[event.statusKey]
  const nextLabel = ({ planned: 'Plan workshop', registration_open: 'Open registration', registration_closed: 'Close registration', ongoing: 'Start workshop', completed: 'Complete workshop', archived: 'Archive workshop' })[nextStatus]
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
