import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, FileText, LockKeyhole, Search, Users } from 'lucide-react'
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import InfinityMark from '../components/InfinityMark'
import { adminHomePath, adminPathForRole, hasFullAdminWorkspace } from './adminAccess'
import { AdminAuthProvider, useAdminAuth } from './AdminAuth'
import { adminLoginPathFor } from './adminAuthPath'
import { useAdminAccent } from './adminAccent'
import { useAdminTheme, useThemeColor } from './adminTheme'
import { AdminProvider, useAdmin } from './AdminStore'
import {
  AdminPreferencesProvider, useAdminPreferences, useAdminReviewQueue,
} from './AdminPreferences'
import { AdminShell, AivexOnlyShell, Button, Modal, ToastStack } from './AdminUI'
import ApplicationsPage from './ApplicationsPage'
import DirectoryPage from './DirectoryPage'
import { OverviewPage } from './AdminPages'
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
  const { user } = useAdminAuth()
  const { effectiveReducedMotion, preferences } = useAdminPreferences()
  const [accent] = useAdminAccent()
  const { theme } = useAdminTheme()
  const rootRef = useRef(null)
  useThemeColor(rootRef, '--adm-canvas', `${theme} ${accent}`)
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
  const reviewQueue = useAdminReviewQueue(
    hasFullAdminWorkspace(user.role) && preferences.reviewNotificationsEnabled,
  )
  const wrapperClassName = [
    'adm-admin-root',
    preferences.tableDensity === 'compact' && 'adm-density-compact',
    effectiveReducedMotion && 'adm-reduced-motion',
    isArabicAivex && 'is-aivex-ar',
  ].filter(Boolean).join(' ')
  useEffect(() => {
    document.title = isArabicAivex ? 'إدارة Infinity Club' : 'Infinity Club Administration'
    window.scrollTo(0, 0)
  }, [pathname, isArabicAivex])
  useEffect(() => {
    const handler = (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'k') { event.preventDefault(); document.querySelector('.adm-global-search input')?.focus() } if (event.key === 'Escape') { setMobileOpen(false); setQuery('') } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  // Protected directory records are searched by their own authenticated pages.
  // Global search stays on the legacy team collection until a cross-resource
  // server endpoint is available, so stale local people records never surface.
  const searchResults = query.trim() ? state.teams.filter((r) => `${r.name} ${r.ref || ''}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8).map((record) => ({ collection: 'teams', record })) : []
  if (!hasFullAdminWorkspace(user.role)) {
    return <div ref={rootRef} className={wrapperClassName} data-accent={accent} data-theme={theme} dir={isArabicAivex ? 'rtl' : 'ltr'} lang={language}>
      <a href="#admin-content" className="adm-skip-link">{t('Skip to workspace')}</a>
      <AivexOnlyShell>
        <Routes>
          <Route index element={<Navigate to={adminHomePath(user.role)} replace/>}/>
          <Route path="aivex" element={<AivexListPage key={routeSearch} globalQuery=""/>}/>
          <Route path="aivex/:teamId" element={<AivexDetailPage key={pathname}/>}/>
          <Route path="*" element={<Navigate to={adminHomePath(user.role)} replace/>}/>
        </Routes>
      </AivexOnlyShell>
      <ToastStack toasts={toasts}/>
    </div>
  }
  const openNotifications = () => {
    if (preferences.reviewNotificationsEnabled) reviewQueue.refresh()
    setNotifications(true)
  }
  return <div ref={rootRef} className={wrapperClassName} data-accent={accent} data-theme={theme} dir={isArabicAivex ? 'rtl' : 'ltr'} lang={language}><a href="#admin-content" className="adm-skip-link">{t('Skip to workspace')}</a><AdminShell collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} query={query} setQuery={setQuery} onNotifications={openNotifications} hasNotifications={preferences.reviewNotificationsEnabled && reviewQueue.items.length > 0} onNewAction={() => setNewAction(true)} badges={{ aivex: preferences.reviewNotificationsEnabled ? reviewQueue.items.length : 0 }}>
    <Routes><Route index element={<Navigate to="/admin/overview" replace/>}/><Route path="overview" element={<OverviewPage/>}/><Route path="applications" element={<ApplicationsPage key={`applications-${routeSearch}`}/>}/><Route path="members" element={<DirectoryPage key={`members-${routeSearch}`} kind="members"/>}/><Route path="staff" element={<DirectoryPage key={`staff-${routeSearch}`} kind="staff"/>}/><Route path="aivex" element={<AivexListPage key={routeSearch} globalQuery=""/>}/><Route path="aivex/:teamId" element={<AivexDetailPage key={pathname}/>}/><Route path="activity" element={<ActivityPage key={routeSearch} globalQuery=""/>}/><Route path="settings" element={<SettingsPage/>}/><Route path="*" element={<Navigate to="/admin/overview" replace/>}/></Routes>
  </AdminShell>
  {query.trim() && <div className="adm-global-results" role="region" aria-label={t('Global search results')}><header><Search size={15}/>{t('Search the workspace')}<button onClick={() => setQuery('')}>{t('Close')}</button></header>{searchResults.length ? searchResults.map(({ collection, record }) => <button key={`${collection}-${record.id}`} onClick={() => { navigate(collection === 'teams' ? preserveAivexLanguage(`/admin/aivex/${record.id}`) : `/admin/${collection}?record=${encodeURIComponent(record.id)}${collection === 'applications' ? `&stage=${record.status}` : ''}`); setQuery('') }}><span><b>{record.name}</b><small dir="ltr">{record.ref || record.email}</small></span><em>{collection === 'teams' ? 'AIVEX' : t(collection)}</em><FlowArrow size={15}/></button>) : <p>{t('No matching names or references.')}</p>}</div>}
  <Modal open={newAction} onClose={() => setNewAction(false)} title={t('What’s next?')} eyebrow={t('Quick actions')} closeLabel={t('Close')}><div className="adm-quick-actions">{[['Review Join applications', 'Meet the next generation of Infinity.', '/admin/applications', Users], ['Verify an AIVEX file', 'Continue the administrative review.', '/admin/aivex', FileText], ['Open the activity log', 'Trace a decision or document consultation.', '/admin/activity', Search]].map(([title, copy, route, Icon]) => <button key={route} onClick={() => { navigate(preserveAivexLanguage(route)); setNewAction(false) }}><Icon size={21}/><span><b>{t(title)}</b><small>{t(copy)}</small></span><FlowArrow size={17}/></button>)}</div></Modal>
  <Modal open={notifications} onClose={() => setNotifications(false)} title={t('Your review queue')} eyebrow={t('Notifications')} closeLabel={t('Close')}><div className="adm-quick-actions">
    {!preferences.reviewNotificationsEnabled
      ? <p>Review notifications are disabled in Settings.</p>
      : reviewQueue.status === 'loading'
        ? <p role="status">Loading the live AIVEX review queue...</p>
        : reviewQueue.status === 'error'
          ? <div className="adm-notification-error" role="alert"><p>{reviewQueue.error}</p><Button variant="secondary" onClick={reviewQueue.refresh}>Retry</Button></div>
          : reviewQueue.items.length
            ? reviewQueue.items.map((item) => <button key={item.reference} onClick={() => { navigate(preserveAivexLanguage(`/admin/aivex/${item.reference}`)); setNotifications(false) }}><FileText size={20}/><span><b>{item.teamName}</b><small>{t(item.label)}</small></span><FlowArrow size={16}/></button>)
            : <p>{t('No review notifications. You can change alert preferences in Settings.')}</p>}
  </div></Modal>
  <ToastStack toasts={toasts}/></div>
}

function SecureLoadingState({ title = 'Verifying administrative access' }) {
  const { theme } = useAdminTheme()
  const rootRef = useRef(null)
  useThemeColor(rootRef, '--adm-deep', theme)
  return <div ref={rootRef} className="adm-auth-loading adm-app" data-theme={theme} role="status" aria-live="polite"><InfinityMark/><LockKeyhole size={20}/><div><b>{title}</b><span>Infinity Administration · Secure session</span></div></div>
}

function ProtectedWorkspace() {
  const { status } = useAdminAuth()
  const location = useLocation()
  if (status === 'loading') return <SecureLoadingState/>
  if (status !== 'authenticated') {
    return <Navigate to={adminLoginPathFor(`${location.pathname}${location.search}${location.hash}`)} replace/>
  }
  return <AdminPreferencesProvider><PreferencesWorkspace/></AdminPreferencesProvider>
}

function PreferencesWorkspace() {
  const { status } = useAdminPreferences()
  if (status === 'loading') return <SecureLoadingState title="Loading workspace preferences"/>
  return <AdminProvider><Workspace/></AdminProvider>
}

function LoginRoute() {
  const { status, user } = useAdminAuth()
  const [params] = useSearchParams()
  if (status === 'loading') return <SecureLoadingState/>
  if (status === 'authenticated') return <Navigate to={adminPathForRole(user.role, params.get('returnTo'))} replace/>
  return <LoginPage/>
}

function AdminRoutes() {
  return <Routes><Route path="/admin/login" element={<LoginRoute/>}/><Route path="/admin/*" element={<ProtectedWorkspace/>}/></Routes>
}

export default function AdminApp() { return <AdminAuthProvider><AdminRoutes/></AdminAuthProvider> }
