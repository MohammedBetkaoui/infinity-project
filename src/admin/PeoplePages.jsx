import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowRight, BriefcaseBusiness, CalendarDays, Check, ChevronDown, Clock3, Copy, ExternalLink, FileText, Link2, Mail, MoreHorizontal, Plus, RefreshCw, Send, UserCheck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { describeStaffWorkLink } from '../../shared/membership/staff-work-links.js'
import { FlipGrid, useGrow } from './adminMotion'
import { useAdmin } from './AdminStore'
import { AVAILABILITY, APPLICATION_STATUSES, DEPARTMENTS, EXPERIENCE, LEVELS, POLES, dateLabel, filterRecords, initialsOf } from './adminModel'
import { Avatar, BulkBar, Button, Drawer, EmptyState, PageHeader, Pagination, StatusBadge, Tabs } from './AdminUI'
import { ActionDialog, Facts, History, RecordTable, RecordToolbar, SummaryStrip } from './AdminRecords'

const SUBMISSION_TIME_ZONE = 'Africa/Algiers'
const submissionDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: SUBMISSION_TIME_ZONE })
const submissionWeekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: SUBMISSION_TIME_ZONE })
const submissionTime = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: SUBMISSION_TIME_ZONE })

const candidateDateParts = (value) => {
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) return null
  return { parsed, date: submissionDate.format(parsed), time: submissionTime.format(parsed) }
}

const candidateDateLabel = (value) => {
  const parts = candidateDateParts(value)
  return parts ? `${parts.date} · ${parts.time}` : '—'
}

function CandidateDate({ value }) {
  const parts = candidateDateParts(value)
  if (!parts) return <span>—</span>
  return <time dateTime={parts.parsed.toISOString()} title={parts.parsed.toISOString()}>{parts.date} · {parts.time}</time>
}

export function ApplicationSubmittedAt({ value, compact = false }) {
  const parts = candidateDateParts(value)
  if (!parts) return <span className="adm-submitted-at is-missing">Not recorded</span>
  return <time className={`adm-submitted-at ${compact ? 'is-compact' : ''}`} dateTime={parts.parsed.toISOString()}>
    <b>{compact ? parts.date : `${submissionWeekday.format(parts.parsed)}, ${parts.date}`}</b>
    <small><span>{parts.time}</span><em>Algiers time</em></small>
  </time>
}

const titles = { applications: ['People · Join intake', 'Join applications', 'Every new connection starts here. Review, meet and welcome the next Infinity members.'], members: ['Community · Member directory', 'Members', 'The people who make Infinity. Follow their journey, participation and interests.'], staff: ['Operations · Team structure', 'Staff operations', 'Three departments. One shared direction. Keep your team coordinated.'] }
const unique = (items, key) => [...new Set(items.map((item) => item[key]))].filter(Boolean)
const Person = ({ record }) => <div className="adm-person-cell"><Avatar initials={record.initials} small/><span><b>{record.name}</b><small>{record.email || record.id}</small></span>{record.status === 'New' && <i title="New application"/>}</div>
const activityOf = (record, isStaff) => Number(record.activityCount ?? (isStaff ? record.assignedProjects?.length : record.events?.length) ?? 0) || 0

