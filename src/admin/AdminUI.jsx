import { useEffect, useId, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowRight, Bell, BriefcaseBusiness, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, Circle, FileClock, FileText,
  Filter, LayoutDashboard, LockKeyhole, LogOut, Menu, MoreHorizontal, Plus,
  Search, Settings, ShieldCheck, Trophy, UserCog, Users, X,
} from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import InfinityMark from '../components/InfinityMark'
import { useAdminAuth } from './AdminAuth'
import { navItems } from './adminData'
import { useAdmin } from './AdminStore'
import { aivexPath, translateAivex } from './AivexI18n'
import { STATUS_TRANSLATIONS } from './adminModel'

const icons = {
  overview: LayoutDashboard,
  applications: FileText,
  members: Users,
  staff: UserCog,
  aivex: Trophy,
  activity: FileClock,
  settings: Settings,
}

const initialsFor = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'IA'
const roleLabel = (role = '') => role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export function IconButton({ label, children, className = '', ...props }) {
  return <button className={`adm-icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>
}

export function StatusBadge({ children, tone }) {
  const key = (tone || String(children)).toLowerCase().replaceAll(' ', '-').replaceAll('/', '-')
  return <span title={STATUS_TRANSLATIONS[children]} className={`adm-status adm-status--${key}`}><i aria-hidden="true" />{children}</span>
}

export function Avatar({ initials, small = false }) {
  return <span className={`adm-avatar ${small ? 'is-small' : ''}`} aria-hidden="true">{initials}</span>
}

export function Progress({ value, label = 'Completeness' }) {
  return (
    <div className="adm-progress" aria-label={`${label}: ${value}%`}>
      <div className="adm-progress__track"><span style={{ width: `${value}%` }} /></div>
      <b>{value}%</b>
    </div>
  )
}

export function Button({ children, variant = 'primary', icon, className = '', ...props }) {
  return <button className={`adm-button adm-button--${variant} ${className}`} {...props}>{children}{icon}</button>
}

export function SearchField({ value, onChange, placeholder = 'Search', className = '', label = 'Search', clearLabel = 'Clear search' }) {
  return (
    <label className={`adm-search ${className}`}>
      <Search size={17} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {value && <button type="button" onClick={() => onChange('')} aria-label={clearLabel}><X size={14} /></button>}
    </label>
  )
}

export function FilterSelect({ label, value, onChange, children }) {
  return (
    <label className="adm-filter-select">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
  )
}

export function PageHeader({ eyebrow, title, description, actions, meta }) {
  return (
    <header className="adm-page-header">
      <div>
        <p className="adm-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="adm-page-subtitle">{description}</p>
      </div>
      <div className="adm-page-actions">{meta}{actions}</div>
    </header>
  )
}

export function SectionHeading({ index, title, meta, action }) {
  return (
    <div className="adm-section-heading">
      <div><span>{index}</span><h2>{title}</h2>{meta && <small>{meta}</small>}</div>
      {action}
    </div>
  )
}

export function EmptyState({ title = 'No results found', copy = 'Try adjusting your search or filters.' }) {
  return <div className="adm-empty"><Search size={22} /><h3>{title}</h3><p>{copy}</p></div>
}

export function Pagination({ current = 1, count = 0, pageSize = 6, onChange = () => {}, labels = {} }) {
  const total = Math.max(1, Math.ceil(count / pageSize))
  const start = count ? (current - 1) * pageSize + 1 : 0
  const end = Math.min(current * pageSize, count)
  return (
    <div className="adm-pagination" aria-label={labels.aria || 'Pagination'}>
      <p>{labels.summary ? labels.summary(start, end, count) : <>Showing <b>{start}–{end}</b> of <b>{count}</b> records</>}</p>
      <div>
        <IconButton label={labels.previous || 'Previous page'} disabled={current === 1} onClick={() => onChange(Math.max(1, current - 1))}><ChevronLeft size={16} /></IconButton>
        {Array.from({ length: total }, (_, index) => index + 1).map((page) => <button key={page} className={page === current ? 'is-current' : ''} onClick={() => onChange(page)}>{page}</button>)}
        <IconButton label={labels.next || 'Next page'} disabled={current === total} onClick={() => onChange(Math.min(total, current + 1))}><ChevronRight size={16} /></IconButton>
      </div>
    </div>
  )
}

export function Tabs({ items, value, onChange, counts = {}, getLabel = (item) => item }) {
  return (
    <div className="adm-tabs" role="tablist">
      {items.map((item) => <button role="tab" aria-selected={value === item} className={value === item ? 'is-active' : ''} key={item} onClick={() => onChange(item)}>{getLabel(item)}{counts[item] != null && <span>{counts[item]}</span>}</button>)}
    </div>
  )
}

export function Modal({ open, onClose, title, eyebrow = 'Confirmation', children, footer, wide = false, className = '', closeLabel = 'Close' }) {
  const ref = useRef(null)
  const titleId = useId()
  useDialog(ref, open, onClose)
  if (!open) return null
  return (
    <div className="adm-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={ref} tabIndex={-1} className={`adm-modal ${wide ? 'is-wide' : ''} ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header><div><p className="adm-eyebrow">{eyebrow}</p><h2 id={titleId}>{title}</h2></div><IconButton label={closeLabel} onClick={onClose}><X size={19} /></IconButton></header>
        <div className="adm-modal__body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  )
}

export function ToastStack({ toasts }) {
  return <div className="adm-toasts" aria-live="polite">{toasts.map((toast) => <div className="adm-toast" key={toast.id}><CheckCircle2 size={18} /><div><b>{toast.title}</b><span>{toast.message}</span></div></div>)}</div>
}

function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen, language = 'en' }) {
  const navigate = useNavigate()
  const { state } = useAdmin()
  const { user, logout } = useAdminAuth()
  const [signingOut, setSigningOut] = useState(false)
  const isArabic = language === 'ar'
  const t = (value) => translateAivex(value, language)
  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    await logout()
    navigate('/admin/login', { replace: true })
  }
  const renderNavItem = (item) => {
    const Icon = icons[item.icon]
    const count = item.icon === 'aivex'
        ? state.teams.filter((team) => ['Signed document received', 'Under review', 'Corrections needed'].includes(team.document)).length
        : 0
    return (
      <NavLink
        key={item.path}
        to={item.icon === 'aivex' ? aivexPath(item.path, language) : item.path}
        onClick={() => setMobileOpen(false)}
        className={({ isActive }) => `${isActive ? 'is-active' : ''} ${item.icon === 'aivex' ? 'is-aivex' : ''}`}
        title={collapsed ? t(item.label) : undefined}
      >
        <span className="adm-nav-index">{item.index}</span>
        <span className="adm-nav-node" aria-hidden="true" />
        <Icon size={17} />
        <span className="adm-nav-label">{t(item.label)}</span>
        {count > 0 && <em>{String(count).padStart(2, '0')}</em>}
      </NavLink>
    )
  }
  return (
    <aside className={`adm-sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
      <div className="adm-brand">
        <div className="adm-brand__mark"><InfinityMark /></div>
        <div className="adm-brand__copy"><strong>INFINITY</strong><span>{t('Club administration')}</span></div>
        <code className="adm-brand__unit">CTRL<br/>02</code>
        <IconButton label={t('Close navigation')} className="adm-sidebar-mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></IconButton>
      </div>
      <div className="adm-sidebar__campaign"><span>{t('Academic cycle')}</span><b>2026—27</b><small>{t('Autumn intake · Active')}</small><i /></div>
      <nav aria-label={isArabic ? 'إدارة Infinity' : 'Administration'}>
        <div className="adm-nav-group">
          <div className="adm-nav-group__label"><span>{t('Club workspace')}</span><code>04</code></div>
          {navItems.slice(0, 4).map(renderNavItem)}
        </div>
        <div className="adm-nav-group">
          <div className="adm-nav-group__label"><span>{t('Operations')}</span><code>02</code></div>
          {navItems.slice(4, 6).map(renderNavItem)}
        </div>
        <div className="adm-nav-group adm-nav-group--system">
          <div className="adm-nav-group__label"><span>{t('System')}</span><code>01</code></div>
          {navItems.slice(6).map(renderNavItem)}
        </div>
      </nav>
      <div className="adm-sidebar__signal"><span><i />{t('Operations online')}</span><code>SECURE / DB</code></div>
      <div className="adm-sidebar__foot">
        <span className="adm-sidebar__operator-label">{t('Session holder')} · @{user.username}</span>
        <button className="adm-admin-profile" onClick={() => navigate('/admin/settings')}>
          <Avatar initials={initialsFor(user.displayName)} small />
          <span><b>{user.displayName}</b><small>@{user.username}</small><em>{roleLabel(user.role)}</em></span>
          <MoreHorizontal size={17} />
        </button>
        <button className="adm-signout" onClick={signOut} disabled={signingOut}><LogOut size={17} /><span>{signingOut ? t('Signing out…') : t('Sign out')}</span></button>
      </div>
      <button className="adm-collapse" onClick={() => setCollapsed(!collapsed)} aria-label={t(collapsed ? 'Expand sidebar' : 'Collapse navigation')}><ChevronLeft size={16} /><span>{t(collapsed ? 'Expand' : 'Collapse navigation')}</span></button>
    </aside>
  )
}

const breadcrumbNames = { overview: 'Overview', applications: 'Join applications', members: 'Members', staff: 'Staff', aivex: 'AIVEX files', activity: 'Activity log', settings: 'Settings' }

function Topbar({ setMobileOpen, query, setQuery, notify, onNewAction, language = 'en' }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user } = useAdminAuth()
  const isArabic = language === 'ar'
  const t = (value) => translateAivex(value, language)
  const parts = pathname.split('/').filter(Boolean)
  const page = breadcrumbNames[parts[1]] || 'Administration'
  const teamDetail = parts[1] === 'aivex' && parts[2]
  return (
    <header className="adm-topbar">
      <div className="adm-topbar__left">
        <IconButton label={t('Open navigation')} className="adm-menu-trigger" onClick={() => setMobileOpen(true)}><Menu size={20} /></IconButton>
        <div className="adm-breadcrumb"><span>{t('Infinity administration')}</span><ChevronRight size={13} /><b>{t(page)}</b>{teamDetail && <><ChevronRight size={13} /><b className="adm-breadcrumb__detail">{t('Team file')}</b></>}</div>
      </div>
      <div className="adm-topbar__right">
        <SearchField value={query} onChange={setQuery} placeholder={t('Search anything…')} label={t('Search anything…')} clearLabel={isArabic ? 'مسح البحث' : 'Clear search'} className="adm-global-search" />
        <IconButton label={t('Notifications')} className="adm-notification" onClick={notify}><Bell size={18} /><i /></IconButton>
        <Button onClick={onNewAction} icon={<Plus size={16} />}>{t('New action')}</Button>
        <button className="adm-top-profile" aria-label={`${t('Open profile')}: ${user.displayName}`} onClick={() => navigate('/admin/settings')}><Avatar initials={initialsFor(user.displayName)} small /><span><b>{user.displayName}</b><small>@{user.username} · {roleLabel(user.role)}</small></span><ChevronDown size={14} /></button>
      </div>
    </header>
  )
}

export function AdminShell({ children, collapsed, setCollapsed, mobileOpen, setMobileOpen, query, setQuery, onNotifications, onNewAction }) {
  const { pathname, search } = useLocation()
  const language = pathname.startsWith('/admin/aivex') && new URLSearchParams(search).get('lang') === 'ar' ? 'ar' : 'en'
  const isArabic = language === 'ar'
  const t = (value) => translateAivex(value, language)
  const livePeopleWorkspace = ['/admin/applications', '/admin/members', '/admin/staff'].includes(pathname)
  return (
    <div className={`adm-app ${collapsed ? 'is-sidebar-collapsed' : ''} ${isArabic ? 'is-aivex-ar' : ''}`} dir={isArabic ? 'rtl' : 'ltr'} lang={language}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} language={language} />
      {mobileOpen && <button className="adm-mobile-scrim" aria-label={t('Close navigation')} onClick={() => setMobileOpen(false)} />}
      <div className="adm-workspace">
        <Topbar setMobileOpen={setMobileOpen} query={query} setQuery={setQuery} notify={onNotifications} onNewAction={onNewAction} language={language} />
        <main className="adm-main" id="admin-content">{children}</main>
        <footer className="adm-global-footer"><span><i />{livePeopleWorkspace ? 'Protected workspace · Live database records' : t('Fictional demo data · Local prototype')}</span><code>INFINITY / ADMIN · 2026.09</code></footer>
      </div>
    </div>
  )
}

export function AivexOnlyShell({ children }) {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAdminAuth()
  const [signingOut, setSigningOut] = useState(false)
  const language = pathname.startsWith('/admin/aivex') && new URLSearchParams(search).get('lang') === 'ar' ? 'ar' : 'en'
  const isArabic = language === 'ar'
  const t = (value) => translateAivex(value, language)
  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    await logout()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className={`adm-app adm-aivex-standalone ${isArabic ? 'is-aivex-ar' : ''}`} dir={isArabic ? 'rtl' : 'ltr'} lang={language}>
      <header className="adm-aivex-accessbar">
        <div className="adm-aivex-accessbar__brand" aria-label="Infinity Club AIVEX administration">
          <span className="adm-aivex-accessbar__mark"><InfinityMark/></span>
          <span><b>INFINITY</b><small>{t('AIVEX administration')}</small></span>
          <code>OPS / 02</code>
        </div>
        <div className="adm-aivex-accessbar__session">
          <span className="adm-aivex-accessbar__status"><i/>{t('Secure AIVEX workspace')}</span>
          <span className="adm-aivex-accessbar__identity"><Avatar initials={initialsFor(user.displayName)} small/><span><b>{user.displayName}</b><small>@{user.username} · {roleLabel(user.role)}</small></span></span>
          <button className="adm-aivex-accessbar__logout" type="button" onClick={signOut} disabled={signingOut}>
            <LogOut size={17}/><span>{signingOut ? t('Signing out…') : t('Sign out')}</span>
          </button>
        </div>
      </header>
      <div className="adm-workspace">
        <main className="adm-main" id="admin-content">{children}</main>
        <footer className="adm-global-footer"><span><i/>{t('Protected AIVEX administration · Live records')}</span><code>INFINITY / AIVEX · 2026.09</code></footer>
      </div>
    </div>
  )
}

export function BulkBar({ count, onClear, onStatus }) {
  if (!count) return null
  return <div className="adm-bulk"><span><Check size={15} />{count} selected</span>{onStatus && <button onClick={onStatus}>Change status</button>}<button onClick={onClear}>Clear selection</button></div>
}

export function FilterButton({ active, onClick }) {
  return <Button variant="secondary" onClick={onClick} icon={<Filter size={15} />}>Filters{active ? <span className="adm-filter-count">{active}</span> : null}</Button>
}

export function CriticalNotice({ children }) {
  return <div className="adm-critical-notice"><AlertTriangle size={18} /><p>{children}</p></div>
}

export function ConfidentialNotice({ title = 'Internal verification data.', copy = 'Access is logged. Do not copy, download or disclose personal documents outside the authorised review process.' }) {
  return <div className="adm-confidential-notice"><ShieldCheck size={18} /><p><b>{title}</b> {copy}</p></div>
}

export { ArrowRight, BriefcaseBusiness, Circle, LockKeyhole }

// Keep focus inside the topmost dialog and restore it to its trigger.
function useDialog(ref, open, onClose) {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    const node = ref.current
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusable = () => [...node.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex="0"]')].filter((el) => el.getClientRects().length)
    focusable()[0]?.focus()
    const handler = (event) => {
      const dialogs = [...document.querySelectorAll('[aria-modal="true"]')]
      if (dialogs.at(-1) !== node) return
      if (event.key === 'Escape') { event.preventDefault(); close.current() }
      if (event.key === 'Tab') {
        const items = focusable()
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus() }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus() }
      }
    }
    document.addEventListener('keydown', handler)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', handler); if (previous?.isConnected) previous.focus() }
  }, [open, ref])
}

export function Drawer({ title, eyebrow, children, onClose, footer, className = '', closeLabel = 'Close details' }) {
  const ref = useRef(null)
  const titleId = useId()
  useDialog(ref, true, onClose)
  return <div className="adm-drawer-layer"><button className="adm-drawer-scrim" onClick={onClose} tabIndex={-1} aria-label={closeLabel} /><aside ref={ref} className={`adm-drawer ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><header className="adm-drawer__head"><div><p className="adm-eyebrow">{eyebrow}</p><h2 id={titleId}>{title}</h2></div><IconButton label={closeLabel} onClick={onClose}><X size={20}/></IconButton></header><div className="adm-drawer__scroll">{children}</div>{footer && <footer className="adm-drawer__actions">{footer}</footer>}</aside></div>
}
