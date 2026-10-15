import { useCallback, useDeferredValue, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarClock, Check, CircleAlert, Eye, EyeOff, LoaderCircle, LockKeyhole, Monitor, Moon, RefreshCw, ShieldCheck, Sun, TriangleAlert, User } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import InfinityMark from '../components/InfinityMark'
import { useAdminAuth } from './AdminAuth'
import { useAdminPreferences } from './AdminPreferences'
import { ADMIN_ACCENTS, useAdminAccent } from './adminAccent'
import { ADMIN_THEMES, useAdminTheme, useThemeColor, useThemeSwitch } from './adminTheme'
import { safeAdminReturnTo } from './adminAuthPath'
import { useAdmin } from './AdminStore'
import { dateLabel, timeLabel } from './adminModel'
import { Button, PageHeader, SegmentedControl, StatusBadge, Tabs } from './AdminUI'
import { ActionDialog, Facts, RecordTable, RecordToolbar, SummaryStrip } from './AdminRecords'
import AivexCampaignSettings from './AivexCampaignSettings'
import AdminNotificationSettings from './AdminNotificationSettings'
import { useAdminAivexCampaignSettings } from './useAdminAivexCampaignSettings'
import { useAdminActivity } from './useAdminActivity'
import { formatCampaignDateTime } from '../../shared/aivex/campaign-schedule.js'

export function LoginPage() {
  const navigate = useNavigate()
  const { theme } = useAdminTheme()
  const rootRef = useRef(null)
  useThemeColor(rootRef, '--adm-deep', theme)
  const [params] = useSearchParams()
  const { login } = useAdminAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const result = await login(username, password)
    setBusy(false)
    if (!result.ok) {
      setError(result.message || 'Invalid username or password.')
      return
    }
    navigate(safeAdminReturnTo(params.get('returnTo')), { replace: true })
  }
  const updateCapsLock = (event) => setCapsLock(event.getModifierState?.('CapsLock') === true)
  const invalid = error ? true : undefined
  return (
    <main ref={rootRef} className="adm-login adm-app" data-theme={theme}>
      <div className="adm-login-backdrop" aria-hidden="true"><InfinityMark className="adm-login-emblem"/></div>
      <div className="adm-login-card">
        <header className="adm-login-head">
          <div className="adm-login-medallion"><InfinityMark/></div>
          <p className="adm-login-badge"><span aria-hidden="true"/>Secure admin access</p>
          <h1>Welcome back</h1>
          <p className="adm-login-lede">Sign in with your administrator credentials to open the Infinity Club workspace.</p>
        </header>
        <form className="adm-login-form" onSubmit={submit} aria-busy={busy}>
          <label className="adm-login-field">
            <span className="adm-login-label">Username</span>
            <span className="adm-login-control">
              <User className="adm-login-control-icon" size={18} aria-hidden="true"/>
              <input name="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck="false" autoFocus required disabled={busy} aria-invalid={invalid}/>
            </span>
          </label>
          <label className="adm-login-field">
            <span className="adm-login-label">Password</span>
            <span className="adm-login-control has-action">
              <LockKeyhole className="adm-login-control-icon" size={18} aria-hidden="true"/>
              <input name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={updateCapsLock} onKeyUp={updateCapsLock} onBlur={() => setCapsLock(false)} autoComplete="current-password" required disabled={busy} aria-invalid={invalid} aria-describedby={error ? 'admin-login-error' : undefined}/>
              <button type="button" className="adm-login-reveal" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} disabled={busy}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
            </span>
          </label>
          {capsLock && <p className="adm-caps-lock adm-login-hint" role="status"><TriangleAlert size={14} aria-hidden="true"/>Caps Lock is on.</p>}
          {error && <p id="admin-login-error" className="adm-auth-error" role="alert"><CircleAlert size={16} aria-hidden="true"/><span>{error}</span></p>}
          <Button type="submit" className={`adm-login-submit${busy ? ' is-loading' : ''}`} disabled={busy || !username || !password} icon={busy ? <LoaderCircle className="adm-spin" size={18}/> : <ArrowRight size={18}/>}>{busy ? 'Verifying access…' : 'Sign in'}</Button>
        </form>
        <footer className="adm-login-foot">
          <div className="adm-login-foot-row">
            <span className="adm-login-secure"><ShieldCheck size={15} aria-hidden="true"/>Secure session</span>
            <Link to="/" className="adm-login-back"><ArrowLeft size={14} aria-hidden="true"/>Back to site</Link>
          </div>
          <p>Restricted to authorized Infinity Club staff. Sign-in attempts are rate-limited and monitored.</p>
        </footer>
      </div>
      <p className="adm-login-caption" aria-hidden="true">Infinity is a mindset.</p>
    </main>
  )
}

