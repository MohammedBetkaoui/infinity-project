
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, BriefcaseBusiness,
  CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, Circle,
  Clock3, FileCheck2, FileWarning, GraduationCap, Mail, MoreHorizontal,
  MoveRight, Phone, Plus, Trophy, UserCheck, UserRoundPlus, Users, X,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAdmin } from './AdminStore'
import OverviewChart from './OverviewChart'
import { DEPARTMENTS, timeLabel } from './adminModel'
import {
  Avatar, BulkBar, Button, EmptyState, FilterButton, FilterSelect, IconButton,
  Modal, PageHeader, Pagination, Progress, SearchField, SectionHeading,
  StatusBadge, Tabs,
} from './AdminUI'

function MiniTrend({ points = '0,23 16,19 31,21 47,10 63,13 80,4 98,8' }) {
  return <svg className="adm-mini-trend" viewBox="0 0 100 28" role="img" aria-label="Upward trend"><path d={`M${points}`} /><circle cx="98" cy="8" r="2.5" /></svg>
}

const overviewStats = [
  { label: 'New Join applications', value: '12', change: '+18%', meta: 'SEP 01—21', style: 'line', icon: UserRoundPlus },
  { label: 'Applications pending', value: '27', change: '5 urgent', meta: 'LIVE QUEUE', style: 'meter', icon: Clock3 },
  { label: 'Active members', value: '184', change: '+9 this month', meta: 'AY 2026/27', style: 'plain', icon: Users },
  { label: 'Active staff', value: '38', change: '91% capacity', meta: '3 DEPARTMENTS', style: 'nodes', icon: BriefcaseBusiness },
  { label: 'AIVEX teams', value: '42', change: '+6 this week', meta: '2ND EDITION', style: 'accent', icon: Trophy },
  { label: 'Files to verify', value: '08', change: '3 due today', meta: 'OPS / AIVEX', style: 'alert', icon: FileWarning },
]

const priorities = [
  { value: '12', title: 'New applications', copy: 'Waiting for first review', priority: 'High', action: 'Review', route: '/admin/applications' },
  { value: '05', title: 'Interviews to schedule', copy: 'Three from Staff applications', priority: 'Today', action: 'Schedule', route: '/admin/applications' },
  { value: '08', title: 'Signed AIVEX documents', copy: 'Received since Friday', priority: 'Review', action: 'Open queue', route: '/admin/aivex' },
  { value: '03', title: 'Files need correction', copy: 'Deadlines within 72 hours', priority: 'Attention', action: 'Inspect', route: '/admin/aivex' },
  { value: '01', title: 'Document generation issue', copy: 'Orion Makers · retry available', priority: 'Technical', action: 'Resolve', route: '/admin/aivex' },
]

