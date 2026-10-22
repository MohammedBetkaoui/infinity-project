import { useDeferredValue, useMemo, useState } from 'react'
import { ArrowLeft, Copy, Download, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAdmin } from './AdminStore'
import { RecordTable, RecordToolbar, SummaryStrip, Facts, History } from './AdminRecords'
import {
  Avatar, Button, ChipGroup, EmptyState, FilterSelect, Modal, PageHeader, Pagination, SearchField, StatusBadge, Tabs,
} from './AdminUI'
import {
  ATTENDANCE_FILTERS, ATTENDANCE_STATE_LABELS, DEPARTMENT_FILTERS, EVENT_STATUS_FILTERS, EVENT_TYPE_FILTERS,
  EVENT_TYPE_LABELS, EVENT_TYPES, buildEventPayload, eventCheckedAt, eventFormFieldValues,
  formatEventSchedule, validateEventForm,
} from './adminEventsModel'
import {
  useAdminEvent, useAdminEventActions, useAdminEventAttendance,
  useAdminEventInvitations, useAdminEventMembers, useAdminEventOrganizers, useAdminEventStaff, useAdminEvents,
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

const EventCell = ({ record }) => (
  <div className="adm-event-cell">
    <b>{record.title}</b>
    <small>{record.location}</small>
  </div>
)

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
  const quickDefinitions = useMemo(() => [
    { key: 'type', label: 'Event type', shortLabel: 'Type', allLabel: 'All types', options: EVENT_TYPE_FILTERS.map(({ value }) => value).filter(Boolean) },
  ], [])
  const columns = useMemo(() => [
    { key: 'title', label: 'Event', render: (record) => <EventCell record={record}/> },
    { key: 'type', label: 'Type', render: (record) => record.typeLabel },
    { key: 'starts', label: 'Date', render: (record) => formatEventSchedule(record.startsAt, record.endsAt) },
    { key: 'speaker', label: 'Facilitator / Lead' },
    { key: 'location', label: 'Location' },
    { key: 'invited', label: 'Invited', render: (record) => record.invitedCount ? <span className="adm-project-count">{record.invitedCount}</span> : '—' },
    { key: 'present', label: 'Present', secondary: true, render: (record) => record.attendanceCount ? <span className="adm-project-count">{record.presentCount}</span> : '—' },
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
      <RecordToolbar
        search={search}
        onSearch={(value) => { setSearch(value); setPage(1) }}
        placeholder="Search title, facilitator or location..."
        filters={filters}
        onFilters={(value) => { setFilters(value); setPage(1) }}
        definitions={filterDefinitions}
        quickDefinitions={quickDefinitions}
        resultCount={pagination.total}
        filterLabel="All filters"
        getOptionLabel={(value) => value === 'upcoming' ? 'Upcoming' : value === 'other' ? 'Other (remaining types)' : EVENT_TYPE_LABELS[value] || value}/>
      <div className="adm-chip-row"><ChipGroup label="Filter events by type" options={EVENT_TYPE_FILTERS} value={filters.type || ''} onChange={(value) => { setFilters({ ...filters, type: value }); setPage(1) }}/></div>
      <div className="adm-chip-row"><ChipGroup label="Filter events by status" options={EVENT_STATUS_FILTERS} value={filters.status || ''} onChange={(value) => { setFilters({ ...filters, status: value }); setPage(1) }}/></div>
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

const TABS = Object.freeze(['Overview', 'Invitations', 'Organizers', 'Attendance'])

function OverviewTab({ event, history }) {
  const statistics = event.statistics
  return <>
    <SummaryStrip items={[
      { value: statistics.totalInvited, label: 'Members invited' },
      { value: statistics.totalRegistered, label: 'Registered' },
      { value: statistics.presentCount, label: 'Present' },
      { value: statistics.absentCount, label: 'Absent' },
    ]}/>
    <section className="adm-detail-section"><h4>Workshop information</h4><Facts items={[
      ['Reference', event.ref], ['Schedule', formatEventSchedule(event.startsAt, event.endsAt)],
      ['Location', event.location], ['Facilitator / Lead', event.speaker],
      ['Visibility', event.visibility === 'internal' ? 'Internal' : 'Public'], ['Status', event.status],
      ['Description', event.description], ['Created', eventCheckedAt(event.createdAt)], ['Last update', eventCheckedAt(event.updatedAt)],
    ]}/></section>
    <section className="adm-detail-section"><h4>Operations summary</h4><div className="adm-event-operations">
      <p><b>Organizers</b> {event.organizerCount} assigned, {statistics.scannerEnabledOrganizers} prepared for scanner access.</p>
      <p><b>Attendance</b> {ATTENDANCE_STATE_LABELS[event.attendanceState] || 'Not started'} · {statistics.attendanceRate}% attendance rate.</p>
      {statistics.attendanceState === 'completed' && <StatusBadge tone="success">Attendance recorded</StatusBadge>}
    </div></section>
    <section className="adm-detail-section"><h4>History</h4>{history.length
      ? <History items={history}/>
      : <p className="adm-muted">No administrative history yet.</p>}</section>
  </>
}

function InvitationsTab({ event, onChanged }) {
  const { addToast } = useAdmin()
  const { invite, invitationLink, exportInvitations } = useAdminEventActions()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [pole, setPole] = useState('')
  const [selected, setSelected] = useState([])
  const [page, setPage] = useState(1)
  const [pending, setPending] = useState('')
  const { members, facets, pagination, loading, error, refresh } = useAdminEventMembers({ eventId: event.id, page, limit: 25, search: deferredSearch, pole, sort: 'name_asc' })
  const invitedList = useAdminEventInvitations({ eventId: event.id, page: 1, limit: 100 })
  const invited = async (input, label) => {
    if (pending) return
    setPending(label)
    try {
      const result = await invite(event.id, input)
      if (!result.ok) return addToast('Invitations not sent', result.message)
      const added = Number(result.invited?.added || 0)
      addToast('Members invited', `${added} new invitation record${added === 1 ? '' : 's'} created for this workshop.`)
      setSelected([])
      refresh()
      invitedList.refresh()
      onChanged?.()
    } finally { setPending('') }
  }
  const available = members.filter((member) => !member.invitation)
  const toggleMember = (id) => setSelected(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id])
  const copyPrivateLink = async (record, regenerate = false) => {
    if (pending) return
    if (regenerate && !window.confirm(`Regenerate ${record.name}'s private registration link? The previous link will stop working immediately.`)) return
    const label = `${regenerate ? 'regenerate' : 'copy'}:${record.id}`
    setPending(label)
    try {
      const result = await invitationLink(event.id, record.id, regenerate ? 'regenerate' : 'reveal', regenerate)
      if (!result.ok) return addToast('Private link unavailable', result.message)
      await navigator.clipboard.writeText(result.privateLink)
      addToast(regenerate ? 'Private link regenerated' : 'Private link copied', regenerate ? 'The previous link is no longer valid.' : 'The personal registration link is ready to paste.')
      invitedList.refresh()
    } finally { setPending('') }
  }
  const exportCsv = async () => {
    if (pending) return
    setPending('export')
    try {
      const result = await exportInvitations(event.id)
      if (!result.ok) return addToast('Export unavailable', result.message)
      addToast('Invitation CSV exported', `${result.rowCount} private registration link${result.rowCount === 1 ? '' : 's'} prepared for n8n.`)
      invitedList.refresh()
    } finally { setPending('') }
  }
  return <>
    <div className="adm-event-section-heading"><div><h4>Invite members</h4><p>Select current active members from the authoritative directory.</p></div></div>
    <div className="adm-event-quick-invite">
      <h4>Quick invite</h4>
      <p>Invite every current member of the club, or all active members of one primary pole. Repeated invitations never create duplicates.</p>
      <div className="adm-event-invite-actions">
        <Button variant="secondary" onClick={() => invited({ scope: 'all_active' }, 'all')} disabled={Boolean(pending)}>{pending === 'all' ? 'Inviting…' : 'Invite all active members'}</Button>
        {facets.poles.map(({ pole: name, count }) => (
          <Button key={name} variant="secondary" onClick={() => invited({ scope: 'primary_pole', pole: name }, name)} disabled={Boolean(pending)}>
            {pending === name ? 'Inviting…' : `Invite ${name} (${count})`}
          </Button>
        ))}
      </div>
    </div>
    <div className="adm-toolbar">
      <SearchField value={search} onChange={(value) => { setSearch(value); setPage(1) }} placeholder="Search members by name or pole..." label="Search members"/>
      <div className="adm-toolbar__filters">
        <FilterSelect label="Member status" value="active" onChange={() => {}}>
          <option value="active">Active members</option>
        </FilterSelect>
        <FilterSelect label="Filter members by primary pole" value={pole} onChange={(value) => { setPole(value); setPage(1) }}>
          <option value="">All poles</option>
          {facets.poles.map(({ pole: name }) => <option key={name} value={name}>{name}</option>)}
        </FilterSelect>
        <Button onClick={() => invited({ memberIds: selected }, 'selected')} disabled={Boolean(pending) || !selected.length}>{pending === 'selected' ? 'Inviting…' : `Invite selected (${selected.length})`}</Button>
      </div>
    </div>
    {error ? <div className="adm-state-error" role="alert"><TriangleAlert size={22}/><p>{error}</p><Button variant="secondary" onClick={refresh}>Try again</Button></div>
      : loading ? <EventsSkeleton/>
      : members.length ? <div className="adm-table-wrap">
        <table className="adm-table adm-event-select-table">
          <thead><tr><th className="is-checkbox"><span className="sr-only">Select member</span></th><th>Member</th><th>Pole</th><th>Level</th><th>Invitation</th></tr></thead>
          <tbody>{members.map((member) => <tr key={member.id}>
            <td className="is-checkbox"><input
              type="checkbox"
              disabled={Boolean(member.invitation)}
              checked={selected.includes(member.id)}
              onChange={() => toggleMember(member.id)}
              aria-label={member.invitation ? `${member.name} already invited` : `Select ${member.name}`}/></td>
            <td><div className="adm-person-cell"><Avatar initials={member.initials} small/><span><b>{member.name}</b></span></div></td>
            <td>{member.pole}</td>
            <td>{member.level}</td>
            <td>{member.invitation ? <StatusBadge>{member.invitation.status}</StatusBadge> : <span className="adm-muted">Not invited yet</span>}</td>
          </tr>)}</tbody>
        </table>
        {!available.length && <EmptyState title="All listed members are invited already" copy="Use the quick invite buttons to invite further poles or all active members."/>}
      </div>
      : <EmptyState title="No members match" copy="Adjust the search or clear the pole filter."/>}
    <Pagination current={pagination.page} count={pagination.total} pageSize={pagination.limit} onChange={setPage}/>
    <section className="adm-detail-section">
      <div className="adm-event-section-heading"><div><h4>Invited participants</h4><p>Historical invitations remain visible if a member later becomes inactive or archived.</p></div>
        <Button variant="secondary" icon={<Download size={15}/>} disabled={Boolean(pending) || !invitedList.records.length} onClick={exportCsv}>
          {pending === 'export' ? 'Exporting…' : 'Export invitations CSV'}
        </Button>
      </div>
      {invitedList.error ? <div className="adm-state-error" role="alert"><TriangleAlert size={22}/><p>{invitedList.error}</p><Button variant="secondary" onClick={invitedList.refresh}>Try again</Button></div>
        : invitedList.loading ? <EventsSkeleton/>
        : invitedList.records.length ? <div className="adm-table-wrap"><table className="adm-table"><thead><tr><th>Member</th><th>Email</th><th>Pole</th><th>Invitation</th><th>Registration</th><th>Private link</th><th aria-label="Actions"/></tr></thead>
          <tbody>{invitedList.records.map((record) => <tr key={record.id}>
            <td><div className="adm-person-cell"><Avatar initials={record.initials} small/><span><b>{record.name}</b><small>{record.memberStatus && record.memberStatus !== 'active' ? record.memberStatus : eventCheckedAt(record.invitedAt)}</small></span></div></td>
            <td>{record.email || '—'}</td><td>{record.pole}</td><td><StatusBadge>{record.invitationStatus}</StatusBadge></td>
            <td><StatusBadge tone={record.registeredAt ? 'success' : 'neutral'}>{record.registrationStatus}</StatusBadge>{record.registeredAt && <small className="adm-table-date">{eventCheckedAt(record.registeredAt)}</small>}</td>
            <td><StatusBadge tone={record.privateLinkStatus === 'Ready' ? 'success' : 'neutral'}>{record.privateLinkStatus}</StatusBadge></td>
            <td className="adm-row-action"><button disabled={Boolean(pending)} onClick={() => copyPrivateLink(record)}>{pending === `copy:${record.id}` ? 'Copying…' : 'Copy link'}</button><button disabled={Boolean(pending)} onClick={() => copyPrivateLink(record, true)}>{pending === `regenerate:${record.id}` ? 'Regenerating…' : 'Regenerate link'}</button></td>
          </tr>)}</tbody></table></div>
        : <EmptyState title="No invited participants yet" copy="Invite active members above. Their historical records will appear here."/>}
    </section>
  </>
}

function OrganizersTab({ event, onChanged }) {
  const { addToast } = useAdmin()
  const { assignOrganizers, removeOrganizer, setScannerAccess, scannerCredential } = useAdminEventActions()
  const { organizers, loading, error, refresh } = useAdminEventOrganizers(event.id, true)
  const [adding, setAdding] = useState(false)
  const [staffSearch, setStaffSearch] = useState('')
  const deferredStaffSearch = useDeferredValue(staffSearch.trim())
  const [staffDepartment, setStaffDepartment] = useState('')
  const [selectedStaff, setSelectedStaff] = useState([])
  const [pending, setPending] = useState('')
  const [privateLinks, setPrivateLinks] = useState({})
  const { records: eligibleStaff, loading: staffLoading, error: staffError } = useAdminEventStaff({ eventId: event.id, search: deferredStaffSearch, department: staffDepartment, active: adding })
  const assign = async () => {
    if (pending || !selectedStaff.length) return
    setPending('add')
    try {
      const result = await assignOrganizers(event.id, selectedStaff)
      if (!result.ok) return addToast('Organizers not assigned', result.message)
      addToast('Organizers assigned', `${result.added} added${result.skipped ? `, ${result.skipped} skipped (not active)` : ''}.`)
      setSelectedStaff([])
      setAdding(false)
      setStaffSearch(''); setStaffDepartment('')
      refresh()
      onChanged?.()
    } finally { setPending('') }
  }
  const remove = async (organizer) => {
    if (pending) return
    setPending(`remove:${organizer.staffProfileId}`)
    try {
      const result = await removeOrganizer(event.id, organizer.staffProfileId)
      if (!result.ok) return addToast('Organizer not removed', result.message)
      addToast('Organizer removed', `${organizer.name} is no longer an organizer of this event.`)
      refresh()
      onChanged?.()
    } finally { setPending('') }
  }
  const scanner = async (organizer, enabled) => {
    if (pending) return
    setPending(`scanner:${organizer.staffProfileId}`)
    try {
      const result = await setScannerAccess(event.id, organizer.staffProfileId, enabled)
      if (!result.ok) return addToast('Scanner access not updated', result.message)
      addToast(enabled ? 'Scanner access prepared' : 'Scanner access disabled', enabled ? `${organizer.name} can be issued a private scanner link in the check-in phase.` : 'No scanner link will be issued for this organizer.')
      refresh()
      onChanged?.()
    } finally { setPending('') }
  }
  const credential = async (organizer, action) => {
    if (pending) return
    setPending(`credential:${organizer.id}`)
    try {
      const result = await scannerCredential(event.id, organizer.id, action)
      if (!result.ok) return addToast('Scanner link not updated', result.message)
      if (action === 'revoke') {
        setPrivateLinks((current) => { const next = { ...current }; delete next[organizer.id]; return next })
        addToast('Scanner link revoked', `${organizer.name}'s private scanner access is no longer valid.`)
      } else {
        setPrivateLinks((current) => ({ ...current, [organizer.id]: result.privateUrl }))
        try { await navigator.clipboard.writeText(result.privateUrl); addToast('Private scanner link copied', 'Share it only with the selected organizer.') }
        catch { addToast('Private scanner link generated', 'Use Copy private link below to copy it securely.') }
      }
      refresh(); onChanged?.()
    } finally { setPending('') }
  }
  const copyPrivateLink = async (organizer) => {
    try { await navigator.clipboard.writeText(privateLinks[organizer.id]); addToast('Private scanner link copied', 'The link is ready to share.') }
    catch { addToast('Copy unavailable', 'Select and copy the generated link manually.') }
  }
  return <>
    <div className="adm-toolbar">
      <p className="adm-toolbar-note">Organizers are active staff members responsible for running this workshop.</p>
      <Button onClick={() => setAdding(true)} icon={<Plus size={16}/>}>Add organizers</Button>
    </div>
    {error ? <div className="adm-state-error" role="alert"><TriangleAlert size={22}/><p>{error}</p><Button variant="secondary" onClick={refresh}>Try again</Button></div>
      : loading ? <EventsSkeleton/>
      : organizers.length ? <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Organizer</th><th>Department</th><th>Internal role</th><th>Scanner access</th><th aria-label="Actions"/></tr></thead>
          <tbody>{organizers.map((organizer) => <tr key={organizer.id}>
            <td><div className="adm-person-cell"><Avatar initials={organizer.initials} small/><span><b>{organizer.name}</b></span></div></td>
            <td>{organizer.department}</td>
            <td>{organizer.role}</td>
            <td><div className="adm-event-scanner-state">
              <StatusBadge tone={organizer.scannerAccess?.status === 'active' ? 'success' : 'neutral'}>{organizer.scannerAccess?.status === 'active' ? 'Active private link' : organizer.scannerEnabled ? 'Enabled · not generated' : 'Disabled'}</StatusBadge>
              {organizer.scannerAccess?.expiresAt && <small>Expires {eventCheckedAt(organizer.scannerAccess.expiresAt)}</small>}
              {privateLinks[organizer.id] && <div className="adm-private-link"><input readOnly value={privateLinks[organizer.id]} aria-label={`Private scanner link for ${organizer.name}`}/><button onClick={() => copyPrivateLink(organizer)}><Copy size={14}/> Copy private link</button></div>}
            </div></td>
            <td className="adm-row-action">
              <div className="adm-event-organizer-actions">
                <button disabled={Boolean(pending)} onClick={() => scanner(organizer, !organizer.scannerEnabled)}>{pending === `scanner:${organizer.staffProfileId}` ? 'Saving…' : organizer.scannerEnabled ? 'Disable scanner access' : 'Enable scanner access'}</button>
                {organizer.scannerEnabled && <button disabled={Boolean(pending)} onClick={() => credential(organizer, organizer.scannerAccess?.status === 'active' ? 'regenerate' : 'generate')}>{pending === `credential:${organizer.id}` ? 'Generating…' : organizer.scannerAccess?.status === 'active' ? 'Regenerate private link' : 'Generate access'}</button>}
                {organizer.scannerAccess?.status === 'active' && <button disabled={Boolean(pending)} onClick={() => credential(organizer, 'revoke')}>Revoke link</button>}
                <button className="is-danger" disabled={Boolean(pending)} onClick={() => remove(organizer)}>{pending === `remove:${organizer.staffProfileId}` ? 'Removing…' : 'Remove'}</button>
              </div>
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      : <EmptyState title="No organizers assigned yet" copy="Assign active staff members to prepare the workshop operations."/>}
    {adding && <Modal open onClose={() => { setAdding(false); setSelectedStaff([]); setStaffSearch(''); setStaffDepartment('') }} wide eyebrow={`Workshop · ${event.ref}`} title="Add organizers" closeLabel="Close"
      footer={<>
        <Button variant="secondary" onClick={() => { setAdding(false); setSelectedStaff([]) }}>Cancel</Button>
        <Button onClick={assign} disabled={Boolean(pending) || !selectedStaff.length}>{pending === 'add' ? 'Adding…' : `Add ${selectedStaff.length || ''} organizer${selectedStaff.length === 1 ? '' : 's'}`}</Button>
      </>}>
      <div className="adm-event-staff-picker">
        <SearchField value={staffSearch} onChange={setStaffSearch} placeholder="Search staff by name or role..." label="Search staff"/>
        <ChipGroup label="Filter staff by department" options={DEPARTMENT_FILTERS} value={staffDepartment} onChange={setStaffDepartment}/>
        {staffError ? <div className="adm-state-error" role="alert"><TriangleAlert size={22}/><p>{staffError}</p></div> : staffLoading ? <EventsSkeleton/> : <>
          <div className="adm-table-wrap">
            <table className="adm-table adm-event-select-table">
              <thead><tr><th className="is-checkbox"><span className="sr-only">Select staff</span></th><th>Staff member</th><th>Department</th><th>Internal role</th></tr></thead>
              <tbody>{eligibleStaff.map((record) => <tr key={record.id}>
                <td className="is-checkbox"><input
                  type="checkbox"
                  disabled={record.assigned}
                  checked={selectedStaff.includes(record.id)}
                  onChange={() => setSelectedStaff(selectedStaff.includes(record.id) ? selectedStaff.filter((value) => value !== record.id) : [...selectedStaff, record.id])}
                  aria-label={`Select ${record.name}`}/></td>
                <td><div className="adm-person-cell"><Avatar initials={record.initials} small/><span><b>{record.name}</b></span></div></td>
                <td>{record.department}</td>
                <td>{record.role}</td>
              </tr>)}</tbody>
            </table>
            {!eligibleStaff.length && <EmptyState title="No active staff found" copy="Adjust the search or the department filter."/>}
          </div>
          <p className="adm-toolbar-note">{organizers.length ? `${organizers.length} organizer${organizers.length === 1 ? '' : 's'} already assigned. Members who are not active staff are skipped automatically.` : 'Only active staff members are assigned. Others are skipped automatically.'}</p>
        </>}
      </div>
    </Modal>}
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
    { key: 'name', label: 'Member', render: (row) => <div className="adm-person-cell"><Avatar initials={row.initials} small/><span><b>{row.name}</b></span></div> },
    { key: 'pole', label: 'Pole' },
    { key: 'registration', label: 'Registration', render: (row) => row.registration ? <StatusBadge tone="success">{row.registration}</StatusBadge> : '—' },
    { key: 'status', label: 'Attendance', render: (row) => <StatusBadge>{row.status}</StatusBadge> },
    { key: 'checkedInAt', label: 'Check-in', render: (row) => eventCheckedAt(row.checkedInAt) },
    { key: 'checkedInBy', label: 'Scanner', render: (row) => row.checkedInBy || '—' },
  ], [])
  return <>
    {summary && <SummaryStrip items={[
      { value: summary.registered, label: 'Registered' },
      { value: summary.present, label: 'Present' },
      { value: summary.remaining, label: 'Remaining' },
      { value: summary.absent, label: 'Absent' },
      { value: `${summary.attendanceRate}%`, label: 'Attendance rate', meta: `${summary.present} present` },
    ]}/>}
    <div className="adm-chip-row"><ChipGroup label="Filter attendance" options={ATTENDANCE_FILTERS} value={status} onChange={(value) => { setStatus(value); setPage(1) }}/></div>
    <div className="adm-toolbar">
      <p className="adm-toolbar-note">Expected participants remain pending until scanned. They are never marked absent automatically.</p>
      <div className="adm-toolbar__filters">
        <Button variant="secondary" onClick={refresh} icon={<RefreshCw size={15}/>}>Refresh</Button>
        {event.statusKey === 'completed' && <Button variant="secondary" disabled={finalizing} onClick={async () => {
          if (!window.confirm('Finalize every remaining expected participant as absent? This action is explicit and auditable.')) return
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
        labels={{ empty: 'No attendance rows', record: 'member' }}/>
      : <EmptyState title="No attendance recorded yet" copy="Every invited member gets an expected attendance row; it fills in during the check-in phase."/>}
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
      description={[formatEventSchedule(event.startsAt, event.endsAt), event.location, event.speaker].filter(Boolean).join(' · ')}
      meta={<StatusBadge>{event.status}</StatusBadge>}
      actions={<>
        <Button variant="secondary" onClick={refresh} icon={<RefreshCw size={16}/>}>Refresh</Button>
        {nextStatus && <Button variant="secondary" disabled={transitioning} onClick={() => move(nextStatus)}>{transitioning ? 'Updating…' : nextLabel}</Button>}
        {!['completed', 'cancelled', 'archived'].includes(event.statusKey) && <Button variant="secondary" disabled={transitioning} onClick={() => move('cancelled')}>Cancel workshop</Button>}
        <Button onClick={() => setEditing(true)}>Edit workshop</Button>
      </>}/>
    <Tabs items={TABS} value={tab} onChange={setTab} label="Event sections" counts={{ Invitations: event.invitedCount, Organizers: event.organizerCount, Attendance: event.attendanceCount }}/>
    <div className="adm-event-detail-body">
      {tab === 'Overview' && <OverviewTab event={event} history={event.history}/>}
      {tab === 'Invitations' && <InvitationsTab event={event} onChanged={refresh}/>}
      {tab === 'Organizers' && <OrganizersTab event={event} onChanged={refresh}/>}
      {tab === 'Attendance' && <AttendanceTab event={event}/>}
    </div>
    {editing && <EditEventModal event={event} open onClose={() => setEditing(false)} onSaved={refresh}/>} 
  </div>
}
