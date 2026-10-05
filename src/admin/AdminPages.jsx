import {
  ArrowRight, BriefcaseBusiness, Check, Circle, Clock3, FileWarning,
  RefreshCw, Trophy, UserRoundPlus, Users,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import OverviewChart from './OverviewChart'
import { Button, EmptyState, PageHeader, StatusBadge, SectionHeading } from './AdminUI'
import { useAdminOverview } from './useAdminOverview'

const DEPARTMENT_LABELS = Object.freeze({
  'dev-tech': 'Dev / Tech',
  'design-content': 'Design / Content Creation',
  'management-logistics': 'Management / Logistics',
})

const ACTION_LABELS = Object.freeze({
  start_review: 'Application moved to review',
  schedule_interview: 'Interview scheduled',
  accept_member: 'Member application accepted',
  accept_staff: 'Staff application accepted',
  change_staff_department: 'Staff department changed',
  decline: 'Application declined',
  archive: 'Application archived',
  add_note: 'Internal note added',
  update_profile: 'Profile updated',
  change_pole: 'Member pole changed',
  promote_to_staff: 'Member promoted to staff',
  set_status: 'Profile status changed',
  assign_role: 'Staff role assigned',
  move_department: 'Staff department changed',
  assign_project: 'Project assigned',
  change_availability: 'Availability updated',
  verify_activity_official: 'Activities manager reviewed',
  verify_document: 'AIVEX document verified',
  invalidate_document: 'AIVEX document marked invalid',
  request_corrections: 'AIVEX corrections requested',
  resolve_correction_item: 'AIVEX correction reviewed',
  validate_file: 'AIVEX team accepted',
  reject_registration: 'AIVEX registration rejected',
  cancel_registration: 'AIVEX registration cancelled',
  confidential_document_opened: 'Confidential document opened',
  official_document_downloaded: 'Official document downloaded',
  aivex_team_arrival_confirmed: 'AIVEX team arrival confirmed',
  aivex_team_marked_absent: 'AIVEX team marked absent',
  aivex_team_attendance_reset: 'AIVEX attendance reset',
})

const countLabel = (value) => {
  const count = Math.max(0, Number(value) || 0)
  return count < 10 ? String(count).padStart(2, '0') : String(count)
}

const percent = (value, total) => total > 0 ? Math.round((value / total) * 100) : 0

const readableAction = (action) => ACTION_LABELS[action] || String(action || 'Administrative action')
  .replaceAll('_', ' ')
  .replace(/^./, (letter) => letter.toUpperCase())

const overviewDate = (value) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(date).toUpperCase()
    : 'LIVE OVERVIEW'
}

const activityTime = (value) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
    : '—'
}

function MiniTrend({ series }) {
  const values = (series || []).map((point) => Number(point.member || 0) + Number(point.staff || 0) + Number(point.aivex || 0))
  const max = Math.max(1, ...values)
  const denominator = Math.max(1, values.length - 1)
  const points = values.map((value, index) => `${Math.round(index * 98 / denominator)},${Math.round(24 - value / max * 20)}`)
  if (points.length < 2) points.push('98,24')
  const [lastX, lastY] = points.at(-1).split(',')
  return <svg className="adm-mini-trend" viewBox="0 0 100 28" role="img" aria-label="Recent submissions trend"><path d={`M${points.join(' L')}`} /><circle cx={lastX} cy={lastY} r="2.5" /></svg>
}

function OverviewLoading() {
  return <div className="adm-skeleton-group" aria-label="Loading live overview" role="status">
    {[1, 2, 3, 4, 5, 6].map((number) => <div className="adm-skeleton-row" key={number}><i/><span/><b/></div>)}
  </div>
}