export function PeopleCardGrid({ records, isStaff, selected, onSelect, onBulk, onOpen, pagination, onPageChange, refreshing = false }) {
  const boardRef = useRef(null)
  const [page, setPage] = useState(1)
  const [order, setOrder] = useState('name')
  const remote = Boolean(pagination)
  const sorted = remote ? records : [...records].sort((a, b) => String(order === 'structure' ? (isStaff ? a.department : a.pole) : a[order] || '').localeCompare(String(order === 'structure' ? (isStaff ? b.department : b.pole) : b[order] || ''), 'en', { numeric: true }))
  const pageSize = remote ? pagination.limit : 6
  const count = remote ? pagination.total : records.length
  const current = remote ? pagination.page : Math.min(page, Math.max(1, Math.ceil(sorted.length / pageSize)))
  const visible = remote ? sorted : sorted.slice((current - 1) * pageSize, current * pageSize)
  const selectAll = visible.length > 0 && visible.every((record) => selected.includes(record.id))
  const toggle = (id) => onSelect(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id])
  const togglePage = () => onSelect(selectAll ? selected.filter((id) => !visible.some((record) => record.id === id)) : [...new Set([...selected, ...visible.map((record) => record.id)])])
  // Bars compare each profile with the most active one on screen; the count stays visible.
  const maxActivity = Math.max(1, ...visible.map((record) => activityOf(record, isStaff)))
  // FlipGrid cascades the cards in and lets them glide when filtering changes
  // the set; the activity meters fill as the cards arrive.
  useGrow(boardRef, '.adm-person-card__meter i span', visible.length > 0)

  return <section ref={boardRef} className={`adm-people-board ${isStaff ? 'is-staff' : 'is-members'} ${refreshing ? 'is-refreshing' : ''}`} aria-label={isStaff ? 'Staff cards' : 'Member cards'} aria-busy={refreshing || undefined}>
    <BulkBar count={selected.length} onClear={() => onSelect([])} onStatus={onBulk}/>
    <header className="adm-people-board__head"><div><span>{isStaff ? 'Operational roster' : 'Community directory'}</span><b>{count} {isStaff ? 'staff profiles' : 'member profiles'}</b></div><div><label className="adm-card-select-all"><input type="checkbox" checked={selectAll} onChange={togglePage}/><span>Select this page</span></label>{!remote && <label className="adm-people-board__order"><span>Order by</span><select value={order} onChange={(event) => { setOrder(event.target.value); setPage(1) }}><option value="name">Name</option><option value="status">Status</option><option value="structure">{isStaff ? 'Department' : 'Primary pole'}</option></select></label>}</div></header>
    {visible.length ? <FlipGrid className="adm-people-card-grid" flipKey={visible.map((record) => record.id).join('|')}>{visible.map((record) => {
      const activity = activityOf(record, isStaff)
      return <article key={record.id} data-flip-id={record.id} className={`adm-person-card ${selected.includes(record.id) ? 'is-selected' : ''}`}>
        <div className="adm-person-card__top"><StatusBadge>{record.status}</StatusBadge><label className="adm-person-card__select"><input type="checkbox" checked={selected.includes(record.id)} onChange={() => toggle(record.id)}/><span className="sr-only">Select {record.name}</span></label></div>
        <header className="adm-person-card__identity"><Avatar initials={record.initials}/><h3>{record.name}</h3><p>{isStaff ? record.role : record.pole}</p><small>{isStaff ? record.department : `${record.level} · ${record.speciality}`}</small></header>
        <dl className="adm-person-card__stats"><div><dt>{isStaff ? 'Projects' : 'Events'}</dt><dd>{activity}</dd></div><div><dt>{isStaff ? 'Study level' : 'Cohort'}</dt><dd>{isStaff ? record.level : record.cohort}</dd></div></dl>
        <div className="adm-person-card__meter"><p><span>{isStaff ? 'Project load' : 'Participation'}</span><b>{activity} {isStaff ? (activity === 1 ? 'project' : 'projects') : (activity === 1 ? 'event' : 'events')}</b></p><i role="img" aria-label={`${activity} ${isStaff ? 'projects' : 'events'}, compared with the most active profile shown (${maxActivity})`}><span style={{ width: `${Math.round(activity / maxActivity * 100)}%` }}/></i></div>
        <footer>{record.email ? <a className="adm-button adm-button--secondary" href={`mailto:${record.email}`}><Mail size={15} aria-hidden="true"/>Email<span className="sr-only"> {record.name}</span></a> : <span className="adm-button adm-button--secondary is-disabled" aria-disabled="true"><Mail size={15} aria-hidden="true"/>Email</span>}<button className="adm-button adm-button--primary" onClick={() => onOpen(record)} aria-label={`${isStaff ? 'Open operational profile' : 'Open member profile'}: ${record.name}`}>Profile<ArrowRight size={15} aria-hidden="true"/></button></footer>
      </article>
    })}</FlipGrid> : <EmptyState title={isStaff ? 'No staff profiles match this view' : 'No members match this view'} copy="Adjust the search or remove one of the active filters."/>}
    {count > 0 && <Pagination current={current} count={count} pageSize={pageSize} onChange={onPageChange || setPage}/>}
  </section>
}

const CANDIDATE_STAGES = [
  { label: 'Received', copy: 'Join form recorded' },
  { label: 'Review', copy: 'Profile assessment' },
  { label: 'Interview', copy: 'Conversation planned' },
  { label: 'Decision', copy: 'Final outcome' },
]

export function CandidateReviewHeader({ detail, titleId }) {
  return <div className="adm-candidate-header">
    <Avatar initials={detail.initials}/>
    <div className="adm-candidate-header__identity">
      <span>Application review</span>
      <h2 id={titleId}>{detail.name}</h2>
      <p>{detail.type} · {detail.track || 'Join application'}</p>
      <code>{detail.ref || detail.id}</code>
    </div>
    <StatusBadge>{detail.status}</StatusBadge>
  </div>
}

function CandidateProgress({ status }) {
  const current = { New: 0, 'In review': 1, Interview: 2, Accepted: 3, Declined: 3, Archived: 3 }[status] ?? 0
  const terminal = ['Accepted', 'Declined', 'Archived'].includes(status)
  return <section className="adm-candidate-progress" aria-labelledby="candidate-progress-title">
    <header><div><span>Application route</span><h3 id="candidate-progress-title">Review progress</h3></div></header>
    <ol>{CANDIDATE_STAGES.map((stage, index) => {
      const complete = index < current || (index === current && terminal && status === 'Accepted')
      const active = index === current
      const negative = active && ['Declined', 'Archived'].includes(status)
      return <li key={stage.label} className={`${complete ? 'is-complete' : ''} ${active ? 'is-current' : ''} ${negative ? 'is-negative' : ''}`} aria-current={active ? 'step' : undefined}>
        <i aria-hidden="true">{complete ? <Check size={12}/> : String(index + 1).padStart(2, '0')}</i>
        <div><b>{index === 3 && terminal ? status : stage.label}</b><small>{index === 3 && terminal ? 'Decision recorded' : stage.copy}</small></div>
      </li>
    })}</ol>
  </section>
}

function CandidateSection({ title, copy, className = '', children }) {
  return <section className={`adm-candidate-section ${className}`.trim()}><header><div><h3>{title}</h3>{copy && <p>{copy}</p>}</div></header>{children}</section>
}

const CONFIRMATION_LABELS = Object.freeze({
  not_invited: 'Not invited', invited: 'Waiting for candidate', submitted: 'Ready for review',
  revision_requested: 'Revision requested', confirmed: 'Confirmed', expired: 'Invitation expired', revoked: 'Invitation revoked',
})

const CONFIRMATION_TONES = Object.freeze({
  submitted: 'success', confirmed: 'success', revision_requested: 'warning', expired: 'warning', revoked: 'declined',
})

const LINK_ACCESS_LABELS = Object.freeze({ active: 'Active', blocked: 'Blocked', legacy: 'Legacy', none: 'Not created' })

