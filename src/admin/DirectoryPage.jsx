import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Activity, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAdmin } from './AdminStore'
import { ActionDialog, Facts, History, RecordTable, RecordToolbar, SummaryStrip } from './AdminRecords'
import { PeopleCardGrid } from './PeoplePages'
import { AVAILABILITY, DEPARTMENTS, LEVELS, POLES } from './adminModel'
import { Avatar, Button, Drawer, PageHeader, StatusBadge } from './AdminUI'
import { useAdminPeople, useAdminPeopleActions } from './useAdminPeople'

const STATUS_KEYS = Object.freeze({ Active: 'active', 'On pause': 'on_pause', Inactive: 'inactive', Alumni: 'alumni', Archived: 'archived' })
const AVAILABILITY_KEYS = Object.freeze({ 'A few hours each week': 'weekly', 'Mostly around events and projects': 'events', 'Variable during the semester': 'flexible' })
const DEPARTMENT_KEYS = Object.freeze({ 'Dev / Tech': 'dev-tech', 'Design / Content Creation': 'design-content', 'Management / Logistics': 'management-logistics' })
const SORT_KEYS = Object.freeze({ name: 'name', level: 'level', pole: 'structure', department: 'structure', availability: 'availability', joined: 'joined', status: 'status' })
const MEMBER_STATUSES = Object.freeze(['Active', 'On pause', 'Inactive', 'Alumni', 'Archived'])
const STAFF_STATUSES = Object.freeze(['Active', 'On pause', 'Inactive', 'Archived'])
const Person = ({ record }) => <div className="adm-person-cell"><Avatar initials={record.initials} small/><span><b>{record.name}</b><small>{record.email}</small></span></div>

function DirectorySkeleton({ kind }) {
  return <div className="adm-skeleton-group" role="status" aria-label={`Loading ${kind}`}>
    {Array.from({ length: 6 }, (_, index) => <div className="adm-skeleton-row" key={index}><i/><span/><span/></div>)}
  </div>
}

