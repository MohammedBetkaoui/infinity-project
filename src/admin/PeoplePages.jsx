import { useState } from 'react'
import { Activity, CalendarDays, Plus, UserCheck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useAdmin } from './AdminStore'
import { AVAILABILITY, APPLICATION_STATUSES, DEPARTMENTS, EXPERIENCE, LEVELS, POLES, dateLabel, filterRecords, initialsOf } from './adminModel'
import { Avatar, Button, Drawer, PageHeader, StatusBadge, Tabs } from './AdminUI'
import { ActionDialog, Facts, History, RecordTable, RecordToolbar, SummaryStrip } from './AdminRecords'

const titles = { applications: ['People · Join intake', 'Join applications', 'Every new connection starts here. Review, meet and welcome the next Infinity members.'], members: ['Community · Member directory', 'Members', 'The people who make Infinity. Follow their journey, participation and interests.'], staff: ['Operations · Team structure', 'Staff operations', 'Three departments. One shared direction. Keep your team coordinated.'] }
const unique = (items, key) => [...new Set(items.map((item) => item[key]))].filter(Boolean)
const Person = ({ record }) => <div className="adm-person-cell"><Avatar initials={record.initials} small/><span><b>{record.name}</b><small>{record.email || record.id}</small></span>{record.status === 'New' && <i title="New application"/>}</div>

