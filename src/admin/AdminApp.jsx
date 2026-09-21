import { useEffect, useState } from 'react'
import { ArrowRight, FileText, Search, Users } from 'lucide-react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AdminProvider, useAdmin } from './AdminStore'
import { AdminShell, Button, Modal, ToastStack } from './AdminUI'
import { OverviewPage } from './AdminPages'
import PeoplePage from './PeoplePages'
import { AivexDetailPage, AivexListPage } from './AivexPages'
import { ActivityPage, LoginPage, SettingsPage } from './AdminUtilityPages'
import './admin.css'

function Workspace() {
  const { state, toasts } = useAdmin()
  const { pathname, search: routeSearch } = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [newAction, setNewAction] = useState(false)
  const [notifications, setNotifications] = useState(false)
  useEffect(() => { document.title = 'Infinity Club Administration · Demo'; window.scrollTo(0, 0) }, [pathname])
  useEffect(() => {
    const handler = (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); document.querySelector('.adm-global-search input')?.focus() } if (event.key === 'Escape') { setMobileOpen(false); setQuery('') } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  const searchResults = query.trim() ? ['applications', 'members', 'staff', 'teams'].flatMap((collection) => state[collection].filter((r) => `${r.name} ${r.ref || ''} ${r.email || ''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 4).map((record) => ({ collection, record }))).slice(0, 8) : []
  const pending = state.teams.filter((t) => ['Signed document received', 'Corrections needed', 'Generation issue'].includes(t.document))
  if (pathname === '/admin/login') return <><LoginPage/><ToastStack toasts={toasts}/></>
  return <div className={state.settings.density === 'Compact' ? 'adm-density-compact' : ''}><a href="#admin-content" className="adm-skip-link">Skip to workspace</a><AdminShell collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} query={query} setQuery={setQuery} onNotifications={() => setNotifications(true)} onNewAction={() => setNewAction(true)}>
    <Routes><Route index element={<Navigate to="/admin/overview" replace/>}/><Route path="overview" element={<OverviewPage/>}/><Route path="applications" element={<PeoplePage key={`applications-${routeSearch}`} collection="applications" globalQuery=""/>}/><Route path="members" element={<PeoplePage key={`members-${routeSearch}`} collection="members" globalQuery=""/>}/><Route path="staff" element={<PeoplePage key={`staff-${routeSearch}`} collection="staff" globalQuery=""/>}/><Route path="aivex" element={<AivexListPage key={routeSearch} globalQuery=""/>}/><Route path="aivex/:teamId" element={<AivexDetailPage key={pathname}/>}/><Route path="activity" element={<ActivityPage key={routeSearch} globalQuery=""/>}/><Route path="settings" element={<SettingsPage/>}/><Route path="*" element={<Navigate to="/admin/overview" replace/>}/></Routes>
  </AdminShell>
  {query.trim() && <div className="adm-global-results" role="region" aria-label="Global search results"><header><Search size={15}/>Search the workspace<button onClick={() => setQuery('')}>Close</button></header>{searchResults.length ? searchResults.map(({ collection, record }) => <button key={`${collection}-${record.id}`} onClick={() => { navigate(collection === 'teams' ? `/admin/aivex/${record.id}` : `/admin/${collection}?record=${encodeURIComponent(record.id)}${collection === 'applications' ? `&stage=${record.status}` : ''}`); setQuery('') }}><span><b>{record.name}</b><small>{record.ref || record.email}</small></span><em>{collection === 'teams' ? 'AIVEX' : collection}</em><ArrowRight size={15}/></button>) : <p>No matching names or references.</p>}</div>}
  <Modal open={newAction} onClose={() => setNewAction(false)} title="What’s next?" eyebrow="Quick actions"><div className="adm-quick-actions">{[['Review Join applications', 'Meet the next generation of Infinity.', '/admin/applications', Users], ['Verify an AIVEX file', 'Continue the administrative review.', '/admin/aivex', FileText], ['Open the activity log', 'Trace a decision or document consultation.', '/admin/activity', Search]].map(([title, copy, route, Icon]) => <button key={route} onClick={() => { navigate(route); setNewAction(false) }}><Icon size={21}/><span><b>{title}</b><small>{copy}</small></span><ArrowRight size={17}/></button>)}</div></Modal>
  <Modal open={notifications} onClose={() => setNotifications(false)} title="Your review queue" eyebrow="Notifications"><div className="adm-quick-actions">{state.settings.reviewAlerts && pending.length ? pending.map((t) => <button key={t.id} onClick={() => { navigate(`/admin/aivex/${t.id}`); setNotifications(false) }}><FileText size={20}/><span><b>{t.name}</b><small>{t.document}</small></span><ArrowRight size={16}/></button>) : <p>No review notifications. You can change alert preferences in Settings.</p>}</div></Modal>
  <ToastStack toasts={toasts}/></div>
}

export default function AdminApp() { return <AdminProvider><Routes><Route path="/admin/*" element={<Workspace/>}/></Routes></AdminProvider> }
