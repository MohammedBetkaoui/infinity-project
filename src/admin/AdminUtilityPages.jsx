import { useState } from 'react'
import { ArrowRight, Check, CircleAlert, Eye, EyeOff, LoaderCircle, LockKeyhole, RotateCw, ShieldCheck } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import InfinityMark from '../components/InfinityMark'
import { useAdminAuth } from './AdminAuth'
import { safeAdminReturnTo } from './adminAuthPath'
import { useAdmin } from './AdminStore'
import { dateLabel, filterRecords, timeLabel } from './adminModel'
import { Button, EmptyState, PageHeader, Progress, StatusBadge, Tabs } from './AdminUI'
import { ActionDialog, Facts, RecordTable, RecordToolbar, SummaryStrip } from './AdminRecords'

export function LoginPage() {
  const navigate = useNavigate()
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
  return <div className="adm-login adm-app"><div className="adm-login-brand"><InfinityMark/><span>INFINITY CLUB</span><code>ADMINISTRATION / SECURE ACCESS</code></div><div className="adm-login-composition"><section className="adm-login-story"><p className="adm-eyebrow">Behind every possibility.</p><h1>The people.<br/>The projects.<br/><span>The next chapter.</span></h1><p>A shared workspace for the people making<br/>Infinity Club happen.</p><div className="adm-login-art"><svg viewBox="0 0 600 210" aria-hidden="true"><path d="M20 105C20 20 170 20 270 105S500 195 560 110C620 10 450 5 340 105S20 190 20 105Z"/><circle cx="20" cy="105" r="6"/><circle cx="310" cy="111" r="6"/><circle cx="565" cy="98" r="6"/></svg><span>PEOPLE</span><span>OPERATIONS</span><span>AIVEX</span></div><code>36.0661° N / 4.7630° E · BORDJ BOU ARRERIDJ</code></section><section className="adm-login-panel"><span className="adm-login-index">01 / ADMINISTRATIVE ACCESS</span><div className="adm-login-lock"><LockKeyhole size={24}/></div><h2>Welcome to<br/>the control room.</h2><p>Secure access for authorized Infinity Club administrators.</p><form className="adm-login-form" onSubmit={submit} aria-busy={busy}><label><span>Username</span><input name="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck="false" required disabled={busy}/></label><label><span>Password</span><div className="adm-password-input"><input name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={updateCapsLock} onKeyUp={updateCapsLock} onBlur={() => setCapsLock(false)} autoComplete="current-password" required disabled={busy} aria-describedby={error ? 'admin-login-error' : undefined}/><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'} disabled={busy}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>{capsLock && <p className="adm-caps-lock" role="status">Caps Lock is on.</p>}{error && <p id="admin-login-error" className="adm-auth-error" role="alert"><CircleAlert size={15}/>{error}</p>}<Button type="submit" disabled={busy || !username || !password} icon={busy ? <LoaderCircle className="adm-spin" size={18}/> : <ArrowRight size={18}/>}>{busy ? 'Verifying access…' : 'Enter workspace'}</Button></form><p className="adm-login-security"><ShieldCheck size={14}/> Protected administrative workspace</p><Link to="/">Back to Infinity Club <ArrowRight size={13}/></Link></section></div><footer><span>INFINITY IS A MINDSET.</span><span>Protected administrative workspace</span></footer></div>
}

