import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, FileText, LockKeyhole, Search, Users } from 'lucide-react'
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import InfinityMark from '../components/InfinityMark'
import { AdminAuthProvider, useAdminAuth } from './AdminAuth'
import { adminLoginPathFor, safeAdminReturnTo } from './adminAuthPath'
import { AdminProvider, useAdmin } from './AdminStore'
import { AdminShell, Button, Modal, ToastStack } from './AdminUI'
import ApplicationsPage from './ApplicationsPage'
import { OverviewPage } from './AdminPages'
import PeoplePage from './PeoplePages'
import { AivexDetailPage, AivexListPage } from './AivexPages'
import { aivexPath, translateAivex } from './AivexI18n'
import { ActivityPage, LoginPage, SettingsPage } from './AdminUtilityPages'
import './admin.css'

const AIVEX_GLOBAL_ARABIC = Object.freeze({
  'Global search results': 'نتائج البحث الشامل',
  'Search the workspace': 'البحث في مساحة الإدارة',
  Close: 'إغلاق',
  'No matching names or references.': 'لا توجد أسماء أو مراجع مطابقة.',
  applications: 'طلبات الانضمام',
  members: 'الأعضاء',
  staff: 'الطاقم',
  'What’s next?': 'ما الإجراء التالي؟',
  'Quick actions': 'إجراءات سريعة',
  'Review Join applications': 'مراجعة طلبات الانضمام',
  'Meet the next generation of Infinity.': 'راجع المرشحين الجدد للانضمام إلى Infinity.',
  'Verify an AIVEX file': 'التحقق من ملف AIVEX',
  'Continue the administrative review.': 'واصل المراجعة الإدارية للملفات.',
  'Open the activity log': 'فتح سجل النشاط',
  'Trace a decision or document consultation.': 'تتبّع قرار أو عملية اطلاع على وثيقة.',
  'Your review queue': 'قائمة المراجعة الخاصة بك',
  'No review notifications. You can change alert preferences in Settings.': 'لا توجد إشعارات مراجعة. يمكنك تعديل تفضيلات التنبيه من الإعدادات.',
})

