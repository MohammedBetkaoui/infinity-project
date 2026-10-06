import { useEffect, useId, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowRight, Bell, BriefcaseBusiness, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, Circle, FileClock, FileText,
  Filter, LayoutDashboard, LockKeyhole, LogOut, Menu, Moon, MoreHorizontal, Plus,
  Search, Settings, ShieldCheck, Sun, Trophy, UserCog, Users, X,
} from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import InfinityMark from '../components/InfinityMark'
import { useAdminAuth } from './AdminAuth'
import { navItems } from './adminData'
import { aivexPath, translateAivex } from './AivexI18n'
import { STATUS_TRANSLATIONS } from './adminModel'
import { useDialogMotion, usePageFade, useToastMotion } from './adminMotion'
import { useEffectiveReducedMotion } from './AdminPreferences'
import { useThemeSwitch } from './adminTheme'

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
// A stable pastel per person, so the same initials always keep the same tint.
const avatarTone = (initials = '') => [...String(initials)].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 6

export function IconButton({ label, children, className = '', ...props }) {
  return <button className={`adm-icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>
}

export function StatusBadge({ children, tone }) {
  const key = (tone || String(children)).toLowerCase().replaceAll(' ', '-').replaceAll('/', '-')
  return <span title={STATUS_TRANSLATIONS[children]} className={`adm-status adm-status--${key}`}><i aria-hidden="true" />{children}</span>
}

export function Avatar({ initials, small = false }) {
  return <span className={`adm-avatar ${small ? 'is-small' : ''}`} data-tone={avatarTone(initials)} aria-hidden="true">{initials}</span>
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

export function SearchField({ value, onChange, placeholder = 'Search', className = '', label = 'Search', clearLabel = 'Clear search', shortcut }) {
  return (
    <label className={`adm-search ${className}`}>
      <Search size={17} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-keyshortcuts={shortcut ? 'Control+K Meta+K' : undefined} />
      {value ? <button type="button" onClick={() => onChange('')} aria-label={clearLabel}><X size={14} /></button> : shortcut && <kbd className="adm-search__hint" aria-hidden="true">{shortcut}</kbd>}
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

export function SectionHeading({ title, meta, action }) {
  return (
    <div className="adm-section-heading">
      <div><h2>{title}</h2>{meta && <small>{meta}</small>}</div>
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

export function Tabs({ items, value, onChange, counts = {}, getLabel = (item) => item, orientation, className = '', label }) {
  const vertical = orientation === 'vertical'
  // Arrow keys move between tabs (vertical lists use up/down as well).
  const move = (event) => {
    const keys = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    const forward = event.key === 'ArrowDown' || event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')
    const index = items.indexOf(value)
    const next = items[(index + (forward ? 1 : -1) + items.length) % items.length]
    onChange(next)
    event.currentTarget.querySelector(`[data-tab="${CSS.escape(next)}"]`)?.focus()
  }
  return (
    <div className={`adm-tabs ${vertical ? 'is-vertical' : ''} ${className}`.trim()} role="tablist" aria-orientation={vertical ? 'vertical' : undefined} aria-label={label} onKeyDown={move}>
      {items.map((item) => <button role="tab" data-tab={item} aria-selected={value === item} tabIndex={value === item ? 0 : -1} className={value === item ? 'is-active' : ''} key={item} onClick={() => onChange(item)}>{getLabel(item)}{counts[item] != null && <span>{counts[item]}</span>}</button>)}
    </div>
  )
}

// A compact pill switch for mutually exclusive views or ranges.
export function SegmentedControl({ options, value, onChange, label, className = '' }) {
  const index = Math.max(0, options.findIndex((option) => option.value === value))
  const move = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    const forward = ['ArrowDown', rtl ? 'ArrowLeft' : 'ArrowRight'].includes(event.key)
    const next = options[(index + (forward ? 1 : -1) + options.length) % options.length]
    onChange(next.value)
    event.currentTarget.querySelector(`[data-value="${CSS.escape(next.value)}"]`)?.focus()
  }
  return <div className={`adm-segmented ${className}`.trim()} role="radiogroup" aria-label={label} onKeyDown={move} style={{ '--adm-segment': index, '--adm-segments': options.length }}>
    <span className="adm-segmented__thumb" aria-hidden="true"/>
    {options.map((option) => <button key={option.value} type="button" role="radio" data-value={option.value} aria-checked={option.value === value} tabIndex={option.value === value ? 0 : -1} className={option.value === value ? 'is-active' : ''} onClick={() => onChange(option.value)}>{option.icon}{option.label}</button>)}
  </div>
}

// Filter chips: one choice at a time, each with its live count.
export function ChipGroup({ options, value, onChange, label }) {
  return <div className="adm-chips" role="group" aria-label={label}>
    {options.map((option) => <button key={option.value || 'all'} type="button" aria-pressed={option.value === value} className={option.value === value ? 'is-active' : ''} onClick={() => onChange(option.value)}>{option.label}{option.count != null && <span>{option.count}</span>}</button>)}
  </div>
}

export function Modal({ open, onClose, title, eyebrow = 'Confirmation', children, footer, wide = false, className = '', closeLabel = 'Close' }) {
  const ref = useRef(null)
  const layer = useRef(null)
  const titleId = useId()
  useDialog(ref, open, onClose)
  useDialogMotion(layer, { kind: 'modal', active: open, exit: !className.includes('is-document-viewer') })
  if (!open) return null
  return (
    <div ref={layer} className="adm-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={ref} tabIndex={-1} className={`adm-modal ${wide ? 'is-wide' : ''} ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header><div><p className="adm-eyebrow">{eyebrow}</p><h2 id={titleId}>{title}</h2></div><IconButton label={closeLabel} onClick={onClose}><X size={19} /></IconButton></header>
        <div className="adm-modal__body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  )
}

function Toast({ toast }) {
  const ref = useRef(null)
  useToastMotion(ref)
  return <div ref={ref} className="adm-toast"><CheckCircle2 size={18} /><div><b>{toast.title}</b><span>{toast.message}</span></div></div>
}

export function ToastStack({ toasts }) {
  return <div className="adm-toasts" aria-live="polite">{toasts.map((toast) => <Toast key={toast.id} toast={toast}/>)}</div>
}

// Apple keyboards show ⌘K; everyone else reads the Ctrl shortcut that works for them.
const SEARCH_SHORTCUT = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '') ? '⌘K' : 'Ctrl K'