export function ActivityPage() {
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search.trim())
  const requestedSensitivity = String(params.get('sensitivity') || '').toLowerCase()
  const [filters, setFilters] = useState(
    ['standard', 'confidential'].includes(requestedSensitivity) ? { sensitivity: requestedSensitivity } : {},
  )
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ key: 'at', asc: false })
  const [detail, setDetail] = useState(null)
  const sortKeys = {
    at: 'created', action: 'action', entity: 'subject', actor: 'actor',
    objectType: 'object', sensitivity: 'sensitivity',
  }
  const sortValue = `${sortKeys[sort.key] || 'created'}_${sort.asc ? 'asc' : 'desc'}`
  const { records, pagination, summary, facets, loading, error, refresh } = useAdminActivity({
    page, search: deferredSearch, filters, sort: sortValue,
  })
  const resetScope = useCallback((callback) => { callback(); setPage(1) }, [])
  const labels = useMemo(() => Object.fromEntries([
    ...(facets.actions || []).map((item) => [item.key, item.label]),
    ...(facets.objectTypes || []).map((item) => [item.key, item.label]),
    ['standard', 'Standard'], ['confidential', 'Confidential'],
  ]), [facets.actions, facets.objectTypes])
  const optionLabel = useCallback((value) => labels[value] || value, [labels])
  const definitions = useMemo(() => [
    { key: 'actor', label: 'Administrator', options: facets.actors || [] },
    { key: 'objectType', label: 'Object type', options: (facets.objectTypes || []).map((item) => item.key) },
    { key: 'action', label: 'Action', options: (facets.actions || []).map((item) => item.key) },
    { key: 'sensitivity', label: 'Sensitivity', options: ['standard', 'confidential'] },
    { key: 'dateFrom', label: 'From date', type: 'date', options: [] },
    { key: 'dateTo', label: 'To date', type: 'date', options: [] },
  ], [facets.actions, facets.actors, facets.objectTypes])
  const columns = useMemo(() => [
    { key: 'action', label: 'Action', render: (record) => <span className={`adm-log-action ${record.sensitivity === 'confidential' ? 'is-confidential' : ''}`}>{record.sensitivity === 'confidential' ? <LockKeyhole size={16} aria-hidden="true"/> : <Check size={16} aria-hidden="true"/>}<span><b>{record.action}</b><small>{record.entity}</small></span></span> },
    { key: 'entity', label: 'Team / candidate' },
    { key: 'actor', label: 'Administrator' },
    { key: 'objectType', label: 'Object', secondary: true },
    { key: 'at', label: 'Date / time', render: (record) => <span>{dateLabel(record.at)}<small className="adm-cell-sub">{timeLabel(record.at)}</small></span> },
    { key: 'sensitivity', label: 'Sensitivity', render: (record) => <StatusBadge tone={record.sensitivity === 'confidential' ? 'sensitive' : 'neutral'}>{optionLabel(record.sensitivity)}</StatusBadge> },
  ], [optionLabel])

  return <div className="adm-page adm-activity-page">
    <PageHeader eyebrow="Accountability · Live audit trail" title="Activity log" description="Real database records of decisions, changes and confidential document access." actions={<Button variant="secondary" onClick={refresh} disabled={loading} icon={<RefreshCw className={loading ? 'adm-spin' : ''} size={15}/>}>{loading ? 'Refreshing…' : 'Refresh log'}</Button>}/>
    <SummaryStrip items={[{ label: 'Recorded actions', value: summary.recordedActions }, { label: 'Confidential events', value: summary.confidentialEvents }, { label: 'Administrators', value: summary.administrators }]}/>
    <div className="adm-work-panel">
      <RecordToolbar search={search} onSearch={(value) => resetScope(() => setSearch(value))} placeholder="Search action, team or candidate…" filters={filters} onFilters={(value) => resetScope(() => setFilters(value))} definitions={definitions} quickDefinitions={[{ key: 'sensitivity', label: 'Sensitivity', allLabel: 'All sensitivity levels', options: ['standard', 'confidential'] }]} resultCount={pagination.total} filterLabel="All filters" getOptionLabel={optionLabel}/>
      {error ? <div className="adm-state-error" role="alert"><TriangleAlert size={24}/><h3>Activity log could not be loaded</h3><p>{error}</p><Button onClick={refresh} variant="secondary">Try again</Button></div>
        : loading && !records.length ? <div className="adm-skeleton-group" role="status" aria-label="Loading the live activity log">{Array.from({ length: 6 }, (_, index) => <div className="adm-skeleton-row" key={index}><i/><span/><b/></div>)}</div>
          : <RecordTable className={loading ? 'is-refreshing' : ''} records={records} onOpen={setDetail} columns={columns} pagination={pagination} onPageChange={setPage} controlledSort={sort} onSortChange={(value) => resetScope(() => setSort(value))} emptyTitle="No audited activity matches this scope"/>}
    </div>
    {detail && <ActionDialog action={{ title: detail.action, reason: false, description: `${detail.entity} · ${detail.actor} · ${dateLabel(detail.at)}, ${timeLabel(detail.at)}. ${detail.note || 'No additional internal note.'}`, submit: 'Close', fields: [] }} onClose={() => setDetail(null)} onSubmit={() => {}}/>}
  </div>
}

