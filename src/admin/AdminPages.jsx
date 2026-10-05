import { useId, useRef } from 'react'
import {
  ArrowRight, ArrowUpRight, BriefcaseBusiness, Check, Clock3, FileWarning,
  RefreshCw, Trophy, UserRoundPlus, Users,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import AnimatedNumber from './AnimatedNumber'
import OverviewChart from './OverviewChart'
import { Avatar, Button, EmptyState, PageHeader, StatusBadge, SectionHeading } from './AdminUI'
import { initialsOf } from './adminModel'
import { useCascade, useDonutReveal, useGaugeReveal, useGrow } from './adminMotion'
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

const percent = (value, total) => total > 0 ? Math.round((value / total) * 100) : 0

const readableAction = (action) => ACTION_LABELS[action] || String(action || 'Administrative action')
  .replaceAll('_', ' ')
  .replace(/^./, (letter) => letter.toUpperCase())

const overviewDate = (value) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(date)
    : 'Live overview'
}

const activityTime = (value) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
    : '—'
}

function MiniTrend({ series }) {
  const values = (series || []).map((point) => Number(point.member || 0) + Number(point.staff || 0))
  const max = Math.max(1, ...values)
  const denominator = Math.max(1, values.length - 1)
  const points = values.map((value, index) => `${Math.round(index * 96 / denominator) + 2},${Math.round(26 - value / max * 22)}`)
  if (points.length < 2) points.push('98,26')
  const [lastX, lastY] = points.at(-1).split(',')
  return <svg className="adm-mini-trend" viewBox="0 0 100 30" role="img" aria-label="Join submissions trend, last 30 days"><path d={`M${points.join(' L')}`} /><circle cx={lastX} cy={lastY} r="3" /></svg>
}

function KpiCard({ label, value, copy, route, icon: Icon, hero = false, warning = false, children }) {
  return <article className={`adm-kpi ${hero ? 'is-hero' : ''}`}>
    <header className="adm-kpi__head">
      <span className="adm-kpi__icon" aria-hidden="true"><Icon size={18}/></span>
      <p className="adm-kpi__label">{label}</p>
      <Link className="adm-kpi__open" to={route} aria-label={`Open ${label}`}><ArrowUpRight size={18} aria-hidden="true"/></Link>
    </header>
    <div className="adm-kpi__value"><strong><AnimatedNumber value={value}/></strong>{children}</div>
    <p className={`adm-kpi__trend ${warning ? 'is-warning' : ''}`}>{copy}</p>
  </article>
}

function CommunityDonut({ segments, total }) {
  const ref = useRef(null)
  const id = useId()
  useDonutReveal(ref, total)
  const radius = 58
  const circumference = 2 * Math.PI * radius
  const visible = segments.filter((segment) => segment.value > 0)
  const gap = visible.length > 1 ? 3 : 0
  // Each arc starts where the previous one ended, measured from 12 o'clock.
  const arcs = visible.reduce((list, segment) => {
    const from = list.length ? list.at(-1).to : 0
    const share = segment.value / Math.max(1, total)
    return [...list, { ...segment, share, from, to: from + share }]
  }, [])
  // Two half-plane masks rotate into place to draw the ring clockwise (transform only).
  return <div className="adm-donut" ref={ref}>
    <svg viewBox="0 0 150 150" aria-hidden="true">
      <defs>
        <clipPath id={`${id}-right`}><rect x="75" y="-10" width="85" height="170"/></clipPath>
        <clipPath id={`${id}-left`}><rect x="-10" y="-10" width="85" height="170"/></clipPath>
        <mask id={`${id}-sweep`} maskUnits="userSpaceOnUse" x="-10" y="-10" width="170" height="170">
          <g clipPath={`url(#${id}-right)`}><rect className="adm-donut__sweep is-right" x="75" y="-10" width="85" height="170" fill="white"/></g>
          <g clipPath={`url(#${id}-left)`}><rect className="adm-donut__sweep is-left" x="-10" y="-10" width="85" height="170" fill="white"/></g>
        </mask>
      </defs>
      <circle className="adm-donut__track" cx="75" cy="75" r={radius}/>
      <g mask={`url(#${id}-sweep)`}>
        {arcs.map((arc) => <g key={arc.key} className="adm-donut__segment" style={{ '--adm-donut-turn': `${arc.from * 360 - 90}deg` }}>
          <circle className={arc.key} cx="75" cy="75" r={radius} strokeDasharray={`${Math.max(0, arc.share * circumference - gap)} ${circumference}`}/>
        </g>)}
      </g>
    </svg>
    <div className="adm-donut__total"><strong><AnimatedNumber value={total}/></strong><span>people</span></div>
  </div>
}