function Sidebar({ collapsed, setCollapsed, mobileOpen, setMobileOpen, language = 'en', badges = {} }) {
  const navigate = useNavigate()
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
    const badge = badges[item.icon] || 0
    return (
      <NavLink
        key={item.path}
        to={item.icon === 'aivex' ? aivexPath(item.path, language) : item.path}
        onClick={() => setMobileOpen(false)}
        className={({ isActive }) => `${isActive ? 'is-active' : ''} ${item.icon === 'aivex' ? 'is-aivex' : ''}`}
        title={collapsed ? t(item.label) : undefined}
      >
        <Icon size={19} aria-hidden="true" />
        <span className="adm-nav-label">{t(item.label)}</span>
        {badge > 0 && <em><span aria-hidden="true">{badge}</span><span className="sr-only">{badge} {t('to review')}</span></em>}
      </NavLink>
    )
  }
  return (
    <aside className={`adm-sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
      <div className="adm-brand">
        <div className="adm-brand__mark"><InfinityMark /></div>
        <div className="adm-brand__copy"><strong>INFINITY</strong><span>{t('Club administration')}</span></div>
        <IconButton label={t('Close navigation')} className="adm-sidebar-mobile-close" onClick={() => setMobileOpen(false)}><X size={18} /></IconButton>
      </div>
      <div className="adm-sidebar__campaign"><span>{t('Academic cycle')}</span><b>2026—27</b><small>{t('Autumn intake · Active')}</small><i /></div>
      <nav aria-label={isArabic ? 'إدارة Infinity' : 'Administration'}>
        <div className="adm-nav-group">
          <div className="adm-nav-group__label"><span>{t('Club workspace')}</span></div>
          {navItems.slice(0, 4).map(renderNavItem)}
        </div>
        <div className="adm-nav-group">
          <div className="adm-nav-group__label"><span>{t('Operations')}</span></div>
          {navItems.slice(4, 6).map(renderNavItem)}
        </div>
        <div className="adm-nav-group adm-nav-group--system">
          <div className="adm-nav-group__label"><span>{t('System')}</span></div>
          {navItems.slice(6).map(renderNavItem)}
        </div>
      </nav>
      <div className="adm-sidebar__foot">
        <button className="adm-admin-profile" onClick={() => navigate('/admin/settings')} title={collapsed ? user.displayName : undefined}>
          <Avatar initials={initialsFor(user.displayName)} small />
          <span><b>{user.displayName}</b><small>@{user.username}</small><em>{roleLabel(user.role)}</em></span>
          <MoreHorizontal size={17} aria-hidden="true" />
        </button>
        <button className="adm-signout" onClick={signOut} disabled={signingOut} title={collapsed ? t('Sign out') : undefined}><LogOut size={18} aria-hidden="true" /><span>{signingOut ? t('Signing out…') : t('Sign out')}</span></button>
        <button className="adm-collapse" onClick={() => setCollapsed(!collapsed)} aria-label={t(collapsed ? 'Expand sidebar' : 'Collapse navigation')}><ChevronLeft size={18} aria-hidden="true" /><span>{t(collapsed ? 'Expand' : 'Collapse navigation')}</span></button>
      </div>
    </aside>
  )
}

// A zero-height sentinel tells the sticky bar when it has left the panel's
// rounded top edge, so it can square its corners and lift with a shadow.
function useStuckSentinel() {
  const sentinel = useRef(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const node = sentinel.current
    if (!node || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return [sentinel, stuck]
}

// One press switches between light and dark; Settings › Appearance also offers
// following the device.
export function ThemeToggle({ label }) {
  const reducedMotion = useEffectiveReducedMotion()
  const { theme, choose } = useThemeSwitch(reducedMotion)
  const dark = theme === 'dark'
  return <button type="button" className="adm-icon-button adm-theme-toggle" aria-label={label} aria-pressed={dark} title={label} onClick={() => choose(dark ? 'light' : 'dark')}>{dark ? <Moon size={19} aria-hidden="true"/> : <Sun size={19} aria-hidden="true"/>}</button>
}

function Topbar({ setMobileOpen, query, setQuery, notify, hasNotifications, onNewAction, language = 'en' }) {
  const navigate = useNavigate()
  const { user } = useAdminAuth()
  const [sentinel, stuck] = useStuckSentinel()
  const isArabic = language === 'ar'
  const t = (value) => translateAivex(value, language)
  return (
    <>
      <span ref={sentinel} className="adm-topbar-sentinel" aria-hidden="true" />
      <header className={`adm-topbar ${stuck ? 'is-stuck' : ''}`}>
        <IconButton label={t('Open navigation')} className="adm-menu-trigger" onClick={() => setMobileOpen(true)}><Menu size={20} /></IconButton>
        <SearchField value={query} onChange={setQuery} placeholder={t('Search anything…')} label={t('Search anything…')} clearLabel={isArabic ? 'مسح البحث' : 'Clear search'} className="adm-global-search" shortcut={SEARCH_SHORTCUT} />
        <div className="adm-topbar__right">
          <ThemeToggle label={t('Dark theme')} />
          <IconButton label={t('Notifications')} className="adm-notification" onClick={notify}><Bell size={19} />{hasNotifications && <i />}</IconButton>
          <Button onClick={onNewAction} icon={<Plus size={17} />} className="adm-new-action"><span className="adm-new-action__label">{t('New action')}</span></Button>
          <button className="adm-top-profile" aria-label={`${t('Open profile')}: ${user.displayName}`} onClick={() => navigate('/admin/settings')}><Avatar initials={initialsFor(user.displayName)} small /><span><b>{user.displayName}</b><small>@{user.username} · {roleLabel(user.role)}</small></span></button>
        </div>
      </header>
    </>
  )
}

export function AdminShell({ children, collapsed, setCollapsed, mobileOpen, setMobileOpen, query, setQuery, onNotifications, hasNotifications, onNewAction, badges }) {
  const { pathname, search } = useLocation()
  const language = pathname.startsWith('/admin/aivex') && new URLSearchParams(search).get('lang') === 'ar' ? 'ar' : 'en'
  const isArabic = language === 'ar'
  const t = (value) => translateAivex(value, language)
  const livePeopleWorkspace = ['/admin/applications', '/admin/members', '/admin/staff'].includes(pathname)
  const mainRef = useRef(null)
  usePageFade(mainRef, pathname)
  return (
    <div className={`adm-app ${collapsed ? 'is-sidebar-collapsed' : ''} ${isArabic ? 'is-aivex-ar' : ''}`} dir={isArabic ? 'rtl' : 'ltr'} lang={language}>
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} language={language} badges={badges} />
      {mobileOpen && <button className="adm-mobile-scrim" aria-label={t('Close navigation')} onClick={() => setMobileOpen(false)} />}
      <div className="adm-workspace">
        <Topbar setMobileOpen={setMobileOpen} query={query} setQuery={setQuery} notify={onNotifications} hasNotifications={hasNotifications} onNewAction={onNewAction} language={language} />
        <main ref={mainRef} className="adm-main" id="admin-content">{children}</main>
        <footer className="adm-global-footer"><span><i />{livePeopleWorkspace ? 'Protected workspace · Live database records' : t('Protected workspace · Live database records')}</span></footer>
      </div>
    </div>
  )
}

export function AivexOnlyShell({ children }) {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAdminAuth()
  const [signingOut, setSigningOut] = useState(false)
  const [sentinel, stuck] = useStuckSentinel()
  const mainRef = useRef(null)
  usePageFade(mainRef, pathname)
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
      <div className="adm-workspace">
        <span ref={sentinel} className="adm-topbar-sentinel" aria-hidden="true" />
        <header className={`adm-aivex-accessbar ${stuck ? 'is-stuck' : ''}`}>
          <div className="adm-aivex-accessbar__brand" aria-label="Infinity Club AIVEX administration">
            <span className="adm-aivex-accessbar__mark"><InfinityMark/></span>
            <span><b>INFINITY</b><small>{t('AIVEX administration')}</small></span>
          </div>
          <div className="adm-aivex-accessbar__session">
            <span className="adm-aivex-accessbar__status"><i/>{t('Secure AIVEX workspace')}</span>
            <span className="adm-aivex-accessbar__identity"><Avatar initials={initialsFor(user.displayName)} small/><span><b>{user.displayName}</b><small>@{user.username} · {roleLabel(user.role)}</small></span></span>
            <ThemeToggle label={t('Dark theme')} />
            <button className="adm-aivex-accessbar__logout" type="button" onClick={signOut} disabled={signingOut}>
              <LogOut size={17}/><span>{signingOut ? t('Signing out…') : t('Sign out')}</span>
            </button>
          </div>
        </header>
        <main ref={mainRef} className="adm-main" id="admin-content">{children}</main>
        <footer className="adm-global-footer"><span><i/>{t('Protected AIVEX administration · Live records')}</span></footer>
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
  const layer = useRef(null)
  const titleId = useId()
  useDialog(ref, true, onClose)
  useDialogMotion(layer, { kind: 'drawer' })
  return <div ref={layer} className="adm-drawer-layer"><button className="adm-drawer-scrim" onClick={onClose} tabIndex={-1} aria-label={closeLabel} /><aside ref={ref} className={`adm-drawer ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId}><header className="adm-drawer__head"><div><p className="adm-eyebrow">{eyebrow}</p><h2 id={titleId}>{title}</h2></div><IconButton label={closeLabel} onClick={onClose}><X size={20}/></IconButton></header><div className="adm-drawer__scroll">{children}</div>{footer && <footer className="adm-drawer__actions">{footer}</footer>}</aside></div>
}