export function OverviewPage() {
  const navigate = useNavigate()
  const { state } = useAdmin()
  const newCount = state.applications.filter((a) => a.status === 'New').length
  const pendingCount = state.applications.filter((a) => ['New', 'In review', 'Interview'].includes(a.status)).length
  const memberCount = state.members.filter((a) => a.status === 'Active').length
  const staffCount = state.staff.filter((a) => a.status === 'Active').length
  const reviewCount = state.teams.filter((a) => ['Signed document received', 'Under review', 'Corrections needed'].includes(a.document)).length
  const statCounts = [newCount, pendingCount, memberCount, staffCount, state.teams.length, reviewCount]
  const totalPeople = memberCount + staffCount + pendingCount
  const recentActivity = state.activities
  const priorityCounts = [newCount, state.applications.filter((a) => a.status === 'Interview' && !a.interviewAt).length, state.teams.filter((a) => a.document === 'Signed document received').length, state.teams.filter((a) => a.document === 'Corrections needed').length, state.teams.filter((a) => a.document === 'Generation issue').length]
  const priorityRoutes = ['/admin/applications', '/admin/applications?stage=Interview', '/admin/aivex?document=Signed%20document%20received', '/admin/aivex?document=Corrections%20needed', '/admin/aivex/orion']
  const pipelineCounts = [state.teams.length, state.teams.filter((t) => t.docs[0].status === 'Generated').length, state.teams.filter((t) => t.signed).length, reviewCount, state.teams.filter((t) => t.document === 'Validated').length]

  return (
    <div className="adm-page adm-overview-page">
      <PageHeader
        eyebrow="Control room · 01"
        title="Overview"
        description="The control point for Infinity Club and AIVEX registrations."
        meta={<div className="adm-campaign-chip"><span>MONDAY, 21 SEPTEMBER 2026</span><b>{state.settings.campaign}</b><i /></div>}
      />

      <section className="adm-kpi-grid" aria-label="Key statistics">
        {overviewStats.map(({ label, meta, style, icon: Icon }, index) => (
          <article className={`adm-kpi adm-kpi--${style}`} key={label}>
            <div className="adm-kpi__top"><span>0{index + 1}</span><Icon size={17} /></div>
            <p>{label}</p>
            <div className="adm-kpi__value"><strong>{String(statCounts[index]).padStart(2, '0')}</strong>{style === 'nodes' && <div className="adm-node-mark"><i /><i /><i /></div>}{style === 'meter' && <div className="adm-kpi-meter"><span style={{ height: '40%' }} /><span style={{ height: '58%' }} /><span style={{ height: '82%' }} /><span style={{ height: '65%' }} /></div>}</div>
            <div className="adm-kpi__bottom"><span className={style === 'alert' ? 'is-warning' : ''}>{['Ready for first review', 'Across 3 review stages', 'Current directory', '3 departments connected', 'Teams across Algeria', 'Review queue is open'][index]}</span><code>{meta}</code></div>
            {style === 'line' && <MiniTrend />}
          </article>
        ))}
      </section>

      <div className="adm-overview-layout">
        <section className="adm-panel adm-priority-panel">
          <SectionHeading index="01" title="Handle now" meta="Your next moves" />
          <div className="adm-priority-list">
            {priorities.map((item, index) => <button key={item.title} onClick={() => navigate(priorityRoutes[index])}>
              <span className={`adm-priority-index priority-${index}`}>{String(priorityCounts[index]).padStart(2, '0')}</span>
              <span><b>{item.title}</b><small>{item.copy}</small></span>
              <StatusBadge tone={index === 4 ? 'warning' : index < 2 ? 'urgent' : 'neutral'}>{item.priority}</StatusBadge>
              <em>{item.action}<ArrowRight size={14} /></em>
            </button>)}
          </div>
        </section>

        <OverviewChart />

        <section className="adm-panel adm-community-panel">
          <SectionHeading index="03" title="Community split" meta="Current semester" />
          <div className="adm-community-visual">
            <div className="adm-donut" style={{ background: 'conic-gradient(#094a36 0 ' + memberCount / totalPeople * 100 + '%, #9ed7c4 ' + memberCount / totalPeople * 100 + '% ' + (memberCount + staffCount) / totalPeople * 100 + '%, #e7dfcf 0)' }}><div><strong>{totalPeople}</strong><span>people</span></div></div>
<dl>{[['Members', memberCount, 'members'], ['Staff', staffCount, 'staff'], ['Pending', pendingCount, 'new']].map(([label, count, cls]) => <div key={label}><dt><i className={cls}/>{label}</dt><dd>{count} <small>{Math.round(count / totalPeople * 100)}%</small></dd></div>)}</dl>
          </div>
          <div className="adm-study-levels"><span>Study level</span>{[['L1–L3', Math.round(state.members.filter((m) => m.level.startsWith('L')).length / state.members.length * 100)], ['M1–M2', Math.round(state.members.filter((m) => m.level.startsWith('M')).length / state.members.length * 100)], ['E1–E5', Math.round(state.members.filter((m) => m.level.startsWith('E')).length / state.members.length * 100)]].map(([label, value]) => <div key={label}><p><b>{label}</b><em>{value}%</em></p><i><span style={{ width: `${value}%` }} /></i></div>)}</div>
        </section>

        <section className="adm-panel adm-departments-panel">
          <SectionHeading index="04" title="Staff by department" meta={`${staffCount} active`} />
          <div className="adm-infinity-route" aria-hidden="true"><span /><i /><i /><i /></div>
          {DEPARTMENTS.map((department, index) => [String(index + 1).padStart(2, '0'), department, state.staff[index].name, state.staff.filter((s) => s.department === department && s.status === 'Active').length, 8, state.applications.filter((a) => a.track === department && a.status === 'New').length]).map(([index, title, lead, count, capacity, waiting]) => <div className="adm-department-row" key={title}><span>{index}</span><div><b>{title}</b><small>Lead · {lead}</small></div><div className="adm-capacity"><p><span>{count} people</span><em>{count}/{capacity}</em></p><i><span style={{ width: `${count / capacity * 100}%` }} /></i></div><StatusBadge tone="neutral">{waiting} waiting</StatusBadge></div>)}
        </section>

        <section className="adm-panel adm-pipeline-panel">
          <SectionHeading index="05" title="AIVEX pipeline" meta="Second edition" action={<button className="adm-text-action" onClick={() => navigate('/admin/aivex')}>Open files <ArrowRight size={14} /></button>} />
          <div className="adm-pipeline">
            {[
              ['01', 'Registration recorded', 42], ['02', 'Official form ready', 38], ['03', 'Signed document', 29], ['04', 'Organizer review', 17], ['05', 'File validated', 12],
            ].map(([index, label], i) => <div key={label} className={i === 3 ? 'is-current' : ''}><span>{index}</span><i><Check size={13} /></i><b>{pipelineCounts[i]}</b><small>{label}</small></div>)}
          </div>
        </section>

        <section className="adm-panel adm-activity-panel">
          <SectionHeading index="06" title="Recent activity" meta="Live log" action={<button className="adm-text-action" onClick={() => navigate('/admin/activity')}>Full log <ArrowRight size={14} /></button>} />
          <div className="adm-activity-list">
            {recentActivity.slice(0, 5).map((item) => <div key={item.id}><i className={`tone-${item.tone}`}><Circle size={8} fill="currentColor" /></i><div><b>{item.title}</b><span>{item.subject}</span></div><p>{item.actor}<time>{timeLabel(item.at)}</time></p></div>)}
          </div>
        </section>
      </div>
      <p className="adm-demo-note">DEMO ENVIRONMENT · All figures and records shown are fictional.</p>
    </div>
  )
}