function PipelineGauge({ validated, review, registered }) {
  const ref = useRef(null)
  const clip = useId()
  useGaugeReveal(ref, `${validated}/${review}/${registered}`)
  const radius = 70
  const total = Math.max(1, registered)
  const validatedShare = Math.min(1, validated / total)
  const reviewShare = Math.min(1 - validatedShare, review / total)
  const arc = `M ${90 - radius} 90 A ${radius} ${radius} 0 0 1 ${90 + radius} 90`
  return <div className="adm-gauge" ref={ref}>
    <svg viewBox="0 0 180 104" aria-hidden="true">
      <defs><clipPath id={clip}><rect x="0" y="0" width="180" height="90"/><rect x="0" y="90" width="90" height="14"/></clipPath></defs>
      <path className="adm-gauge__track" d={arc} pathLength="100"/>
      <g clipPath={`url(#${clip})`}>
        <g className="adm-gauge__fill">
          {reviewShare > 0 && <path className="adm-gauge__review" d={arc} pathLength="100" strokeDasharray={`${(validatedShare + reviewShare) * 100} 200`}/>}
          {validatedShare > 0 && <path className="adm-gauge__validated" d={arc} pathLength="100" strokeDasharray={`${validatedShare * 100} 200`}/>}
        </g>
      </g>
    </svg>
    <div className="adm-gauge__value"><strong><AnimatedNumber value={percent(validated, registered)} suffix="%"/></strong><span>validated</span></div>
  </div>
}

function OverviewLoading() {
  return <div className="adm-overview-loading" aria-label="Loading live overview" role="status">
    <div className="adm-kpi-grid">{[1, 2, 3, 4].map((number) => <div className="adm-kpi is-skeleton" key={number}><i/><span/><b/></div>)}</div>
    <div className="adm-skeleton-group">{[1, 2, 3, 4].map((number) => <div className="adm-skeleton-row" key={number}><i/><span/><b/></div>)}</div>
  </div>
}