// Work links belong to one motivation version. Only links that parse as http(s)
// become clickable; labels come from the hostname, never from fetched metadata.
function MotivationWorkLinks({ links }) {
  const items = (Array.isArray(links) ? links : []).map((link) => ({ link, display: describeStaffWorkLink(link) }))
  return <div className="adm-motivation-links">
    <span className="adm-motivation-label">Work / portfolio</span>
    {items.length ? <ul>{items.map(({ link, display }, index) => <li key={`${index}:${link}`}>
      {display
        ? <a href={display.href} target="_blank" rel="noopener noreferrer" title={display.href}><b>{display.label}</b><small>{display.detail}</small><ExternalLink size={13} aria-hidden="true"/><span className="sr-only"> (opens in a new tab)</span></a>
        : <span className="adm-motivation-links__unsafe">{link}</span>}
    </li>)}</ul> : <p>No links shared with this version.</p>}
  </div>
}

function MotivationVersion({ submission, latest = false }) {
  return <article className={latest ? 'is-latest' : undefined}>
    <header><b>Version {submission.version}{latest ? ' · Latest' : ''}</b><time dateTime={submission.submittedAt}>{candidateDateLabel(submission.submittedAt)}</time></header>
    <span className="adm-motivation-label">Motivation</span>
    <p>{submission.motivation}</p>
    <MotivationWorkLinks links={submission.workLinks}/>
  </article>
}

function StaffConfirmationPanel({ confirmation, onRevealLink }) {
  const status = confirmation?.statusKey || 'not_invited'
  const [revealed, setRevealed] = useState(null)
  const [linkBusy, setLinkBusy] = useState('')
  const [linkError, setLinkError] = useState('')
  const linkAccess = confirmation?.linkAccess || 'none'
  const submissions = [...(confirmation?.submissions || [])].sort((left, right) => Number(right.version || 0) - Number(left.version || 0))
  const [latestSubmission, ...previousSubmissions] = submissions
  const handlePrivateLink = async (kind) => {
    if (!onRevealLink || linkBusy) return
    setLinkBusy(kind)
    setLinkError('')
    const result = revealed || await onRevealLink()
    if (!result?.ok) {
      setLinkError(result?.message || 'Unable to reveal link.')
      setLinkBusy('')
      return
    }
    setRevealed(result)
    try {
      if (kind === 'copy') await navigator.clipboard.writeText(result.privateLink)
      if (kind === 'open') window.open(result.privateLink, '_blank', 'noopener,noreferrer')
      setLinkBusy(`${kind}-done`)
      window.setTimeout(() => setLinkBusy(''), 1500)
    } catch {
      setLinkBusy('')
      setLinkError('Unable to copy or open the private link.')
    }
  }
  return <div className="adm-staff-confirmation-panel">
    <div className="adm-staff-confirmation-panel__state">
      <span><FileText size={17} aria-hidden="true"/></span>
      <div><small>Confirmation status</small><b>Staff confirmation</b></div>
      <StatusBadge tone={CONFIRMATION_TONES[status] || 'neutral'}>{CONFIRMATION_LABELS[status] || status}</StatusBadge>
    </div>
    {confirmation ? <>
      <div className="adm-confirmation-private-link">
        <header><div><small>Private invitation</small><b>Candidate-only access</b></div><span className={`adm-link-access-status is-${linkAccess}`}><i aria-hidden="true"/>{LINK_ACCESS_LABELS[linkAccess] || linkAccess}</span></header>
        {confirmation.linkReconstructable ? <>
          <code aria-label="Masked private confirmation link">www.infinty-bba.com/join/staff-confirmation#token=••••••••</code>
          <div><Button variant="secondary" aria-label="Copy private confirmation link" icon={linkBusy === 'copy-done' ? <Check size={14}/> : <Copy size={14}/>} onClick={() => handlePrivateLink('copy')} disabled={Boolean(linkBusy)}>{linkBusy === 'copy' ? 'Copying…' : linkBusy === 'copy-done' ? 'Copied' : 'Copy link'}</Button><Button variant="secondary" aria-label="Open private confirmation link" icon={<ExternalLink size={14}/>} onClick={() => handlePrivateLink('open')} disabled={Boolean(linkBusy)}>{linkBusy === 'open' ? 'Opening…' : 'Open'}</Button></div>
        </> : <p>{linkAccess === 'legacy' ? 'Link unavailable under the legacy credential model. Create a stable link explicitly to reveal it.' : 'No private link has been created for this candidate.'}</p>}
        {linkError && <p className="adm-form-error" role="alert">{linkError}</p>}
      </div>
      <dl className="adm-confirmation-facts">
        <div><dt>Invited</dt><dd><CandidateDate value={confirmation.invitedAt}/></dd></div>
        <div><dt>Deadline</dt><dd><CandidateDate value={confirmation.expiresAt}/></dd></div>
        <div><dt>Last submitted</dt><dd><CandidateDate value={confirmation.submittedAt}/></dd></div>
        <div><dt>Versions</dt><dd>{submissions.length}</dd></div>
      </dl>
      {confirmation.revisionMessage && <div className="adm-confirmation-revision"><span>Revision message</span><p>{confirmation.revisionMessage}</p></div>}
      {latestSubmission && <div className="adm-motivation-history">
        <header><span>Latest motivation</span><small>Version {latestSubmission.version}</small></header>
        <MotivationVersion submission={latestSubmission} latest/>
        {previousSubmissions.length > 0 && <details className="adm-motivation-previous"><summary>Previous versions <span>{previousSubmissions.length}</span><ChevronDown size={14} aria-hidden="true"/></summary><div>{previousSubmissions.map((submission) => <MotivationVersion key={submission.id} submission={submission}/>)}</div></details>}
      </div>}
    </> : <p className="adm-confirmation-empty">This Staff candidate has not received a private confirmation invitation yet.</p>}
  </div>
}