function PasswordSecurityPanel({ addToast }) {
  const { changePassword } = useAdminAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (newPassword.length < 12 || newPassword.length > 128) return setError('Use a password between 12 and 128 characters.')
    if (newPassword !== confirmation) return setError('New password and confirmation do not match.')
    setBusy(true)
    const result = await changePassword(currentPassword, newPassword)
    setBusy(false)
    if (!result.ok) return setError(result.message || 'Unable to change password.')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmation('')
    addToast('Password changed', 'Other administrative sessions have been revoked securely.')
  }
  return <form className="adm-panel adm-settings-form adm-password-settings" onSubmit={submit}><span className="adm-eyebrow">Account security</span><h2>Change password</h2><p>Changing your password revokes every other active session. This browser receives a newly rotated secure session.</p><label className="adm-form-field"><span>Current password</span><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required disabled={busy}/></label><label className="adm-form-field"><span>New password <small>12–128 characters</small></span><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy}/></label><label className="adm-form-field"><span>Confirm new password</span><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy}/></label>{error && <p className="adm-auth-error" role="alert"><CircleAlert size={15}/>{error}</p>}<Button type="submit" disabled={busy || !currentPassword || !newPassword || !confirmation} icon={busy ? <LoaderCircle className="adm-spin" size={17}/> : <ShieldCheck size={17}/>}>{busy ? 'Updating securely…' : 'Change password'}</Button></form>
}

function PreferencesLoadNotice() {
  const { error, refreshing, refreshPreferences, status } = useAdminPreferences()
  if (status !== 'error') return null
  return <section className="adm-panel adm-preferences-error" role="alert" aria-busy={refreshing}><CircleAlert size={19}/><div><b>Administrator preferences could not be loaded.</b><p>{error}</p></div><Button type="button" variant="secondary" onClick={refreshPreferences} disabled={refreshing} icon={refreshing ? <LoaderCircle className="adm-spin" size={14}/> : <RefreshCw size={14}/>}>{refreshing ? 'Retrying…' : 'Retry'}</Button></section>
}

function OperationalSummary() {
  const campaign = useAdminAivexCampaignSettings()
  const labels = { scheduled: 'Scheduled', open: 'Open', closed: 'Closed', disabled: 'Disabled' }
  return <aside><section className="adm-panel adm-settings-note adm-operational-summary"><CalendarClock size={22}/><span className="adm-eyebrow">Active programmes</span><h2>AIVEX Edition 02</h2>
    {campaign.loading && !campaign.settings
      ? <p role="status">Loading the operational campaign…</p>
      : campaign.settings
        ? <><StatusBadge tone={campaign.settings.status}>{labels[campaign.settings.status] || campaign.settings.status}</StatusBadge><dl><div><dt>Registration opens</dt><dd>{formatCampaignDateTime(campaign.settings.registrationOpenAt, 'en')}</dd></div><div><dt>Registration closes</dt><dd>{formatCampaignDateTime(campaign.settings.registrationCloseAt, 'en')}</dd></div><div><dt>Timezone</dt><dd>{campaign.settings.timeZone}</dd></div></dl></>
        : <div role="alert"><p>{campaign.error || 'The operational campaign is unavailable.'}</p><Button type="button" variant="secondary" onClick={campaign.refresh}>Retry</Button></div>}
  </section></aside>
}