export function OverviewPage() {
  const navigate = useNavigate()
  const pageRef = useRef(null)
  const { dashboard, loading, error, refresh } = useAdminOverview()
  useCascade(pageRef, '.adm-kpi, .adm-overview-layout .adm-panel', Boolean(dashboard))
  useGrow(pageRef, '.adm-pipeline__fill, .adm-department-row__bar span, .adm-study-levels > div > i span', Boolean(dashboard))

  if (!dashboard) {
    return <div className="adm-page adm-overview-page" ref={pageRef}>
      <PageHeader eyebrow="Control room · Live data" title="Overview" description="The control point for Infinity Club and AIVEX registrations." actions={<Button variant="secondary" onClick={refresh} disabled={loading} icon={<RefreshCw size={15}/>}>Refresh</Button>}/>
      {loading ? <OverviewLoading/> : <div className="adm-overview-error"><EmptyState title="Overview unavailable" copy={error || 'The live administrative data could not be loaded.'}/><Button variant="secondary" onClick={refresh}>Try again</Button></div>}
    </div>
  }

  const { stats, priorities, community, departments, aivexPipeline, series, activity } = dashboard
  const edition = String(dashboard.edition).padStart(2, '0')
  const totalPeople = community.members + community.staff + community.pending
  const totalMembers = Object.values(community.studyLevels).reduce((sum, value) => sum + value, 0)
  const maxDepartment = Math.max(1, ...departments.map((department) => department.active))
  const filesCard = { id: 'files', label: 'Files to verify', value: stats.filesToVerify, copy: 'Signed, reviewing or correcting', route: '/admin/aivex', icon: FileWarning, warning: stats.filesToVerify > 0 }
  const teamsCard = { id: 'teams', label: 'AIVEX teams', value: stats.aivexTeams, copy: `Registered teams · Edition ${edition}`, route: '/admin/aivex', icon: Trophy }
  // The filled card always carries what needs attention first.
  const [heroCard, aivexCard] = stats.filesToVerify > 0 ? [filesCard, teamsCard] : [teamsCard, filesCard]
  const primaryCards = [
    heroCard,
    { id: 'new', label: 'New Join applications', value: stats.newApplications, copy: 'Ready for first review', route: '/admin/applications?stage=New', icon: UserRoundPlus, trend: true },
    { id: 'pending', label: 'Applications pending', value: stats.pendingApplications, copy: 'Across active review stages', route: '/admin/applications?stage=In%20review', icon: Clock3 },
    aivexCard,
  ]
  const secondaryCards = [
    { id: 'members', label: 'Active members', value: stats.activeMembers, copy: 'Member profiles without staff roles', route: '/admin/members', icon: Users },
    { id: 'staff', label: 'Active staff', value: stats.activeStaff, copy: `${stats.connectedDepartments} departments connected`, route: '/admin/staff', icon: BriefcaseBusiness },
  ]
  const priorityItems = [
    { count: priorities.newApplications, title: 'New applications', copy: 'Waiting for first review', priority: 'High', tone: 'urgent', action: 'Review', route: '/admin/applications?stage=New' },
    { count: priorities.interviewsToSchedule, title: 'Interviews to schedule', copy: 'Interview stage without an active appointment', priority: 'Today', tone: 'urgent', action: 'Schedule', route: '/admin/applications?stage=Interview' },
    { count: priorities.signedDocuments, title: 'Signed AIVEX documents', copy: 'Ready for the first document review', priority: 'Review', tone: 'info', action: 'Open queue', route: '/admin/aivex?document=Signed%20document%20received' },
    { count: priorities.correctionsDue, title: 'Corrections due soon', copy: 'Open deadlines due within 72 hours or overdue', priority: 'Attention', tone: 'warning', action: 'Inspect', route: '/admin/aivex?document=Corrections%20needed' },
    { count: priorities.generationIssues, title: 'Document generation issues', copy: 'Files requiring an administrator retry', priority: 'Technical', tone: 'neutral', action: 'Resolve', route: '/admin/aivex?document=Generation%20issue' },
  ]
  const pipeline = [
    ['Registration recorded', aivexPipeline.registered],
    ['Official form ready', aivexPipeline.formReady],
    ['Signed document', aivexPipeline.signedDocument],
    ['Organizer review', aivexPipeline.organizerReview],
    ['File validated', aivexPipeline.validated],
  ]
  const CURRENT_STAGE = 3
  const earlierStages = Math.max(0, aivexPipeline.registered - aivexPipeline.validated - aivexPipeline.organizerReview)
  const communitySegments = [
    { key: 'members', label: 'Members', value: community.members },
    { key: 'staff', label: 'Staff', value: community.staff },
    { key: 'new', label: 'Pending', value: community.pending },
  ]

  return <div className="adm-page adm-overview-page" ref={pageRef}>
    <PageHeader
      eyebrow="Control room · Live data"
      title="Overview"
      description={<>Real-time operational indicators from Infinity Club and AIVEX records. <span className="adm-live-pill"><i aria-hidden="true"/>LIVE DATABASE<time dateTime={dashboard.generatedAt}>{overviewDate(dashboard.generatedAt)}</time></span></>}
      actions={<>
        <Button variant="secondary" onClick={refresh} disabled={loading} icon={<RefreshCw className={loading ? 'adm-spin' : ''} size={15}/>}>{loading ? 'Refreshing…' : 'Refresh data'}</Button>
        <Button onClick={() => navigate('/admin/applications?stage=New')} icon={<ArrowRight size={16}/>}>Review applications</Button>
      </>}
    />

    {error && <p className="adm-overview-warning" role="alert">{error} Showing the last successfully loaded data.</p>}

    <section className="adm-kpi-grid" aria-label="Live key statistics">
      {primaryCards.map(({ id, ...card }, index) => <KpiCard key={id} {...card} hero={index === 0}>{card.trend && <MiniTrend series={series}/>}</KpiCard>)}
      {secondaryCards.map(({ id, ...card }) => <KpiCard key={id} {...card}/>)}
    </section>

    <div className="adm-overview-layout">
      <div className="adm-overview-column is-main">
        <OverviewChart series={series}/>

        <section className="adm-panel adm-pipeline-panel">
          <SectionHeading title="AIVEX pipeline" meta={`Edition ${edition}`} action={<button className="adm-text-action" onClick={() => navigate('/admin/aivex')}>Open files <ArrowRight size={14}/></button>}/>
          <div className="adm-pipeline-body">
            <div className="adm-pipeline-gauge">
              <PipelineGauge validated={aivexPipeline.validated} review={aivexPipeline.organizerReview} registered={aivexPipeline.registered}/>
              <ul className="adm-dot-legend">
                <li><i className="is-validated"/>Validated <b>{aivexPipeline.validated}</b></li>
                <li><i className="is-review"/>In organizer review <b>{aivexPipeline.organizerReview}</b></li>
                <li><i className="is-rest"/>Earlier stages <b>{earlierStages}</b></li>
              </ul>
            </div>
            <div className="adm-pipeline-steps" style={{ '--adm-pipeline-current': CURRENT_STAGE / (pipeline.length - 1) }}>
              <span className="adm-pipeline__track" aria-hidden="true"><i className="adm-pipeline__fill"/></span>
            <ol className="adm-pipeline">
              {pipeline.map(([label, count], position) => <li key={label} className={position < CURRENT_STAGE ? 'is-complete' : position === CURRENT_STAGE ? 'is-current' : ''} aria-current={position === CURRENT_STAGE ? 'step' : undefined}>
                <i aria-hidden="true">{position < CURRENT_STAGE ? <Check size={14}/> : position === CURRENT_STAGE ? <Clock3 size={14}/> : null}</i>
                <b>{count}</b>
                <small>{label}</small>
              </li>)}
            </ol>
            </div>
          </div>
        </section>

        <section className="adm-panel adm-activity-panel">
          <SectionHeading title="Recent activity" meta="Database audit log"/>
          {activity.length ? <ul className="adm-overview-list">{activity.slice(0, 6).map((item, index) => <li key={`${item.createdAt}-${item.action}-${index}`}>
            <Avatar initials={initialsOf(item.actor || 'Infinity Administration')} small/>
            <span className="adm-overview-list__copy"><b>{readableAction(item.action)}</b><small>{item.subject}</small></span>
            <span className="adm-overview-list__meta">{item.sensitivity === 'confidential' && <StatusBadge tone="sensitive">Confidential</StatusBadge>}<span>{item.actor}</span><time dateTime={item.createdAt || undefined}>{activityTime(item.createdAt)}</time></span>
          </li>)}</ul>
            : <EmptyState title="No administrative activity yet" copy="Audited actions will appear here automatically."/>}
        </section>
      </div>

      <div className="adm-overview-column is-side">
        <section className="adm-panel adm-priority-panel">
          <SectionHeading title="Handle now" meta="Live priority queue"/>
          <div className="adm-priority-list">
            {priorityItems.map((item, index) => <button key={item.title} onClick={() => navigate(item.route)} className={item.count === 0 ? 'is-clear' : ''}>
              <span className="adm-avatar is-small adm-priority-count" data-tone={index % 6}>{item.count}</span>
              <span className="adm-priority-copy"><b>{item.title}</b><small>{item.copy}</small></span>
              <StatusBadge tone={item.tone}>{item.priority}</StatusBadge>
              <span className="adm-priority-go"><span className="sr-only">{item.action}</span><ArrowRight size={16} aria-hidden="true"/></span>
            </button>)}
          </div>
        </section>

        <section className="adm-panel adm-community-panel">
          <SectionHeading title="Community split" meta="Current directory"/>
          <div className="adm-community-visual">
            <CommunityDonut segments={communitySegments} total={totalPeople}/>
            <dl>{communitySegments.map(({ key, label, value }) => <div key={key}><dt><i className={key}/>{label}</dt><dd>{value} <small>{percent(value, totalPeople)}%</small></dd></div>)}</dl>
          </div>
          <div className="adm-study-levels"><span>Active member study level</span>{[['L1–L3', community.studyLevels.licence], ['M1–M2', community.studyLevels.master], ['E1–E5', community.studyLevels.engineer], ['Other', community.studyLevels.other]].map(([label, count]) => <div key={label}><p><b>{label}</b><em>{percent(count, totalMembers)}%</em></p><i><span style={{ width: `${percent(count, totalMembers)}%` }}/></i></div>)}</div>
        </section>

        <section className="adm-panel adm-departments-panel">
          <SectionHeading title="Staff by department" meta={`${stats.activeStaff} active`}/>
          {departments.map((department) => <div className="adm-department-row" key={department.key}>
            <div><b>{DEPARTMENT_LABELS[department.key] || department.key}</b><small>{department.active} active · {percent(department.active, stats.activeStaff)}% of staff</small></div>
            <StatusBadge tone="neutral">{department.waiting} waiting</StatusBadge>
            <i className="adm-department-row__bar"><span style={{ width: `${percent(department.active, maxDepartment)}%` }}/></i>
          </div>)}
        </section>
      </div>
    </div>
    <p className="adm-live-note">Live data · Last refreshed {activityTime(dashboard.generatedAt)} · No demonstration records are used on this page.</p>
  </div>
}