export function CandidateDossier({ detail, note = '', setNote, onSave, noteSaving = false, onRevealStaffLink }) {
  return <div className="adm-candidate-dossier">
    <section className="adm-candidate-overview" aria-labelledby="candidate-record-title">
      <header><div><span>Candidate details</span><h3 id="candidate-record-title">Identity and academic record</h3></div><small>Supplied with the Join form</small></header>
      <dl className="adm-candidate-quickfacts"><div><dt>Submitted</dt><dd><CandidateDate value={detail.submittedAt || detail.date}/></dd></div><div><dt>Source</dt><dd>{detail.source}</dd></div><div><dt>Consent</dt><dd><Check size={13} aria-hidden="true"/>{detail.consent === false ? 'Not recorded' : 'Recorded'}</dd></div></dl>
      <dl className="adm-candidate-record"><div><dt>Email</dt><dd>{detail.email}</dd></div><div><dt>Phone</dt><dd>{detail.phone || 'Not provided'}</dd></div><div><dt>Study level</dt><dd>{detail.level}</dd></div><div><dt>Faculty</dt><dd>{detail.faculty || '—'}</dd></div><div><dt>Academic department</dt><dd>{detail.speciality || 'Not provided'}</dd></div></dl>
    </section>

    <CandidateProgress status={detail.status}/>

    <div className="adm-candidate-grid">
      <div className="adm-candidate-column is-review">
        {detail.type === 'Staff' && <CandidateSection className="is-confirmation" title="Staff confirmation" copy="Private invitation, motivation history and final Staff decision.">
          <StaffConfirmationPanel confirmation={detail.staffConfirmation} onRevealLink={onRevealStaffLink}/>
        </CandidateSection>}
        <CandidateSection className="is-history" title="Application history" copy="Decisions and follow-ups recorded by the administration."><History items={detail.history} formatDate={candidateDateLabel}/></CandidateSection>
      </div>
      <div className="adm-candidate-column is-profile">
        <CandidateSection className="is-join-profile" title="Join profile" copy={detail.type === 'Staff' ? 'The requested department remains separate from the role assigned after acceptance.' : 'Declared interest, experience and availability.'}>
          <div className="adm-candidate-track"><i><BriefcaseBusiness size={17} aria-hidden="true"/></i><span>{detail.type === 'Staff' ? 'Requested staff department' : 'Primary interest'}</span><strong>{detail.track}</strong></div>
          <Facts items={[["Experience", detail.experience], ['Availability', detail.availability]]}/>
          {detail.interviewAt && <div className="adm-candidate-callout is-interview"><CalendarDays size={17}/><div><span>Interview scheduled</span><b><CandidateDate value={detail.interviewAt}/> · {detail.interviewLocation}</b></div></div>}
        </CandidateSection>
        <CandidateSection className="is-metadata" title="Intake metadata" copy="Administrative traceability for this Join application.">
          <Facts items={[["Application type", detail.type], ['Submitted', <CandidateDate value={detail.submittedAt || detail.date}/>], ['Source', detail.source], ['Form version', detail.form], ['Contact consent', detail.consent === false ? 'Not recorded' : 'Recorded']]}/>
        </CandidateSection>
        {onSave && setNote && <CandidateSection className="is-notes" title="Internal notes" copy="Visible to Infinity administrators only.">
          <label className="sr-only" htmlFor="candidate-note">Administrative note</label><textarea id="candidate-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add review context for your colleagues…"/><button className="adm-save-note" onClick={onSave} disabled={noteSaving}>{noteSaving ? 'Saving note…' : 'Save internal note'}</button>
        </CandidateSection>}
      </div>
    </div>
  </div>
}

function CandidateActionMenu({ label, icon, className = '', children }) {
  return <details className={`adm-candidate-actionmenu ${className}`.trim()}><summary>{icon}<span>{label}</span><ChevronDown size={14} aria-hidden="true"/></summary><div className="adm-candidate-actionmenu__popover" role="group" aria-label={`${label} actions`}>{children}</div></details>
}