export function ActivityPage({ globalQuery }) {
  const { state } = useAdmin()
  const [params] = useSearchParams()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(params.get('sensitivity') ? { sensitivity: params.get('sensitivity') } : {})
  const [detail, setDetail] = useState(null)
  const records = state.activities.map((a) => ({ ...a, day: dateLabel(a.at) }))
  const visible = filterRecords(records, `${search} ${globalQuery}`.trim(), filters)
  return <div className="adm-page"><PageHeader eyebrow="Accountability · Audit trail" title="Activity log" description="A clear record of decisions, changes and confidential document access."/><SummaryStrip items={[{ label: 'Recorded actions', value: records.length }, { label: 'Confidential events', value: records.filter((r) => r.sensitivity === 'Confidential').length }, { label: 'Administrators', value: new Set(records.map((r) => r.actor)).size }]}/><div className="adm-work-panel"><RecordToolbar search={search} onSearch={setSearch} placeholder="Search action, team or candidate…" filters={filters} onFilters={setFilters} definitions={[{ key: 'actor', label: 'Administrator', options: [...new Set(records.map((r) => r.actor))] }, { key: 'objectType', label: 'Object type', options: ['Application', 'Member', 'Staff', 'AIVEX', 'Administration'] }, { key: 'action', label: 'Action', options: [...new Set(records.map((r) => r.action))] }, { key: 'day', label: 'Date', options: [...new Set(records.map((r) => r.day))] }, { key: 'sensitivity', label: 'Sensitivity', options: ['Standard', 'Confidential'] }]}/><RecordTable records={visible} pageSize={8} onOpen={setDetail} columns={[{ key: 'action', label: 'Action', render: (a) => <span className="adm-log-action">{a.sensitivity === 'Confidential' ? <LockKeyhole size={16}/> : <Check size={16}/>}<b>{a.action}</b></span> }, { key: 'entity', label: 'Team / candidate' }, { key: 'actor', label: 'Administrator' }, { key: 'objectType', label: 'Object', secondary: true }, { key: 'at', label: 'Date / time', render: (a) => <span>{dateLabel(a.at)}<small className="adm-cell-sub">{timeLabel(a.at)}</small></span> }, { key: 'sensitivity', label: 'Sensitivity', render: (a) => <StatusBadge tone={a.sensitivity === 'Confidential' ? 'sensitive' : 'neutral'}>{a.sensitivity}</StatusBadge> }]}/></div>{detail && <ActionDialog action={{ title: detail.action, reason: false, description: `${detail.entity} · ${detail.actor} · ${dateLabel(detail.at)}, ${timeLabel(detail.at)}. ${detail.note || 'No additional internal note.'}`, submit: 'Close', fields: [] }} onClose={() => setDetail(null)} onSubmit={() => {}}/>}</div>
}