function WorkspacePreferences({ addToast }) {
  const { preferences, saving, updatePreferences } = useAdminPreferences()
  const [draft, setDraft] = useState(() => ({ tableDensity: preferences.tableDensity }))
  const [error, setError] = useState('')
  const changed = draft.tableDensity !== preferences.tableDensity
  const save = async (event) => {
    event.preventDefault()
    if (saving || !changed) return
    setError('')
    const result = await updatePreferences(draft)
    if (!result.ok) return setError(result.message || 'Unable to save workspace preferences.')
    addToast('Workspace preferences saved', 'Your authenticated preferences were refreshed from the server.')
  }
  return <div className="adm-settings-layout"><form className="adm-panel adm-settings-form" onSubmit={save} aria-busy={saving}><h2>Workspace preferences</h2><p>These preferences follow your administrator account across authenticated browsers and devices.</p><label className="adm-form-field"><span>Table density</span><select value={draft.tableDensity} onChange={(event) => setDraft({ tableDensity: event.target.value })} disabled={saving}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>{error && <p className="adm-auth-error" role="alert"><CircleAlert size={15}/>{error}</p>}<Button type="submit" disabled={saving || !changed} icon={saving ? <LoaderCircle className="adm-spin" size={16}/> : undefined}>{saving ? 'Saving…' : 'Save preferences'}</Button></form><OperationalSummary/></div>
}

function AccessAndPrivacy({ addToast, user }) {
  const { preferences, saving, updatePreferences } = useAdminPreferences()
  const [viewerTimeout, setViewerTimeout] = useState(preferences.viewerTimeoutSeconds)
  const [error, setError] = useState('')
  const changed = viewerTimeout !== preferences.viewerTimeoutSeconds
  const save = async (event) => {
    event.preventDefault()
    if (saving || !changed) return
    setError('')
    const result = await updatePreferences({ viewerTimeoutSeconds: viewerTimeout })
    if (!result.ok) return setError(result.message || 'Unable to save the viewer timeout.')
    addToast('Viewer timeout saved', 'New confidential viewers will use this server-backed timeout.')
  }
  return <div className="adm-settings-layout"><form className="adm-panel adm-settings-form" onSubmit={save} aria-busy={saving}><h2>Administrative access</h2><Facts items={[["Administrator", user.displayName], ['Username', `@${user.username}`], ['Current role', user.role.replaceAll('_', ' ')], ['Session', 'Server verified · HttpOnly cookie']]}/><h3>Confidential viewer</h3><p>Each open, close and verification is recorded. There are no public document URLs or identity thumbnails.</p><label className="adm-form-field"><span>Automatic viewer closure</span><select value={viewerTimeout} onChange={(event) => setViewerTimeout(Number(event.target.value))} disabled={saving}><option value="60">After 1 minute</option><option value="120">After 2 minutes</option><option value="300">After 5 minutes</option></select></label><p className="adm-muted">The selected timeout applies the next time a confidential AIVEX viewer is opened.</p>{error && <p className="adm-auth-error" role="alert"><CircleAlert size={15}/>{error}</p>}<Button type="submit" disabled={saving || !changed} icon={saving ? <LoaderCircle className="adm-spin" size={16}/> : undefined}>{saving ? 'Saving…' : 'Save viewer preference'}</Button></form><PasswordSecurityPanel addToast={addToast}/></div>
}

const THEME_ICONS = Object.freeze({ light: Sun, dark: Moon, system: Monitor })

function ThemePicker() {
  const { effectiveReducedMotion } = useAdminPreferences()
  const { preference, theme, choose } = useThemeSwitch(effectiveReducedMotion)
  const options = ADMIN_THEMES.map(({ key, label }) => {
    const Icon = THEME_ICONS[key]
    return { value: key, label, icon: <Icon size={15} aria-hidden="true"/> }
  })
  return <div className="adm-theme-picker"><span><b>Theme</b><small>{preference === 'system' ? `Follows this device, currently ${theme}.` : 'The same on every administration page.'}</small></span><SegmentedControl label="Theme" value={preference} onChange={choose} options={options}/></div>
}

