import { useState } from 'react'
import { BellRing, CircleAlert, LoaderCircle, MonitorSmartphone, Send, ShieldCheck, Volume2 } from 'lucide-react'
import { useAdminAuth } from './AdminAuth'
import { useAdminNotifications } from './AdminNotifications'
import { useAdminPreferences } from './AdminPreferences'
import { Button, StatusBadge } from './AdminUI'

const PUSH_LABELS = {
  checking: 'Checking…',
  enabling: 'Enabling…',
  enabled: 'Enabled',
  not_configured: 'Not enabled',
  blocked: 'Permission blocked',
  unsupported: 'Unsupported',
  subscription_error: 'Subscription error',
}

export default function AdminNotificationSettings({ addToast }) {
  const { user } = useAdminAuth()
  const { preferences, saving, updatePreferences } = useAdminPreferences()
  const notifications = useAdminNotifications()
  const [draft, setDraft] = useState(() => ({
    aivexNotificationsEnabled: preferences.aivexNotificationsEnabled,
    joinNotificationsEnabled: preferences.joinNotificationsEnabled,
    notificationSoundEnabled: preferences.notificationSoundEnabled,
  }))
  const [busyAction, setBusyAction] = useState('')
  const [error, setError] = useState('')

  const changed = Object.entries(draft).some(([key, value]) => preferences[key] !== value)
  const save = async (event) => {
    event.preventDefault()
    setError('')
    const result = await updatePreferences(draft)
    if (!result.ok) return setError(result.message || 'Unable to save notification preferences.')
    addToast('Notification preferences saved', 'Recipient rules now use your updated choices.')
  }

  const run = async (name, action, success) => {
    setBusyAction(name)
    setError('')
    try {
      const result = await action()
      if (!result?.ok) throw new Error(result?.message || notifications.push.error || 'The notification setting could not be updated.')
      addToast(success, name === 'test' ? 'Check this browser or your operating-system notification area.' : 'This device registration was updated securely.')
    } catch (actionError) {
      setError(actionError.message)
    } finally {
      setBusyAction('')
    }
  }

  const pushStatus = PUSH_LABELS[notifications.push.status] || 'Not configured'
  const canEnable = !['enabled', 'blocked', 'unsupported', 'enabling', 'checking'].includes(notifications.push.status)

  return <div className="adm-settings-layout adm-notification-settings">
    <form className="adm-panel adm-settings-form" onSubmit={save} aria-busy={saving}>
      <span className="adm-eyebrow">Notification center</span>
      <h2>Notification preferences</h2>
      <p>Persistent alerts remain attached to your administrator account. Category choices are applied server-side when recipients are resolved.</p>
      <div className="adm-notification-setting-static"><span><BellRing size={18}/><span><b>In-dashboard alerts</b><small>Persistent history, unread state and secure deep links</small></span></span><StatusBadge tone="success">Enabled</StatusBadge></div>
      <label className="adm-setting-toggle"><span><b>AIVEX review alerts</b><small>Signed documents, resubmitted corrections and generation issues.</small></span><input type="checkbox" checked={draft.aivexNotificationsEnabled} onChange={(event) => setDraft((current) => ({ ...current, aivexNotificationsEnabled: event.target.checked }))} disabled={saving}/></label>
      {user.role === 'super_admin' && <label className="adm-setting-toggle"><span><b>Join application alerts</b><small>New Join applications requiring super-administrator access.</small></span><input type="checkbox" checked={draft.joinNotificationsEnabled} onChange={(event) => setDraft((current) => ({ ...current, joinNotificationsEnabled: event.target.checked }))} disabled={saving}/></label>}
      <label className="adm-setting-toggle"><span><b>Notification sound</b><small>Play one subtle tone for a foreground alert after browser interaction allows audio.</small></span><input type="checkbox" checked={draft.notificationSoundEnabled} onChange={(event) => setDraft((current) => ({ ...current, notificationSoundEnabled: event.target.checked }))} disabled={saving}/></label>
      <Button type="submit" disabled={saving || !changed} icon={saving ? <LoaderCircle className="adm-spin" size={16}/> : undefined}>{saving ? 'Saving…' : 'Save notification preferences'}</Button>
    </form>

    <section className="adm-panel adm-settings-form adm-push-settings" aria-busy={Boolean(busyAction)}>
      <span className="adm-eyebrow">This device</span>
      <h2>Browser notifications</h2>
      <div className="adm-push-status"><MonitorSmartphone size={21}/><span><b>{pushStatus}</b><small>Native notifications contain only a privacy-safe summary.</small></span></div>
      {notifications.push.status === 'blocked' && <p className="adm-motion-note"><CircleAlert size={15}/>Notifications are blocked in this browser’s site settings. The in-dashboard Notification Center still works.</p>}
      {notifications.push.status === 'unsupported' && <p className="adm-motion-note"><CircleAlert size={15}/>Browser notifications are not available in this browser. On supported iPhone or iPad versions, install the admin site to the Home Screen first.</p>}
      {(error || notifications.push.error) && <p className="adm-auth-error" role="alert"><CircleAlert size={15}/>{error || notifications.push.error}</p>}
      <div className="adm-push-actions">
        {notifications.push.status === 'enabled'
          ? <Button type="button" variant="secondary" onClick={() => run('disable', notifications.disablePush, 'Browser notifications disabled')} disabled={Boolean(busyAction)}>{busyAction === 'disable' ? 'Disabling…' : 'Disable on this device'}</Button>
          : <Button type="button" onClick={() => run('enable', notifications.enablePush, 'Browser notifications enabled')} disabled={!canEnable || Boolean(busyAction)} icon={busyAction === 'enable' ? <LoaderCircle className="adm-spin" size={16}/> : <ShieldCheck size={16}/>}>{busyAction === 'enable' ? 'Enabling…' : 'Enable browser notifications'}</Button>}
        <Button type="button" variant="secondary" onClick={() => run('test', notifications.sendTest, 'Test notification sent')} disabled={notifications.push.status !== 'enabled' || Boolean(busyAction)} icon={busyAction === 'test' ? <LoaderCircle className="adm-spin" size={16}/> : <Send size={16}/>}>{busyAction === 'test' ? 'Sending…' : 'Send test notification'}</Button>
      </div>
      <div className="adm-device-list"><h3><Volume2 size={16}/>Registered devices</h3>{notifications.push.devices.length ? notifications.push.devices.map((device) => <p key={device.id}><b>{device.device_label || 'Browser device'}</b><small>Push enabled</small></p>) : <p><span>No active browser device is registered.</span></p>}</div>
    </section>
  </div>
}