function Workspace() {
  const { state, toasts } = useAdmin()
  const { pathname, search: routeSearch } = useLocation()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [newAction, setNewAction] = useState(false)
  const [notifications, setNotifications] = useState(false)
  const isArabicAivex = pathname.startsWith('/admin/aivex') && new URLSearchParams(routeSearch).get('lang') === 'ar'
  const language = isArabicAivex ? 'ar' : 'en'
  const t = (value) => isArabicAivex ? (AIVEX_GLOBAL_ARABIC[value] || translateAivex(value, language)) : value
  const preserveAivexLanguage = (route) => isArabicAivex && route.startsWith('/admin/aivex') ? aivexPath(route, language) : route
  const FlowArrow = isArabicAivex ? ArrowLeft : ArrowRight
  const wrapperClassName = ['adm-admin-root', state.settings.density === 'Compact' && 'adm-density-compact', isArabicAivex && 'is-aivex-ar'].filter(Boolean).join(' ')
  useEffect(() => {
    document.title = isArabicAivex ? 'إدارة Infinity Club' : 'Infinity Club Administration'
    window.scrollTo(0, 0)
  }, [pathname, isArabicAivex])
  useEffect(() => {
    const handler = (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); document.querySelector('.adm-global-search input')?.focus() } if (event.key === 'Escape') { setMobileOpen(false); setQuery('') } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  // Join applications are now a protected server resource and must never be
  // copied into the demo store/localStorage. Their search stays on the Join
  // page until the global search receives its own authenticated endpoint.
  const searchResults = query.trim() ? ['members', 'staff', 'teams'].flatMap((collection) => state[collection].filter((r) => `${r.name} ${r.ref || ''} ${r.email || ''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 4).map((record) => ({ collection, record }))).slice(0, 8) : []
  const pending = state.teams.filter((t) => ['Signed document received', 'Corrections needed', 'Generation issue'].includes(t.document))
  return <div className={wrapperClassName} dir={isArabicAivex ? 'rtl' : 'ltr'} lang={language}><a href="#admin-content" className="adm-skip-link">{t('Skip to workspace')}</a><AdminShell collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} query={query} setQuery={setQuery} onNotifications={() => setNotifications(true)} onNewAction={() => setNewAction(true)}>
    <Routes><Route index element={<Navigate to="/admin/overview" replace/>}/><Route path="overview" element={<OverviewPage/>}/><Route path="applications" element={<ApplicationsPage key={`applications-${routeSearch}`}/>}/><Route path="members" element={<PeoplePage key={`members-${routeSearch}`} collection="members" globalQuery=""/>}/><Route path="staff" element={<PeoplePage key={`staff-${routeSearch}`} collection="staff" globalQuery=""/>}/><Route path="aivex" element={<AivexListPage key={routeSearch} globalQuery=""/>}/><Route path="aivex/:teamId" element={<AivexDetailPage key={pathname}/>}/><Route path="activity" element={<ActivityPage key={routeSearch} globalQuery=""/>}/><Route path="settings" element={<SettingsPage/>}/><Route path="*" element={<Navigate to="/admin/overview" replace/>}/></Routes>
  </AdminShell>
  {query.trim() && <div className="adm-global-results" role="region" aria-label={t('Global search results')}><header><Search size={15}/>{t('Search the workspace')}<button onClick={() => setQuery('')}>{t('Close')}</button></header>{searchResults.length ? searchResults.map(({ collection, record }) => <button key={`${collection}-${record.id}`} onClick={() => { navigate(collection === 'teams' ? preserveAivexLanguage(`/admin/aivex/${record.id}`) : `/admin/${collection}?record=${encodeURIComponent(record.id)}${collection === 'applications' ? `&stage=${record.status}` : ''}`); setQuery('') }}><span><b>{record.name}</b><small dir="ltr">{record.ref || record.email}</small></span><em>{collection === 'teams' ? 'AIVEX' : t(collection)}</em><FlowArrow size={15}/></button>) : <p>{t('No matching names or references.')}</p>}</div>}
  <Modal open={newAction} onClose={() => setNewAction(false)} title={t('What’s next?')} eyebrow={t('Quick actions')} closeLabel={t('Close')}><div className="adm-quick-actions">{[['Review Join applications', 'Meet the next generation of Infinity.', '/admin/applications', Users], ['Verify an AIVEX file', 'Continue the administrative review.', '/admin/aivex', FileText], ['Open the activity log', 'Trace a decision or document consultation.', '/admin/activity', Search]].map(([title, copy, route, Icon]) => <button key={route} onClick={() => { navigate(preserveAivexLanguage(route)); setNewAction(false) }}><Icon size={21}/><span><b>{t(title)}</b><small>{t(copy)}</small></span><FlowArrow size={17}/></button>)}</div></Modal>
  <Modal open={notifications} onClose={() => setNotifications(false)} title={t('Your review queue')} eyebrow={t('Notifications')} closeLabel={t('Close')}><div className="adm-quick-actions">{state.settings.reviewAlerts && pending.length ? pending.map((team) => <button key={team.id} onClick={() => { navigate(preserveAivexLanguage(`/admin/aivex/${team.id}`)); setNotifications(false) }}><FileText size={20}/><span><b>{team.name}</b><small>{t(team.document)}</small></span><FlowArrow size={16}/></button>) : <p>{t('No review notifications. You can change alert preferences in Settings.')}</p>}</div></Modal>
  <ToastStack toasts={toasts}/></div>
}

function SecureLoadingState() {
  return <div className="adm-auth-loading adm-app" role="status" aria-live="polite"><InfinityMark/><LockKeyhole size={20}/><div><b>Verifying administrative access</b><span>Infinity Administration · Secure session</span></div></div>
}

function ProtectedWorkspace() {
  const { status } = useAdminAuth()
  const location = useLocation()
  if (status === 'loading') return <SecureLoadingState/>
  if (status !== 'authenticated') {
    return <Navigate to={adminLoginPathFor(`${location.pathname}${location.search}${location.hash}`)} replace/>
  }
  return <AdminProvider><Workspace/></AdminProvider>
}

function LoginRoute() {
  const { status } = useAdminAuth()
  const [params] = useSearchParams()
  if (status === 'loading') return <SecureLoadingState/>
  if (status === 'authenticated') return <Navigate to={safeAdminReturnTo(params.get('returnTo'))} replace/>
  return <LoginPage/>
}

function AdminRoutes() {
  return <Routes><Route path="/admin/login" element={<LoginRoute/>}/><Route path="/admin/*" element={<ProtectedWorkspace/>}/></Routes>
}

export default function AdminApp() { return <AdminAuthProvider><AdminRoutes/></AdminAuthProvider> }