export default function PeoplePage({ collection, globalQuery }) {
  const { state, update, addRecord, addToast } = useAdmin()
  const records = state[collection]
  const [params] = useSearchParams()
  const [tab, setTab] = useState(params.get('stage') || 'New')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({})
  const [view, setView] = useState('table')
  const [selected, setSelected] = useState([])
  const [detailId, setDetailId] = useState(params.get('record'))
  const [action, setAction] = useState(null)
  const [note, setNote] = useState('')
  const application = collection === 'applications'
  const isStaff = collection === 'staff'
  const detail = records.find((record) => record.id === detailId)
  const [eyebrow, title, description] = titles[collection]
  const open = (record) => { setDetailId(record.id); setNote(record.note || '') }
  const fields = [
    { key: 'level', label: 'Study level', options: LEVELS },
    ...(application ? [{ key: 'type', label: 'Application type', options: ['Member', 'Staff'] }, { key: 'track', label: 'Interest / requested department', options: [...POLES, ...DEPARTMENTS] }, { key: 'experience', label: 'Experience', options: EXPERIENCE }, { key: 'availability', label: 'Availability', options: AVAILABILITY }, { key: 'date', label: 'Submission date', options: unique(records, 'date') }] : isStaff ? [{ key: 'department', label: 'Current department', options: DEPARTMENTS }, { key: 'availability', label: 'Availability', options: unique(records, 'availability') }] : [{ key: 'pole', label: 'Primary pole', options: ['Unassigned', ...POLES] }, { key: 'cohort', label: 'Cohort', options: unique(records, 'cohort') }, { key: 'joined', label: 'Entry date', options: unique(records, 'joined') }]),
    { key: 'speciality', label: 'Speciality', options: unique(records, 'speciality') },
    ...(!application ? [{ key: 'status', label: 'Status', options: isStaff ? ['Active', 'On pause', 'Inactive', 'Archived'] : ['Active', 'On pause', 'Inactive', 'Alumni', 'Archived'] }] : []),
  ]
  const visible = filterRecords(records, `${search} ${globalQuery}`.trim(), { ...filters, ...(application ? { status: tab } : {}) })
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, records.filter((r) => r.status === status).length]))
  const columns = [
    { key: 'name', label: application ? 'Candidate' : 'Person', render: (r) => <Person record={r}/> },
    ...(application ? [
      { key: 'type', label: 'Type', render: (r) => <StatusBadge tone={r.type === 'Staff' ? 'info' : 'neutral'}>{r.type}</StatusBadge> },
      { key: 'level', label: 'Studies', render: (r) => <><b>{r.level}</b><small className="adm-cell-sub">{r.speciality}</small></> },
      { key: 'track', label: 'Interest / department' },
      { key: 'availability', label: 'Availability', secondary: true },
      { key: 'date', label: 'Submitted', secondary: true },
    ] : isStaff ? [
      { key: 'department', label: 'Department' }, { key: 'role', label: 'Internal role' }, { key: 'level', label: 'Level', secondary: true }, { key: 'availability', label: 'Availability' }, { key: 'projects', label: 'Projects', render: (r) => <span className="adm-project-count">{r.assignedProjects?.length || 0}</span> },
    ] : [
      { key: 'level', label: 'Level' }, { key: 'speciality', label: 'Speciality', secondary: true }, { key: 'pole', label: 'Primary pole' }, { key: 'joined', label: 'Entry date', secondary: true }, { key: 'last', label: 'Last activity', secondary: true },
    ]),
    { key: 'status', label: 'Status', render: (r) => <StatusBadge>{r.status}</StatusBadge> },
  ]
  const request = (title, patch, extra = {}) => setAction({ title, patch, ids: detail.id, ...extra })
  const submit = (values) => {
    if (action.newRecord) {
      const common = { ...values, initials: initialsOf(values.name), phone: 'Not provided', note: '', source: 'Manual demo entry', form: 'JOIN-3.2', consent: true, date: dateLabel(new Date()), joined: dateLabel(new Date()), cohort: '2026/27', last: 'Not yet active', availability: AVAILABILITY[0], experience: EXPERIENCE[0], events: [], assignedProjects: [], projects: 0, requested: values.department, role: values.role || 'Unassigned' }
      addRecord(collection, { ...common, status: application ? 'New' : 'Active', track: values.type === 'Staff' ? values.staffTrack : values.memberTrack })
      return
    }
    if (action.convert) {
      if (state.staff.some((r) => r.memberId === detail.id)) return 'This member already has a staff profile.'
      addRecord('staff', { ...detail, memberId: detail.id, department: values.department, requested: 'Assigned from membership', role: values.role, assignedProjects: [], projects: 0, status: 'Active' })
      update('members', detail.id, { note: `${detail.note || ''}\nStaff assignment: ${values.department}` }, 'Member promoted to staff', values.reason)
      return
    }
    const patch = action.patch || Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'reason'))
    if (action.project) {
      if (detail.assignedProjects.includes(values.project)) return 'This project is already assigned.'
      update(collection, action.ids, { assignedProjects: [...detail.assignedProjects, values.project] }, action.title, values.reason)
    } else update(collection, action.ids, patch, action.title, values.reason)
    if (Array.isArray(action.ids)) setSelected([])
  }
  const newAction = () => setAction({ title: application ? 'New application' : isStaff ? 'Add staff member' : 'New member', newRecord: true, reason: false, description: 'Use fictional information only. This record stays in the local demo.', fields: [
    { name: 'name', label: 'Full name', required: true }, { name: 'email', label: 'Demo email', type: 'email', required: true, placeholder: 'name@example.dz' }, { name: 'level', label: 'Study level', options: LEVELS }, { name: 'speciality', label: 'Department / speciality', required: true },
    ...(application ? [{ name: 'type', label: 'Application type', options: ['Member', 'Staff'] }, { name: 'memberTrack', label: 'Member interest (Member only)', options: POLES }, { name: 'staffTrack', label: 'Requested department (Staff only)', options: DEPARTMENTS }] : isStaff ? [{ name: 'department', label: 'Department', options: DEPARTMENTS }, { name: 'role', label: 'Internal role', required: true }] : [{ name: 'pole', label: 'Primary pole', options: ['Unassigned', ...POLES] }]),
  ] })
  return <div className="adm-page">
    <PageHeader eyebrow={eyebrow} title={title} description={description} actions={<Button onClick={newAction} icon={<Plus size={16}/>}>{application ? 'Add application' : isStaff ? 'Add staff member' : 'New member'}</Button>}/>
    {application ? <div className="adm-intake-banner"><div><UserCheck size={20}/><p><b>Autumn intake is open</b><span>Applications from the Infinity Join form · Campaign 2026/27</span></p></div><span className="adm-mono">{records.length} DEMO APPLICATIONS</span></div> : isStaff ? <div className="adm-department-map"><svg viewBox="0 0 1000 92" preserveAspectRatio="none" aria-hidden="true"><path d="M6 48 C170 4 242 88 391 47 S642 7 726 47 S882 88 994 43"/></svg>{DEPARTMENTS.map((name, index) => { const people = records.filter((r) => r.department === name && r.status === 'Active'); return <article key={name}><header><span>0{index + 1}</span><StatusBadge tone="success">Operational</StatusBadge></header><h2>{name}</h2><p>Department lead <b>{state.staff[index]?.name}</b></p><dl><div><dt>People</dt><dd>{people.length}</dd></div><div><dt>Capacity</dt><dd>08</dd></div><div><dt>Projects</dt><dd>{new Set(people.flatMap((p) => p.assignedProjects)).size}</dd></div><div><dt>Waiting</dt><dd>{state.applications.filter((a) => a.track === name && ['New', 'In review'].includes(a.status)).length}</dd></div></dl><div className="adm-dept-capacity"><span style={{ width: `${people.length / 8 * 100}%` }}/></div></article> })}</div> : <SummaryStrip items={[{ value: records.filter((r) => r.status === 'Active').length, label: 'Active members', meta: 'Current directory' }, { value: records.filter((r) => r.joined.includes('Sep 2026')).length, label: 'New this month' }, { value: records.filter((r) => r.pole === 'Unassigned').length, label: 'Without assigned pole' }, { value: records.filter((r) => r.status === 'Inactive').length, label: 'Inactive members' }]}/>}
    {isStaff && <div className="adm-operational-note"><Activity size={16}/><p>The <b>requested department</b> comes from Join. The <b>internal role</b> is assigned by administration after acceptance.</p></div>}
    <div className="adm-work-panel">
      {application && <Tabs items={APPLICATION_STATUSES} value={tab} counts={counts} onChange={(value) => { setTab(value); setSelected([]) }}/>}<RecordToolbar search={search} onSearch={setSearch} placeholder="Search name, speciality or reference…" filters={filters} onFilters={setFilters} definitions={fields} view={view} onView={application ? undefined : setView}/>
      <RecordTable records={visible} columns={columns} selected={selected} onSelect={setSelected} onOpen={open} cards={view === 'cards'} onBulk={() => setAction({ title: `Update ${selected.length} selected records`, ids: selected, fields: [{ name: 'status', label: 'New status', options: application ? ['In review', 'Interview', 'Declined', 'Archived'] : ['Active', 'On pause', 'Inactive', 'Archived'] }] })}/>
    </div>
    {detail && <Drawer title={application ? 'Candidate file' : isStaff ? 'Operational profile' : 'Member profile'} eyebrow={detail.id} onClose={() => setDetailId(null)} footer={<>
      {application ? <><Button onClick={() => request(detail.type === 'Staff' ? 'Accept into staff' : 'Accept as member', { status: 'Accepted' })} disabled={detail.status === 'Accepted'}>Accept {detail.type === 'Staff' ? 'into staff' : 'as member'}</Button><Button variant="secondary" onClick={() => request('Schedule interview', null, { fields: [{ name: 'interviewAt', label: 'Interview date and time', type: 'datetime-local', required: true }, { name: 'interviewLocation', label: 'Location / meeting room', required: true }], patch: undefined, schedule: true })}><CalendarDays size={15}/>Schedule interview</Button><div><button onClick={() => request('Request more information', null, { fields: [{ name: 'requestMessage', label: 'Message to the candidate (demo)', type: 'textarea', required: true }] })}>Request information</button>{detail.type === 'Staff' && <button onClick={() => request('Change requested department', null, { fields: [{ name: 'track', label: 'Department', options: DEPARTMENTS, value: detail.track }] })}>Move department</button>}<button className="is-danger" onClick={() => request('Decline application', { status: 'Declined' }, { danger: true })}>Decline</button><button onClick={() => request('Archive application', { status: 'Archived' }, { danger: true })}>Archive</button></div></> : <><Button onClick={() => request(isStaff ? 'Assign internal role' : 'Edit member profile', null, { fields: isStaff ? [{ name: 'role', label: 'Internal role', value: detail.role, required: true }] : [{ name: 'name', label: 'Name', value: detail.name, required: true }, { name: 'email', label: 'Email', type: 'email', value: detail.email, required: true }, { name: 'level', label: 'Level', options: LEVELS, value: detail.level }, { name: 'status', label: 'Status', options: ['Active', 'On pause', 'Inactive', 'Alumni'], value: detail.status }] })}>{isStaff ? 'Assign a role' : 'Edit profile'}</Button><Button variant="secondary" onClick={() => request(isStaff ? 'Move department' : 'Change primary pole', null, { fields: [{ name: isStaff ? 'department' : 'pole', label: isStaff ? 'Current department' : 'Primary pole', options: isStaff ? DEPARTMENTS : ['Unassigned', ...POLES], value: isStaff ? detail.department : detail.pole }] })}>{isStaff ? 'Move department' : 'Change pole'}</Button><div>{isStaff ? <><button onClick={() => request('Assign project', null, { project: true, fields: [{ name: 'project', label: 'Project', options: ['AIVEX operations', 'Autumn workshops', 'Infinity website', 'Integration day'] }] })}>Add to project</button><button onClick={() => request('Change availability', null, { fields: [{ name: 'availability', label: 'Availability', options: AVAILABILITY }] })}>Availability</button></> : <button onClick={() => request('Convert member to staff', null, { convert: true, fields: [{ name: 'department', label: 'Department', options: DEPARTMENTS }, { name: 'role', label: 'Assigned role', required: true }] })}>Convert to staff</button>}<button className="is-danger" onClick={() => request('Deactivate profile', { status: 'Inactive' }, { danger: true })}>Deactivate</button><button onClick={() => request('Archive profile', { status: 'Archived' }, { danger: true })}>Archive</button></div></>}
    </>}><div className="adm-candidate-identity"><Avatar initials={detail.initials}/><div><h3>{detail.name}</h3><p>{detail.type || detail.role || detail.pole}</p></div><StatusBadge>{detail.status}</StatusBadge></div>
      <section className="adm-detail-section"><h4><span>01</span>Identity & academic path</h4><Facts items={[["Email", detail.email], ['Phone', detail.phone], ['Study level', detail.level], ['Speciality', detail.speciality || 'Information systems']]}/></section>
      <section className="adm-detail-section"><h4><span>02</span>{application ? 'Join profile' : isStaff ? 'Operational assignment' : 'Membership'}</h4><Facts items={application ? [['Application type', detail.type], [detail.type === 'Staff' ? 'Requested department' : 'Interest track', detail.track], ['Experience', detail.experience], ['Availability', detail.availability], ['Submitted', detail.date], ['Source', detail.source], ['Form version', detail.form], ['Consent', 'Contact consent recorded'], ...(detail.interviewAt ? [['Interview', detail.interviewAt.replace('T', ' ')], ['Meeting location', detail.interviewLocation]] : []), ...(detail.requestMessage ? [['Information requested', detail.requestMessage]] : [])] : isStaff ? [['Requested at registration', detail.requested], ['Current department', detail.department], ['Current internal role', detail.role], ['Availability', detail.availability]] : [['Primary pole', detail.pole], ['Cohort', detail.cohort], ['Entry date', detail.joined], ['Initial interests / skills', detail.skills || detail.track]]}/></section>
      {!application && <section className="adm-detail-section"><h4><span>03</span>{isStaff ? 'Assigned projects' : 'Event participation'}</h4>{(isStaff ? detail.assignedProjects : detail.events)?.length ? <div className="adm-project-list">{(isStaff ? detail.assignedProjects : detail.events).map((item) => <p key={item}><span>{item}</span><StatusBadge tone="success">{isStaff ? 'Assigned' : 'Attended'}</StatusBadge></p>)}</div> : <p className="adm-muted">No {isStaff ? 'projects assigned' : 'participation recorded'} yet.</p>}{!isStaff && <p className="adm-muted">Internal documents: none attached to this demo member.</p>}</section>}
      <section className="adm-detail-section"><h4><span>04</span>Internal notes</h4><label className="sr-only" htmlFor="record-note">Administrative note</label><textarea id="record-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for your colleagues…"/><button className="adm-save-note" onClick={() => { if (!note.trim()) { addToast('Note is empty', 'Write a note before saving.'); return } update(collection, detail.id, { note }, 'Internal note saved') }}>Save note</button></section>
      <section className="adm-detail-section"><h4><span>05</span>History</h4><History items={detail.history}/></section>
    </Drawer>}
    {action && <ActionDialog key={action.title} action={action} onClose={() => setAction(null)} onSubmit={(values) => { if (action.schedule) { update(collection, action.ids, { status: 'Interview', ...values }, action.title, values.reason); return } return submit(values) }}/>} 
  </div>
}