function StatePreview({ value, onRetry }) {
  if (value === 'Ready') return <div className="adm-state-success"><Check size={24}/><h3>All set</h3><p>Your changes were saved and recorded in the history.</p></div>
  if (value === 'Loading') return <div className="adm-skeleton-group" aria-label="Loading records" role="status">{[1, 2, 3, 4].map((n) => <div className="adm-skeleton-row" key={n}><i/><span/><b/></div>)}</div>
  if (value === 'No results') return <EmptyState/>
  if (value === 'No applications') return <EmptyState title="A quiet inbox" copy="No applications have arrived for this campaign yet."/>
  if (value === 'Access denied') return <div className="adm-state-error"><LockKeyhole size={26}/><h3>Access restricted</h3><p>Your current role does not include confidential document review.</p><Button variant="secondary" onClick={onRetry}>Return to workspace</Button></div>
  if (value === 'Historical data incomplete') return <div className="adm-history-incomplete"><h3>Earlier history is unavailable</h3><p>This record was imported without its full history. All subsequent actions will be recorded.</p></div>
  const copy = { 'Incomplete file': 'Two required items are still missing. Complete the checklist before validation.', 'Missing file': 'The driver’s identity document has not been provided.', 'Generation failed': 'The official document could not be generated. Your team information is saved.', 'Loading error': 'The record could not be loaded. Your changes are preserved.', 'Action impossible': 'File validation requires a verified signed form and all administrative checks.' }
  return <div className="adm-state-error"><CircleAlert size={26}/><h3>{value}</h3><p>{copy[value]}</p><Button variant="secondary" onClick={onRetry} icon={<RotateCw size={15}/>}>{value.includes('failed') || value.includes('error') ? 'Retry' : 'Return to review'}</Button></div>
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

export function SettingsPage() {
  const { state, setState, addToast, log, reset } = useAdmin()
  const { user } = useAdminAuth()
  const [tab, setTab] = useState('Workspace')
  const [draft, setDraft] = useState(state.settings)
  const [action, setAction] = useState(null)
  const [preview, setPreview] = useState('Ready')
  const save = (event) => { event.preventDefault(); setState((s) => ({ ...s, settings: draft })); log('Workspace settings updated', draft.campaign); addToast('Settings saved', 'Your local workspace preferences are updated.') }
  return <div className="adm-page"><PageHeader eyebrow="Workspace · Preferences" title="Settings" description="A few thoughtful defaults to keep your administration running smoothly."/><Tabs items={['Workspace', 'Access & privacy', 'Design system']} value={tab} onChange={setTab}/>
    {tab === 'Workspace' && <div className="adm-settings-layout"><form className="adm-panel adm-settings-form" onSubmit={save}><h2>Workspace essentials</h2><p>Interface preferences remain local to this browser; authenticated identity is managed separately.</p><label className="adm-form-field"><span>Active campaign</span><input value={draft.campaign} onChange={(e) => setDraft({ ...draft, campaign: e.target.value })} required/></label><label className="adm-form-field"><span>Table density</span><select value={draft.density} onChange={(e) => setDraft({ ...draft, density: e.target.value })}><option>Comfortable</option><option>Compact</option></select></label><label className="adm-setting-toggle"><span><b>Review notifications</b><small>Show pending review items in the notification panel.</small></span><input type="checkbox" checked={draft.reviewAlerts} onChange={(e) => setDraft({ ...draft, reviewAlerts: e.target.checked })}/></label><Button type="submit">Save preferences</Button></form><aside><div className="adm-panel adm-settings-note"><span className="adm-eyebrow">Demo records</span><h2>A clean slate,<br/>when you need one.</h2><p>Reset restores the fictional dashboard records and document versions. It never changes your authenticated account.</p><Button variant="secondary" onClick={() => setAction({ title: 'Reset demo data', danger: true, description: 'This removes changes made to fictional dashboard records and restores their original state. Your account and session are not affected.' })}>Reset demo data</Button></div></aside></div>}
    {tab === 'Access & privacy' && <div className="adm-settings-layout"><section className="adm-panel adm-settings-form"><h2>Administrative access</h2><Facts items={[["Administrator", user.displayName], ['Username', `@${user.username}`], ['Current role', user.role.replaceAll('_', ' ')], ['Session', 'Server verified · HttpOnly cookie']]}/><h3>Confidential viewer</h3><p>Each open, close and verification is recorded. There are no public document URLs or identity thumbnails.</p><label className="adm-form-field"><span>Automatic viewer closure</span><select value={state.settings.viewerTimeout} onChange={(e) => { setState((s) => ({ ...s, settings: { ...s.settings, viewerTimeout: Number(e.target.value) } })); addToast('Viewer timeout updated') }}><option value="60">After 1 minute</option><option value="120">After 2 minutes</option><option value="300">After 5 minutes</option></select></label><p className="adm-muted">Authentication and account changes are verified server-side. Credentials and session tokens are never stored in this workspace.</p></section><PasswordSecurityPanel addToast={addToast}/></div>}
    {tab === 'Design system' && <div className="adm-design-system"><section className="adm-panel adm-settings-form"><p className="adm-eyebrow">Infinity foundation</p><h2>Precise by design.</h2><div className="adm-swatches">{['#002A1E', '#094A36', '#00271B', '#F1EBDD', '#FAF9F5', '#E7DFCF', '#9ED7C4', '#376957', '#B6CEC5', '#638F80', '#0B7657', '#A33627'].map((color) => <div key={color}><i style={{ background: color }}/><code>{color}</code></div>)}</div><div className="adm-type-specimen"><span>Manrope · Interface & reading</span><strong>Rajdhani · 01 234 567</strong><code>JetBrains Mono · AIVEX2-7K9M2P4R</code></div><p>Spacing · 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px</p><div className="adm-component-samples"><Button onClick={() => addToast('Primary action', 'The component is interactive.')}>Primary</Button><Button variant="secondary" onClick={() => addToast('Secondary action')}>Secondary</Button><Button variant="text" onClick={() => addToast('Text action')}>Text button</Button><Button variant="danger" onClick={() => setAction({ title: 'Danger action example', danger: true })}>Danger</Button><Button disabled>Disabled</Button></div><div className="adm-component-samples"><StatusBadge>Active</StatusBadge><StatusBadge>In review</StatusBadge><StatusBadge>Corrections needed</StatusBadge><StatusBadge>Declined</StatusBadge><StatusBadge tone="sensitive">Confidential</StatusBadge></div><Progress value={72}/></section><section className="adm-panel adm-settings-form"><h2>Interface states</h2><label className="adm-form-field"><span>Preview a state</span><select value={preview} onChange={(e) => setPreview(e.target.value)}>{['Ready', 'Loading', 'No results', 'No applications', 'Incomplete file', 'Missing file', 'Generation failed', 'Loading error', 'Access denied', 'Action impossible', 'Historical data incomplete'].map((value) => <option key={value}>{value}</option>)}</select></label><StatePreview value={preview} onRetry={() => { setPreview('Ready'); addToast('Demo state resolved') }}/></section></div>}
    {action && <ActionDialog
      action={action}
      onClose={() => setAction(null)}
      onSubmit={() => { if (action.title === 'Reset demo data') { reset(); setDraft({ ...state.settings, campaign: 'Autumn · 2026/27' }) } else addToast('Action confirmed') }}
    />}
  </div>
}