export function OverviewPage() {
  const navigate = useNavigate()
  const { dashboard, loading, error, refresh } = useAdminOverview()

  if (!dashboard) {
    return <div className="adm-page adm-overview-page">
      <PageHeader eyebrow="Control room · Live data" title="Overview" description="The control point for Infinity Club and AIVEX registrations." actions={<Button variant="secondary" onClick={refresh} disabled={loading} icon={<RefreshCw size={15}/>}>Refresh</Button>}/>
      {loading ? <OverviewLoading/> : <div className="adm-overview-error"><EmptyState title="Overview unavailable" copy={error || 'The live administrative data could not be loaded.'}/><Button variant="secondary" onClick={refresh}>Try again</Button></div>}
    </div>
  }

  const { stats, priorities, community, departments, aivexPipeline, series, activity } = dashboard
  const totalPeople = community.members + community.staff + community.pending
  const totalMembers = Object.values(community.studyLevels).reduce((sum, value) => sum + value, 0)
  const maxDepartment = Math.max(1, ...departments.map((department) => department.active))
  const trendValues = series.map((point) => point.member + point.staff + point.aivex)
  const statCards = [
    { label: 'New Join applications', value: stats.newApplications, meta: 'LIVE QUEUE', copy: 'Ready for first review', style: 'line', icon: UserRoundPlus },
    { label: 'Applications pending', value: stats.pendingApplications, meta: 'LIVE QUEUE', copy: 'Across active review stages', style: 'meter', icon: Clock3 },
    { label: 'Active members', value: stats.activeMembers, meta: 'CURRENT DIRECTORY', copy: 'Member profiles without staff roles', style: 'plain', icon: Users },
    { label: 'Active staff', value: stats.activeStaff, meta: 'LIVE STRUCTURE', copy: `${stats.connectedDepartments} departments connected`, style: 'nodes', icon: BriefcaseBusiness },
    { label: 'AIVEX teams', value: stats.aivexTeams, meta: `EDITION ${String(dashboard.edition).padStart(2, '0')}`, copy: 'Registered teams in the current edition', style: 'accent', icon: Trophy },
    { label: 'Files to verify', value: stats.filesToVerify, meta: 'OPS / AIVEX', copy: 'Signed, reviewing or correcting', style: 'alert', icon: FileWarning },
  ]
  const priorityItems = [
    { count: priorities.newApplications, title: 'New applications', copy: 'Waiting for first review', priority: 'High', action: 'Review', route: '/admin/applications?stage=New' },
    { count: priorities.interviewsToSchedule, title: 'Interviews to schedule', copy: 'Interview stage without an active appointment', priority: 'Today', action: 'Schedule', route: '/admin/applications?stage=Interview' },
    { count: priorities.signedDocuments, title: 'Signed AIVEX documents', copy: 'Ready for the first document review', priority: 'Review', action: 'Open queue', route: '/admin/aivex?document=Signed%20document%20received' },
    { count: priorities.correctionsDue, title: 'Corrections due soon', copy: 'Open deadlines due within 72 hours or overdue', priority: 'Attention', action: 'Inspect', route: '/admin/aivex?document=Corrections%20needed' },
    { count: priorities.generationIssues, title: 'Document generation issues', copy: 'Files requiring an administrator retry', priority: 'Technical', action: 'Resolve', route: '/admin/aivex?document=Generation%20issue' },
  ]
  const pipeline = [
    ['01', 'Registration recorded', aivexPipeline.registered],
    ['02', 'Official form ready', aivexPipeline.formReady],
    ['03', 'Signed document', aivexPipeline.signedDocument],
    ['04', 'Organizer review', aivexPipeline.organizerReview],
    ['05', 'File validated', aivexPipeline.validated],
  ]

  return <div className="adm-page adm-overview-page">
    <PageHeader
      eyebrow="Control room · Live data"
      title="Overview"
      description="Real-time operational indicators from Infinity Club and AIVEX records."
      meta={<div className="adm-campaign-chip"><span>{overviewDate(dashboard.generatedAt)}</span><b>LIVE DATABASE</b><i/></div>}
      actions={<Button variant="secondary" onClick={refresh} disabled={loading} icon={<RefreshCw className={loading ? 'adm-spin' : ''} size={15}/>}>{loading ? 'Refreshing…' : 'Refresh data'}</Button>}
    />

    {error && <p className="adm-overview-warning" role="alert">{error} Showing the last successfully loaded data.</p>}

    <section className="adm-kpi-grid" aria-label="Live key statistics">
      {statCards.map(({ label, value, meta, copy, style, icon: Icon }) => <article className={`adm-kpi adm-kpi--${style}`} key={label}>
        <div className="adm-kpi__top"><Icon size={18}/></div>
        <p>{label}</p>
        <div className="adm-kpi__value"><strong>{countLabel(value)}</strong>{style === 'nodes' && <div className="adm-node-mark"><i/><i/><i/></div>}{style === 'meter' && <div className="adm-kpi-meter">{trendValues.slice(-4).map((point, pointIndex) => <span key={pointIndex} style={{ height: `${Math.max(10, percent(point, Math.max(1, ...trendValues)))}%` }}/>)}</div>}</div>
        <div className="adm-kpi__bottom"><span className={style === 'alert' && value > 0 ? 'is-warning' : ''}>{copy}</span><code>{meta}</code></div>
        {style === 'line' && <MiniTrend series={series}/>}
      </article>)}
    </section>

    <div className="adm-overview-layout">
      <section className="adm-panel adm-priority-panel">
        <SectionHeading title="Handle now" meta="Live priority queue"/>
        <div className="adm-priority-list">
          {priorityItems.map((item, index) => <button key={item.title} onClick={() => navigate(item.route)}>
            <span className={`adm-priority-index priority-${index}`}>{countLabel(item.count)}</span>
            <span><b>{item.title}</b><small>{item.copy}</small></span>
            <StatusBadge tone={index === 4 ? 'warning' : index < 2 ? 'urgent' : 'neutral'}>{item.priority}</StatusBadge>
            <em>{item.action}<ArrowRight size={14}/></em>
          </button>)}
        </div>
      </section>

      <OverviewChart series={series}/>

      <section className="adm-panel adm-community-panel">
        <SectionHeading title="Community split" meta="Current directory"/>
        <div className="adm-community-visual">
          <div className="adm-donut" style={{ background: `conic-gradient(var(--adm-green) 0 ${percent(community.members, totalPeople)}%, var(--adm-chart-2) ${percent(community.members, totalPeople)}% ${percent(community.members + community.staff, totalPeople)}%, var(--adm-chart-3) 0)` }}><div><strong>{totalPeople}</strong><span>people</span></div></div>
          <dl>{[['Members', community.members, 'members'], ['Staff', community.staff, 'staff'], ['Pending', community.pending, 'new']].map(([label, count, cls]) => <div key={label}><dt><i className={cls}/>{label}</dt><dd>{count} <small>{percent(count, totalPeople)}%</small></dd></div>)}</dl>
        </div>
        <div className="adm-study-levels"><span>Active member study level</span>{[['L1–L3', community.studyLevels.licence], ['M1–M2', community.studyLevels.master], ['E1–E5', community.studyLevels.engineer], ['Other', community.studyLevels.other]].map(([label, count]) => <div key={label}><p><b>{label}</b><em>{percent(count, totalMembers)}%</em></p><i><span style={{ width: `${percent(count, totalMembers)}%` }}/></i></div>)}</div>
      </section>

      <section className="adm-panel adm-departments-panel">
        <SectionHeading title="Staff by department" meta={`${stats.activeStaff} active`}/>
        {departments.map((department) => <div className="adm-department-row" key={department.key}>
          <div><b>{DEPARTMENT_LABELS[department.key] || department.key}</b><small>Live staff directory</small></div>
          <div className="adm-capacity"><p><span>{department.active} active</span><em>{percent(department.active, stats.activeStaff)}% of staff</em></p><i><span style={{ width: `${percent(department.active, maxDepartment)}%` }}/></i></div>
          <StatusBadge tone="neutral">{department.waiting} waiting</StatusBadge>
        </div>)}
      </section>

      <section className="adm-panel adm-pipeline-panel">
        <SectionHeading title="AIVEX pipeline" meta={`Edition ${String(dashboard.edition).padStart(2, '0')}`} action={<button className="adm-text-action" onClick={() => navigate('/admin/aivex')}>Open files <ArrowRight size={14}/></button>}/>
        <div className="adm-pipeline">{pipeline.map(([, label, count], position) => <div key={label} className={position === 3 ? 'is-current' : ''}><i><Check size={13}/></i><b>{count}</b><small>{label}</small></div>)}</div>
      </section>

      <section className="adm-panel adm-activity-panel">
        <SectionHeading title="Recent activity" meta="Database audit log"/>
        {activity.length ? <div className="adm-activity-list">{activity.slice(0, 6).map((item, index) => <div key={`${item.createdAt}-${item.action}-${index}`}><i className={`tone-${item.sensitivity === 'confidential' ? 'sensitive' : 'success'}`}><Circle size={8} fill="currentColor"/></i><div><b>{readableAction(item.action)}</b><span>{item.subject}</span></div><p>{item.actor}<time>{activityTime(item.createdAt)}</time></p></div>)}</div>
          : <EmptyState title="No administrative activity yet" copy="Audited actions will appear here automatically."/>}
      </section>
    </div>
    <p className="adm-live-note">LIVE DATA · Last refreshed {activityTime(dashboard.generatedAt)} · No demonstration records are used on this page.</p>
  </div>
}