export function CandidateActionBar({ detail, request }) {
  const closed = ['Accepted', 'Declined', 'Archived'].includes(detail.status)
  const can = (action) => !detail.allowedActions || detail.allowedActions.includes(action)
  const confirmation = detail.staffConfirmation
  const confirmationStatus = confirmation?.statusKey || 'not_invited'
  const confirmationVersion = confirmation?.updatedAt
  const linkAccess = confirmation?.linkAccess || 'none'
  const fromMenu = (event, ...args) => {
    event.currentTarget.closest('details')?.removeAttribute('open')
    request(...args)
  }
  const startReview = (menu = false) => menu
    ? <button onClick={(event) => fromMenu(event, 'Move application to review', { status: 'In review' }, { action: 'start_review' })} disabled={!can('start_review') || detail.status === 'In review' || detail.status === 'Accepted' || detail.status === 'Archived'}>Move to review</button>
    : <Button onClick={() => request('Move application to review', { status: 'In review' }, { action: 'start_review' })} disabled={!can('start_review') || detail.status === 'In review' || detail.status === 'Accepted' || detail.status === 'Archived'} icon={<ArrowRight size={15}/>}>Move to review</Button>
  const scheduleInterview = (menu = false) => menu
    ? <button onClick={(event) => fromMenu(event, 'Schedule interview', null, { action: 'schedule_interview', fields: [{ name: 'interviewAt', label: 'Interview date and time', type: 'datetime-local', required: true }, { name: 'interviewLocation', label: 'Location / meeting room', required: true }], patch: undefined, schedule: true })} disabled={!can('schedule_interview') || closed}><CalendarDays size={14}/>Schedule interview</button>
    : <Button variant="secondary" onClick={() => request('Schedule interview', null, { action: 'schedule_interview', fields: [{ name: 'interviewAt', label: 'Interview date and time', type: 'datetime-local', required: true }, { name: 'interviewLocation', label: 'Location / meeting room', required: true }], patch: undefined, schedule: true })} disabled={!can('schedule_interview') || closed} icon={<CalendarDays size={15}/>}>Schedule interview</Button>
  const inviteConfirmation = (menu = false) => menu
    ? <button onClick={(event) => fromMenu(event, 'Invite to Staff confirmation', null, { action: 'invite_staff_confirmation' })} disabled={!can('invite_staff_confirmation')}><Send size={14}/>Invite to confirmation</button>
    : <Button onClick={() => request('Invite to Staff confirmation', null, { action: 'invite_staff_confirmation' })} disabled={!can('invite_staff_confirmation')} icon={<Send size={15}/>}>Invite to confirmation</Button>
  const confirmMembership = (menu = false) => menu
    ? <button onClick={(event) => fromMenu(event, 'Confirm Staff membership', null, { action: 'confirm_staff_membership' })} disabled={!can('confirm_staff_membership')}><Check size={14}/>Confirm Staff membership</button>
    : <Button onClick={() => request('Confirm Staff membership', null, { action: 'confirm_staff_membership' })} disabled={!can('confirm_staff_membership')} icon={<Check size={15}/>}>Confirm Staff membership</Button>
  const acceptMember = (menu = false) => menu
    ? <button onClick={(event) => fromMenu(event, 'Accept as member', { status: 'Accepted' }, { action: 'accept_member' })} disabled={!can('accept_member') || detail.status === 'Accepted' || detail.status === 'Archived'}><Check size={14}/>Accept as member</button>
    : <Button onClick={() => request('Accept as member', { status: 'Accepted' }, { action: 'accept_member' })} disabled={!can('accept_member') || detail.status === 'Accepted' || detail.status === 'Archived'} icon={<Check size={15}/>}>Accept as member</Button>

  let primaryKey = ''
  if (!closed && detail.status === 'New' && can('start_review')) primaryKey = 'start_review'
  else if (!closed && detail.type === 'Staff' && confirmationStatus === 'not_invited' && can('invite_staff_confirmation')) primaryKey = 'invite_staff_confirmation'
  else if (!closed && detail.type === 'Staff' && confirmationStatus === 'submitted' && can('confirm_staff_membership')) primaryKey = 'confirm_staff_membership'
  else if (!closed && detail.type !== 'Staff' && can('accept_member')) primaryKey = 'accept_member'
  else if (!closed && can('schedule_interview')) primaryKey = 'schedule_interview'

  const renderPrimary = () => primaryKey === 'start_review' ? startReview()
    : primaryKey === 'invite_staff_confirmation' ? inviteConfirmation()
      : primaryKey === 'confirm_staff_membership' ? confirmMembership()
        : primaryKey === 'accept_member' ? acceptMember()
          : primaryKey === 'schedule_interview' ? scheduleInterview()
            : confirmationStatus === 'confirmed' ? <span className="adm-confirmation-final"><Check size={14}/>Staff membership confirmed</span>
              : null

  const workflowActions = () => <>
    {primaryKey !== 'start_review' && !closed && detail.status !== 'In review' && startReview(true)}
    {detail.type !== 'Staff' && primaryKey !== 'accept_member' && acceptMember(true)}
    {detail.type === 'Staff' && <button onClick={(event) => fromMenu(event, 'Change requested department', null, { action: 'change_staff_department', fields: [{ name: 'track', label: 'Department', options: DEPARTMENTS, value: detail.track }] })} disabled={!can('change_staff_department') || detail.status === 'Archived'}>Change department</button>}
    {detail.type === 'Staff' && confirmationStatus === 'not_invited' && primaryKey !== 'invite_staff_confirmation' && inviteConfirmation(true)}
    {detail.type === 'Staff' && confirmationStatus === 'submitted' && primaryKey !== 'confirm_staff_membership' && confirmMembership(true)}
    {detail.type === 'Staff' && confirmationStatus === 'submitted' && <button onClick={(event) => fromMenu(event, 'Request a motivation revision', null, { action: 'request_staff_confirmation_revision', fields: [{ name: 'revisionMessage', label: 'Message to the candidate', type: 'textarea', required: true, maxLength: 1000, placeholder: 'Explain what should be clearer in the new version…' }], confirmationVersion, description: 'The candidate can submit the revision using the existing private link. No new URL will be created.', submit: 'Request revision' })} disabled={!can('request_staff_confirmation_revision')}><Clock3 size={14}/>Request revision</button>}
  </>
  const hasWorkflow = !closed && (
    (primaryKey !== 'start_review' && detail.status !== 'In review')
    || (detail.type !== 'Staff' && primaryKey !== 'accept_member')
    || detail.type === 'Staff'
  )

  const privateLinkActions = () => <>
    {!confirmation.linkReconstructable && <button onClick={(event) => fromMenu(event, 'Create stable private link', null, { action: 'create_stable_staff_confirmation_link', confirmationVersion, description: 'The legacy hash-only link cannot be displayed. Creating a stable link permanently invalidates the legacy credential.', submit: 'Create stable link' })} disabled={!can('create_stable_staff_confirmation_link')}><Link2 size={14}/>Create stable link</button>}
    {confirmation.linkReconstructable && linkAccess !== 'blocked' && <button onClick={(event) => fromMenu(event, 'Block private link?', null, { action: 'block_staff_confirmation_link', confirmationVersion, description: `Candidate: ${detail.name}\nReference: ${detail.ref}\n\nThe candidate will no longer be able to use this link until you unblock it. The URL itself will not change.`, submit: 'Block link' })} disabled={!can('block_staff_confirmation_link')}>Block link</button>}
    {confirmation.linkReconstructable && linkAccess === 'blocked' && <button onClick={(event) => fromMenu(event, 'Unblock private link?', null, { action: 'unblock_staff_confirmation_link', confirmationVersion, description: 'The exact same private URL will become usable again.', submit: 'Unblock link' })} disabled={!can('unblock_staff_confirmation_link')}>Unblock link</button>}
    {confirmationStatus === 'expired' && <button onClick={(event) => fromMenu(event, 'Extend Staff confirmation deadline', null, { action: 'extend_staff_confirmation_deadline', confirmationVersion, description: 'The deadline will be extended by seven days. The private URL will not change.', submit: 'Extend deadline' })} disabled={!can('extend_staff_confirmation_deadline')}><Clock3 size={14}/>Extend deadline</button>}
    {confirmation.linkReconstructable && <button className="is-warning" onClick={(event) => fromMenu(event, 'Regenerate private link?', null, { action: 'regenerate_staff_confirmation_link', confirmationVersion, danger: true, description: 'The previous link will permanently stop working. Any previous email, CSV, or copied message containing the old URL will become invalid.', submit: 'Generate new link' })} disabled={!can('regenerate_staff_confirmation_link')}><RefreshCw size={14}/>Regenerate link</button>}
  </>
  const closeActions = () => <>
    <button className="is-danger" onClick={(event) => fromMenu(event, 'Decline application', { status: 'Declined' }, { action: 'decline', danger: true })} disabled={!can('decline') || detail.status === 'Declined' || detail.status === 'Archived'}>Decline application</button>
    <button onClick={(event) => fromMenu(event, 'Archive application', { status: 'Archived' }, { action: 'archive', danger: true })} disabled={!can('archive') || detail.status === 'Archived'}>Archive application</button>
  </>

  return <div className="adm-candidate-actionbar">
    <header><span>Decision workspace</span><b>Choose the next administrative step</b></header>
    <div className="adm-candidate-actionbar__desktop">
      <div className="adm-candidate-actionbar__primary">{renderPrimary()}{primaryKey !== 'schedule_interview' && !closed && scheduleInterview()}</div>
      <div className="adm-candidate-actionbar__menus">
        {hasWorkflow && <CandidateActionMenu label="Workflow" icon={<BriefcaseBusiness size={14} aria-hidden="true"/>}>{workflowActions()}</CandidateActionMenu>}
        {detail.type === 'Staff' && confirmation && !closed && <CandidateActionMenu label="Private link" icon={<Link2 size={14} aria-hidden="true"/>}>{privateLinkActions()}</CandidateActionMenu>}
        <CandidateActionMenu label="More" icon={<MoreHorizontal size={15} aria-hidden="true"/>}><div className="adm-actionmenu-group"><span>Close application</span>{closeActions()}</div></CandidateActionMenu>
      </div>
    </div>
    <div className="adm-candidate-actionbar__mobile">
      {renderPrimary()}
      <CandidateActionMenu label="More" icon={<MoreHorizontal size={16} aria-hidden="true"/>} className="is-mobile-more">
        {primaryKey !== 'schedule_interview' && !closed && <div className="adm-actionmenu-group"><span>Next steps</span>{scheduleInterview(true)}</div>}
        {hasWorkflow && <div className="adm-actionmenu-group"><span>Workflow</span>{workflowActions()}</div>}
        {detail.type === 'Staff' && confirmation && !closed && <div className="adm-actionmenu-group"><span>Private link</span>{privateLinkActions()}</div>}
        <div className="adm-actionmenu-group"><span>Close application</span>{closeActions()}</div>
      </CandidateActionMenu>
    </div>
  </div>
}