export default function DirectoryPage({ kind }) {
  const isStaff = kind === 'staff'
  const { addToast } = useAdmin()
  const [params] = useSearchParams()
  const requestedRecordId = params.get('record')
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const [filters, setFilters] = useState({})
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ key: 'joined', asc: false })
  const [view, setView] = useState('cards')
  const [mobileCardsOnly, setMobileCardsOnly] = useState(false)
  const [selected, setSelected] = useState([])
  const [detail, setDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(Boolean(requestedRecordId))
  const [action, setAction] = useState(null)
  const [note, setNote] = useState('')
  const sortValue = `${SORT_KEYS[sort.key] || 'joined'}_${sort.asc ? 'asc' : 'desc'}`
  const { records, pagination, counts, facets, loading, error, refresh } = useAdminPeople({ kind, page, search: deferredSearch, filters, sort: sortValue })
  const { loadDetail, act, create, bulk } = useAdminPeopleActions(kind)
  const activeView = mobileCardsOnly ? 'cards' : view

  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const sync = () => setMobileCardsOnly(query.matches)
    sync(); query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const resetScope = useCallback((callback) => { callback(); setPage(1); setSelected([]) }, [])
  const open = useCallback(async (recordOrId) => {
    const id = typeof recordOrId === 'string' ? recordOrId : recordOrId.id
    setDetailLoading(true)
    try { setDetail(await loadDetail(id)); setNote('') }
    catch (loadError) { addToast('Profile unavailable', loadError.message) }
    finally { setDetailLoading(false) }
  }, [addToast, loadDetail])

  useEffect(() => {
    if (!requestedRecordId) return undefined
    let active = true
    loadDetail(requestedRecordId).then((profile) => { if (active) setDetail(profile) }).catch((loadError) => addToast('Profile unavailable', loadError.message)).finally(() => { if (active) setDetailLoading(false) })
    return () => { active = false }
  }, [addToast, loadDetail, requestedRecordId])

  const statusOptions = isStaff ? STAFF_STATUSES : MEMBER_STATUSES
  const fields = useMemo(() => [
    { key: 'level', label: 'Study level', options: LEVELS },
    { key: 'structure', label: isStaff ? 'Current department' : 'Primary pole', options: facets.structures?.length ? facets.structures : (isStaff ? DEPARTMENTS : ['Unassigned', ...POLES]) },
    { key: 'availability', label: 'Availability', options: AVAILABILITY },
    { key: 'speciality', label: 'Speciality', options: facets.specialities || [] },
    { key: 'status', label: 'Status', options: statusOptions },
    { key: 'dateFrom', label: 'Joined from', type: 'date', options: [] },
    { key: 'dateTo', label: 'Joined until', type: 'date', options: [] },
  ], [facets.specialities, facets.structures, isStaff, statusOptions])
  const quickFields = useMemo(() => [
    { key: 'structure', label: isStaff ? 'Current department' : 'Primary pole', shortLabel: isStaff ? 'Department' : 'Pole', allLabel: isStaff ? 'All departments' : 'All poles', options: facets.structures?.length ? facets.structures : (isStaff ? DEPARTMENTS : ['Unassigned', ...POLES]) },
    { key: 'status', label: 'Status', allLabel: 'All statuses', options: statusOptions },
  ], [facets.structures, isStaff, statusOptions])
  const columns = useMemo(() => [
    { key: 'name', label: 'Person', render: (record) => <Person record={record}/> },
    ...(isStaff ? [
      { key: 'department', label: 'Department' }, { key: 'role', label: 'Internal role' },
      { key: 'level', label: 'Level', secondary: true }, { key: 'availability', label: 'Availability', secondary: true },
      { key: 'projects', label: 'Projects', render: (record) => <span className="adm-project-count">{record.activityCount}</span> },
    ] : [
      { key: 'level', label: 'Academic profile', render: (record) => <span className="adm-member-academic"><b>{record.level}</b><small>{record.speciality}</small></span> },
      { key: 'pole', label: 'Primary pole' }, { key: 'cohort', label: 'Cohort', secondary: true },
      { key: 'joined', label: 'Entry date' }, { key: 'last', label: 'Last activity', secondary: true },
    ]),
    { key: 'status', label: 'Status', render: (record) => <StatusBadge>{record.status}</StatusBadge> },
  ], [isStaff])

  const openAction = (title, actionName, fields, options = {}) => setAction({ title, actionName, fields, reason: options.reason === true ? undefined : false, danger: options.danger, description: options.description })
  const newProfile = () => setAction({
    title: isStaff ? 'Add staff member' : 'New member', create: true, reason: false,
    description: 'Create a real directory profile. This action is saved in the database and audit history.',
    fields: [
      { name: 'fullName', label: 'Full name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
      { name: 'phone', label: 'Phone number' }, { name: 'studyYear', label: 'Study level', options: LEVELS, required: true },
      { name: 'speciality', label: 'Department / speciality', required: true }, { name: 'availability', label: 'Availability', options: AVAILABILITY, required: true },
      ...(isStaff ? [{ name: 'department', label: 'Current department', options: DEPARTMENTS, required: true }, { name: 'role', label: 'Internal role', required: true }] : [{ name: 'pole', label: 'Primary pole', options: ['Unassigned', ...POLES], required: true }]),
      { name: 'joinedAt', label: 'Entry date', type: 'date', value: new Date().toISOString().slice(0, 10), required: true },
    ],
  })

  const actionPayload = (name, values) => {
    if (name === 'update_profile') return { fullName: values.fullName, email: values.email, phone: values.phone, studyYear: values.studyYear === 'Other' ? 'other' : values.studyYear, speciality: values.speciality }
    if (name === 'change_pole') return { pole: values.pole }
    if (name === 'promote_to_staff') return { department: DEPARTMENT_KEYS[values.department], role: values.role }
    if (name === 'assign_role') return { role: values.role }
    if (name === 'move_department') return { department: DEPARTMENT_KEYS[values.department] }
    if (name === 'assign_project') return { project: values.project }
    if (name === 'change_availability') return { availability: AVAILABILITY_KEYS[values.availability] }
    if (name === 'set_status') return { status: STATUS_KEYS[values.status] }
    return {}
  }

  const submitAction = async (values) => {
    if (action.create) {
      const result = await create({ ...values, studyYear: values.studyYear === 'Other' ? 'other' : values.studyYear, availability: AVAILABILITY_KEYS[values.availability], department: DEPARTMENT_KEYS[values.department] })
      if (!result.ok) return result.message
      refresh(); addToast('Profile created', `${result.profile.name} is now available in the live directory.`); return undefined
    }
    if (action.bulk) {
      const selectedRecords = records.filter((record) => selected.includes(record.id))
      const result = await bulk({ action: 'set_status', payload: { status: STATUS_KEYS[values.status] }, reason: values.reason || '', records: selectedRecords.map((record) => ({ id: record.id, expectedUpdatedAt: record.updatedAt })) })
      if (!result.ok) return result.message
      setSelected([]); refresh(); addToast('Profiles updated', `${result.succeeded.length} updated${result.failed.length ? `, ${result.failed.length} skipped` : ''}.`); return undefined
    }
    const result = await act(detail.id, { action: action.actionName, expectedUpdatedAt: detail.updatedAt, reason: values.reason || '', payload: actionPayload(action.actionName, values) })
    if (!result.ok) return result.message
    setDetail(result.profile); refresh(); addToast(action.title, 'The live profile and audit history were updated.'); return undefined
  }

  const saveNote = async () => {
    if (!note.trim()) return addToast('Note is empty', 'Write a note before saving.')
    const result = await act(detail.id, { action: 'add_note', expectedUpdatedAt: detail.updatedAt, reason: '', payload: { note: note.trim() } })
    if (!result.ok) return addToast('Note not saved', result.message)
    setDetail(result.profile); setNote(''); refresh(); addToast('Internal note saved', 'The note was added to the secure profile history.')
  }
  const openBulk = () => setAction({ title: `Update ${selected.length} selected profiles`, bulk: true, reason: true, fields: [{ name: 'status', label: 'New status', options: statusOptions }] })
  const can = (name) => detail?.allowedActions?.includes(name)
  const summary = [
    { value: counts.active || 0, label: isStaff ? 'Active staff' : 'Active members', meta: 'Live directory' },
    { value: counts.on_pause || 0, label: 'On pause' }, { value: counts.inactive || 0, label: 'Inactive' },
    { value: (counts.archived || 0) + (isStaff ? 0 : counts.alumni || 0), label: isStaff ? 'Archived' : 'Alumni / archived' },
  ]

  return <div className={`adm-page adm-people-page adm-${kind}-page`}>
    <PageHeader eyebrow={isStaff ? 'Operations - Team structure' : 'Community - Member directory'} title={isStaff ? 'Staff operations' : 'Members'} description={isStaff ? 'Manage departments, roles and operational availability from the live database.' : 'Follow every accepted member, their participation and their current place in the club.'} actions={<><Button variant="secondary" onClick={refresh} icon={<RefreshCw size={16}/>}>Refresh</Button><Button onClick={newProfile} icon={<Plus size={16}/>}>{isStaff ? 'Add staff member' : 'New member'}</Button></>}/>
    <SummaryStrip items={summary}/>
    {isStaff && <div className="adm-operational-note"><Activity size={16}/><p>The <b>requested department</b> comes from Join. The <b>current department and internal role</b> are controlled by administration.</p></div>}
    <div className="adm-work-panel">
      <RecordToolbar search={search} onSearch={(value) => resetScope(() => setSearch(value))} placeholder="Search name, email, speciality or structure..." filters={filters} onFilters={(value) => resetScope(() => setFilters(value))} definitions={fields} quickDefinitions={quickFields} resultCount={pagination.total} filterLabel="All filters" view={activeView} onView={mobileCardsOnly ? undefined : setView}/>
      {error ? <div className="adm-state-error" role="alert"><TriangleAlert size={24}/><h3>Directory could not be loaded</h3><p>{error}</p><Button onClick={refresh} variant="secondary">Try again</Button></div> : loading ? <DirectorySkeleton kind={kind}/> : activeView === 'cards' ? <PeopleCardGrid records={records} isStaff={isStaff} selected={selected} onSelect={setSelected} onBulk={openBulk} onOpen={open} pagination={pagination} onPageChange={(value) => { setPage(value); setSelected([]) }}/> : <RecordTable className={`adm-people-table-view ${isStaff ? 'is-staff' : 'is-members'}`} records={records} columns={columns} selected={selected} onSelect={setSelected} onOpen={open} onBulk={openBulk} pagination={pagination} onPageChange={(value) => { setPage(value); setSelected([]) }} controlledSort={sort} onSortChange={(value) => resetScope(() => setSort(value))} rowClassName={(record) => record.status === 'Active' ? 'is-profile-active' : 'is-profile-followup'}/>}
    </div>
    {detailLoading && <div className="adm-applications-detail-loading" role="status"><RefreshCw size={16}/><span>Opening secure profile...</span></div>}
    {detail && <Drawer title={isStaff ? 'Operational profile' : 'Member profile'} eyebrow={detail.ref} onClose={() => setDetail(null)} footer={<>
      {isStaff ? <><Button disabled={!can('assign_role')} onClick={() => openAction('Assign internal role', 'assign_role', [{ name: 'role', label: 'Internal role', value: detail.role, required: true }])}>Assign a role</Button><Button variant="secondary" disabled={!can('move_department')} onClick={() => openAction('Move department', 'move_department', [{ name: 'department', label: 'Current department', options: DEPARTMENTS, value: detail.department }], { reason: true })}>Move department</Button><div><button disabled={!can('assign_project')} onClick={() => openAction('Assign project', 'assign_project', [{ name: 'project', label: 'Project name', required: true }])}>Assign project</button><button disabled={!can('change_availability')} onClick={() => openAction('Change availability', 'change_availability', [{ name: 'availability', label: 'Availability', options: AVAILABILITY, value: detail.availability }])}>Availability</button></div></> : <><Button disabled={!can('update_profile')} onClick={() => openAction('Edit member profile', 'update_profile', [{ name: 'fullName', label: 'Full name', value: detail.name, required: true }, { name: 'email', label: 'Email', type: 'email', value: detail.email, required: true }, { name: 'phone', label: 'Phone', value: detail.phone === 'Not provided' ? '' : detail.phone }, { name: 'studyYear', label: 'Study level', options: LEVELS, value: detail.level }, { name: 'speciality', label: 'Speciality', value: detail.speciality, required: true }])}>Edit profile</Button><Button variant="secondary" disabled={!can('change_pole')} onClick={() => openAction('Change primary pole', 'change_pole', [{ name: 'pole', label: 'Primary pole', options: ['Unassigned', ...POLES], value: detail.pole }])}>Change pole</Button>{!detail.hasStaffProfile && <div><button disabled={!can('promote_to_staff')} onClick={() => openAction('Promote member to staff', 'promote_to_staff', [{ name: 'department', label: 'Department', options: DEPARTMENTS }, { name: 'role', label: 'Internal role', required: true }], { reason: true })}>Promote to staff</button></div>}</>}
      <div><button className="is-danger" disabled={!can('set_status')} onClick={() => openAction('Change profile status', 'set_status', [{ name: 'status', label: 'New status', options: statusOptions, value: detail.status }], { reason: true, danger: true })}>Change status</button></div>
    </>}>
      <div className="adm-candidate-identity"><Avatar initials={detail.initials}/><div><h3>{detail.name}</h3><p>{detail.role || detail.pole}</p></div><StatusBadge>{detail.status}</StatusBadge></div>
      <section className="adm-detail-section"><h4><span>01</span>Identity & academic path</h4><Facts items={[["Email", detail.email], ['Phone', detail.phone], ['Study level', detail.level], ['Speciality', detail.speciality]]}/></section>
      <section className="adm-detail-section"><h4><span>02</span>{isStaff ? 'Operational assignment' : 'Membership'}</h4><Facts items={isStaff ? [['Requested at registration', detail.requested], ['Current department', detail.department], ['Current internal role', detail.role], ['Availability', detail.availability]] : [['Primary pole', detail.pole], ['Cohort', detail.cohort], ['Entry date', detail.joined], ['Last activity', detail.last]]}/></section>
      <section className="adm-detail-section"><h4><span>03</span>{isStaff ? 'Assigned projects' : 'Event participation'}</h4>{(isStaff ? detail.assignedProjects : detail.events)?.length ? <div className="adm-project-list">{(isStaff ? detail.assignedProjects : detail.events).map((item) => <p key={item}><span>{item}</span><StatusBadge tone="success">{isStaff ? 'Assigned' : 'Attended'}</StatusBadge></p>)}</div> : <p className="adm-muted">No {isStaff ? 'projects assigned' : 'participation recorded'} yet.</p>}</section>
      <section className="adm-detail-section"><h4><span>04</span>Internal notes</h4><label className="sr-only" htmlFor="directory-note">Administrative note</label><textarea id="directory-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add context for your colleagues..."/><button className="adm-save-note" onClick={saveNote}>Save note</button></section>
      <section className="adm-detail-section"><h4><span>05</span>History</h4><History items={detail.history}/></section>
    </Drawer>}
    {action && <ActionDialog key={`${action.title}-${detail?.updatedAt || 'new'}`} action={action} onClose={() => setAction(null)} onSubmit={submitAction}/>}
  </div>
}