function AccentPicker() {
  const [accent, setAccent] = useAdminAccent()
  return <section className="adm-panel adm-settings-form adm-accent-settings"><span className="adm-eyebrow">Colour</span><h2>Theme and accent</h2><p>Choose light, dark or your device setting, then the accent that re-tints buttons, highlights and charts. Every combination keeps AA contrast. Saved on this browser only.</p><ThemePicker/><fieldset className="adm-accent-picker"><legend className="sr-only">Accent colour</legend>{ADMIN_ACCENTS.map((option) => <label key={option.key} className={accent === option.key ? 'is-active' : ''}><input type="radio" name="admin-accent" value={option.key} checked={accent === option.key} onChange={() => setAccent(option.key)}/><span className="adm-accent-swatch" data-accent={option.key} aria-hidden="true"><i/><i/><i/></span><span><b>{option.label}</b><small>{option.copy}</small></span></label>)}</fieldset></section>
}

function AppearancePreferences({ addToast }) {
  const { osReducedMotion, preferences, saving, updatePreferences } = useAdminPreferences()
  const [reducedMotion, setReducedMotion] = useState(preferences.reducedMotion)
  const [error, setError] = useState('')
  const changed = reducedMotion !== preferences.reducedMotion
  const save = async (event) => {
    event.preventDefault()
    if (saving || !changed) return
    setError('')
    const result = await updatePreferences({ reducedMotion })
    if (!result.ok) return setError(result.message || 'Unable to save the appearance preference.')
    addToast('Appearance preference saved', 'Reduced-motion behavior was refreshed from the server.')
  }
  return <div className="adm-settings-layout"><form className="adm-panel adm-settings-form" onSubmit={save} aria-busy={saving}><span className="adm-eyebrow">Interface behavior</span><h2>Appearance</h2><p>Only application-wide behavior supported by the administration interface is configurable here.</p><label className="adm-setting-toggle"><span><b>Reduced motion</b><small>Minimize non-essential dashboard animation and transitions.</small></span><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} disabled={saving}/></label>{osReducedMotion && <p className="adm-motion-note"><ShieldCheck size={15}/>Your operating system already requests reduced motion, so it remains effective regardless of this preference.</p>}{error && <p className="adm-auth-error" role="alert"><CircleAlert size={15}/>{error}</p>}<Button type="submit" disabled={saving || !changed} icon={saving ? <LoaderCircle className="adm-spin" size={16}/> : undefined}>{saving ? 'Saving…' : 'Save appearance'}</Button></form><AccentPicker/></div>
}

export function SettingsPage() {
  const { addToast } = useAdmin()
  const { user } = useAdminAuth()
  const { preferences } = useAdminPreferences()
  const tabs = user.role === 'super_admin' ? ['Workspace', 'Notifications', 'AIVEX', 'Access & privacy', 'Appearance'] : ['Workspace', 'Notifications', 'Access & privacy', 'Appearance']
  const { state: routeState } = useLocation()
  const [tab, setTab] = useState(() => (tabs.includes(routeState?.settingsTab) ? routeState.settingsTab : 'Workspace'))
  return <div className="adm-page adm-settings-page"><PageHeader eyebrow="Workspace · Preferences" title="Settings" description="Control your workspace, campaign operations and administrative security."/><div className="adm-settings-shell"><nav className="adm-panel adm-settings-nav" aria-label="Settings sections"><Tabs items={tabs} value={tab} onChange={setTab} orientation="vertical" label="Settings sections"/></nav><div className="adm-settings-content"><PreferencesLoadNotice/>
    {tab === 'Workspace' && <WorkspacePreferences key={preferences.tableDensity} addToast={addToast}/>}
    {tab === 'Notifications' && <AdminNotificationSettings key={`${preferences.aivexNotificationsEnabled}-${preferences.joinNotificationsEnabled}-${preferences.notificationSoundEnabled}`} addToast={addToast}/>}
    {tab === 'AIVEX' && user.role === 'super_admin' && <AivexCampaignSettings addToast={addToast}/>}
    {tab === 'Access & privacy' && <AccessAndPrivacy key={preferences.viewerTimeoutSeconds} addToast={addToast} user={user}/>}
    {tab === 'Appearance' && <AppearancePreferences key={String(preferences.reducedMotion)} addToast={addToast}/>}
  </div></div></div>
}