export default function PeoplePage({ collection }) {
  const { state, update, addRecord, addToast } = useAdmin()
  const records = state[collection]
  const application = collection === 'applications'
  const isStaff = collection === 'staff'
  const [params] = useSearchParams()
  const [tab, setTab] = useState(params.get('stage') || 'New')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({})
  const [view, setView] = useState(application ? 'table' : 'cards')
  const [mobileCardsOnly, setMobileCardsOnly] = useState(false)
  const [selected, setSelected] = useState([])
  const [detailId, setDetailId] = useState(params.get('record'))
  const [action, setAction] = useState(null)
  const [note, setNote] = useState('')
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)')
    const syncView = () => setMobileCardsOnly(query.matches)
    syncView()
    query.addEventListener('change', syncView)
    return () => query.removeEventListener('change', syncView)
  }, [])
  const activeView = !application && mobileCardsOnly ? 'cards' : view
  const detail = records.find((record) => record.id === detailId)
  const [eyebrow, title, description] = titles[collection]
  const open = (record) => { setDetailId(record.id); setNote(record.note || '') }
  const fields = [
    { key: 'level', label: 'Study level', options: LEVELS },
    ...(application ? [{ key: 'type', label: 'Application type', options: ['Member', 'Staff'] }, { key: 'track', label: 'Interest / requested department', options: [...POLES, ...DEPARTMENTS] }, { key: 'experience', label: 'Experience', options: EXPERIENCE }, { key: 'availability', label: 'Availability', options: AVAILABILITY }, { key: 'date', label: 'Submission date', options: unique(records, 'date') }] : isStaff ? [{ key: 'department', label: 'Current department', options: DEPARTMENTS }, { key: 'availability', label: 'Availability', options: unique(records, 'availability') }] : [{ key: 'pole', label: 'Primary pole', options: ['Unassigned', ...POLES] }, { key: 'cohort', label: 'Cohort', options: unique(records, 'cohort') }, { key: 'joined', label: 'Entry date', options: unique(records, 'joined') }]),
    { key: 'speciality', label: 'Speciality', options: unique(records, 'speciality') },
    ...(!application ? [{ key: 'status', label: 'Status', options: isStaff ? ['Active', 'On pause', 'Inactive', 'Archived'] : ['Active', 'On pause', 'Inactive', 'Alumni', 'Archived'] }] : []),
  ]
  const visible = filterRecords(records, search.trim(), { ...filters, ...(application ? { status: tab } : {}) })
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
      { key: 'level', label: 'Academic profile', render: (r) => <span className="adm-member-academic"><b>{r.level}</b><small>{r.speciality}</small></span> }, { key: 'pole', label: 'Primary pole' }, { key: 'cohort', label: 'Cohort', secondary: true }, { key: 'joined', label: 'Entry date' }, { key: 'last', label: 'Last activity', secondary: true },
    ]),
    { key: 'status', label: 'Status', render: (r) => <StatusBadge>{r.status}</StatusBadge> },
  ]
  const quickFields = application ? [] : isStaff ? [
    { key: 'department', label: 'Current department', shortLabel: 'Department', allLabel: 'All departments', options: DEPARTMENTS },
    { key: 'status', label: 'Status', allLabel: 'All statuses', options: ['Active', 'On pause', 'Inactive', 'Archived'] },
    { key: 'availability', label: 'Availability', allLabel: 'Any availability', options: unique(records, 'availability') },
  ] : [
    { key: 'pole', label: 'Primary pole', shortLabel: 'Pole', allLabel: 'All poles', options: ['Unassigned', ...POLES] },
    { key: 'status', label: 'Status', allLabel: 'All statuses', options: ['Active', 'On pause', 'Inactive', 'Alumni', 'Archived'] },
    { key: 'level', label: 'Study level', shortLabel: 'Level', allLabel: 'All levels', options: LEVELS },
  ]
  const openBulkAction = () => setAction({ title: `Update ${selected.length} selected records`, ids: selected, fields: [{ name: 'status', label: 'New status', options: application ? ['In review', 'Interview', 'Declined', 'Archived'] : ['Active', 'On pause', 'Inactive', 'Archived'] }] })
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
  return <div className={`adm-page adm-people-page adm-${collection}-page`}>
    <PageHeader eyebrow={eyebrow} title={title} description={description} actions={<Button onClick={newAction} icon={<Plus size={16}/>}>{application ? 'Add application' : isStaff ? 'Add staff member' : 'New member'}</Button>}/>
    {application ? <div className="adm-intake-banner"><div><UserCheck size={20}/><p><b>Autumn intake is open</b><span>Applications from the Infinity Join form · Campaign 2026/27</span></p></div><span className="adm-mono">{records.length} DEMO APPLICATIONS</span></div> : isStaff ? <div className="adm-department-map"><svg viewBox="0 0 1000 92" preserveAspectRatio="none" aria-hidden="true"><path d="M6 48 C170 4 242 88 391 47 S642 7 726 47 S882 88 994 43"/></svg>{DEPARTMENTS.map((name, index) => { const people = records.filter((r) => r.department === name && r.status === 'Active'); return <article key={name}><header><span>0{index + 1}</span><StatusBadge tone="success">Operational</StatusBadge></header><h2>{name}</h2><p>Department lead <b>{state.staff[index]?.name}</b></p><dl><div><dt>People</dt><dd>{people.length}</dd></div><div><dt>Capacity</dt><dd>08</dd></div><div><dt>Projects</dt><dd>{new Set(people.flatMap((p) => p.assignedProjects)).size}</dd></div><div><dt>Waiting</dt><dd>{state.applications.filter((a) => a.track === name && ['New', 'In review'].includes(a.status)).length}</dd></div></dl><div className="adm-dept-capacity"><span style={{ width: `${people.length / 8 * 100}%` }}/></div></article> })}</div> : <SummaryStrip items={[{ value: records.filter((r) => r.status === 'Active').length, label: 'Active members', meta: 'Current directory' }, { value: records.filter((r) => r.joined.includes('Sep 2026')).length, label: 'New this month' }, { value: records.filter((r) => r.pole === 'Unassigned').length, label: 'Without assigned pole' }, { value: records.filter((r) => r.status === 'Inactive').length, label: 'Inactive members' }]}/>}
    {isStaff && <div className="adm-operational-note"><Activity size={16}/><p>The <b>requested department</b> comes from Join. The <b>internal role</b> is assigned by administration after acceptance.</p></div>}
    <div className="adm-work-panel">
      {application && <Tabs items={APPLICATION_STATUSES} value={tab} counts={counts} onChange={(value) => { setTab(value); setSelected([]) }}/>}<RecordToolbar search={search} onSearch={setSearch} placeholder="Search name, speciality or reference…" filters={filters} onFilters={setFilters} definitions={fields} quickDefinitions={quickFields} resultCount={application ? undefined : visible.length} filterLabel={application ? 'Filters' : 'All filters'} view={activeView} onView={application || mobileCardsOnly ? undefined : setView}/>
      {application ? <RecordTable records={visible} columns={columns} selected={selected} onSelect={setSelected} onOpen={open} onBulk={openBulkAction}/> : activeView === 'cards' ? <PeopleCardGrid records={visible} isStaff={isStaff} selected={selected} onSelect={setSelected} onOpen={open} onBulk={openBulkAction}/> : <>
        <div className="adm-directory-register-head"><div><code>{isStaff ? 'STAFF / OPERATIONS' : 'MEMBERS / DIRECTORY'}</code><b>{visible.length}</b><span>{isStaff ? 'profiles in the operational roster' : 'profiles in the community register'}</span></div><div><span><i className="is-active"/>Active</span><span><i className="is-followup"/>Follow-up</span></div></div>
        <RecordTable className={`adm-people-table-view ${isStaff ? 'is-staff' : 'is-members'}`} records={visible} columns={columns} selected={selected} onSelect={setSelected} onOpen={open} rowClassName={(record) => record.status === 'Active' ? 'is-profile-active' : 'is-profile-followup'} onBulk={openBulkAction}/>
      </>}
    </div>
    {detail && <Drawer className={application ? 'is-candidate-drawer' : ''} title={application ? 'Application review' : isStaff ? 'Operational profile' : 'Member profile'} eyebrow={detail.id} headerContent={application ? ({ titleId }) => <CandidateReviewHeader detail={detail} titleId={titleId}/> : undefined} onClose={() => setDetailId(null)} footer={application ? <CandidateActionBar detail={detail} request={request}/> : <>
      <Button onClick={() => request(isStaff ? 'Assign internal role' : 'Edit member profile', null, { fields: isStaff ? [{ name: 'role', label: 'Internal role', value: detail.role, required: true }] : [{ name: 'name', label: 'Name', value: detail.name, required: true }, { name: 'email', label: 'Email', type: 'email', value: detail.email, required: true }, { name: 'level', label: 'Level', options: LEVELS, value: detail.level }, { name: 'status', label: 'Status', options: ['Active', 'On pause', 'Inactive', 'Alumni'], value: detail.status }] })}>{isStaff ? 'Assign a role' : 'Edit profile'}</Button><Button variant="secondary" onClick={() => request(isStaff ? 'Move department' : 'Change primary pole', null, { fields: [{ name: isStaff ? 'department' : 'pole', label: isStaff ? 'Current department' : 'Primary pole', options: isStaff ? DEPARTMENTS : ['Unassigned', ...POLES], value: isStaff ? detail.department : detail.pole }] })}>{isStaff ? 'Move department' : 'Change pole'}</Button><div>{isStaff ? <><button onClick={() => request('Assign project', null, { project: true, fields: [{ name: 'project', label: 'Project', options: ['AIVEX operations', 'Autumn workshops', 'Infinity website', 'Integration day'] }] })}>Add to project</button><button onClick={() => request('Change availability', null, { fields: [{ name: 'availability', label: 'Availability', options: AVAILABILITY }] })}>Availability</button></> : <button onClick={() => request('Convert member to staff', null, { convert: true, fields: [{ name: 'department', label: 'Department', options: DEPARTMENTS }, { name: 'role', label: 'Assigned role', required: true }] })}>Convert to staff</button>}<button className="is-danger" onClick={() => request('Deactivate profile', { status: 'Inactive' }, { danger: true })}>Deactivate</button><button onClick={() => request('Archive profile', { status: 'Archived' }, { danger: true })}>Archive</button></div>
    </>}>{application ? <CandidateDossier detail={detail} note={note} setNote={setNote} onSave={() => { if (!note.trim()) { addToast('Note is empty', 'Write a note before saving.'); return } update(collection, detail.id, { note }, 'Internal note saved') }}/> : <><div className="adm-candidate-identity"><Avatar initials={detail.initials}/><div><h3>{detail.name}</h3><p>{detail.role || detail.pole}</p></div><StatusBadge>{detail.status}</StatusBadge></div>
      <section className="adm-detail-section"><h4><span>01</span>Identity & academic path</h4><Facts items={[["Email", detail.email], ['Phone', detail.phone], ['Study level', detail.level], ['Speciality', detail.speciality || 'Information systems']]}/></section>
      <section className="adm-detail-section"><h4><span>02</span>{isStaff ? 'Operational assignment' : 'Membership'}</h4><Facts items={isStaff ? [['Requested at registration', detail.requested], ['Current department', detail.department], ['Current internal role', detail.role], ['Availability', detail.availability]] : [['Primary pole', detail.pole], ['Cohort', detail.cohort], ['Entry date', detail.joined], ['Initial interests / skills', detail.skills || detail.track]]}/></section>
      <section className="adm-detail-section"><h4><span>03</span>{isStaff ? 'Assigned projects' : 'Event participation'}</h4>{(isStaff ? detail.assignedProjects : detail.events)?.length ? <div className="adm-project-list">{(isStaff ? detail.assignedProjects : detail.events).map((item) => <p key={item}><span>{item}</span><StatusBadge tone="success">{isStaff ? 'Assigned' : 'Attended'}</StatusBadge></p>)}</div> : <p className="adm-muted">No {isStaff ? 'projects assigned' : 'participation recorded'} yet.</p>}{!isStaff && <p className="adm-muted">Internal documents: none attached to this demo member.</p>}</section>
      <section className="adm-detail-section"><h4><span>04</span>Internal notes</h4><label className="sr-only" htmlFor="record-note">Administrative note</label><textarea id="record-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add context for your colleagues…"/><button className="adm-save-note" onClick={() => { if (!note.trim()) { addToast('Note is empty', 'Write a note before saving.'); return } update(collection, detail.id, { note }, 'Internal note saved') }}>Save note</button></section>
      <section className="adm-detail-section"><h4><span>05</span>History</h4><History items={detail.history}/></section></>}
    </Drawer>}
    {action && <ActionDialog key={action.title} action={action} onClose={() => setAction(null)} onSubmit={(values) => { if (action.schedule) { update(collection, action.ids, { status: 'Interview', ...values }, action.title, values.reason); return } return submit(values) }}/>} 
  </div>
}
