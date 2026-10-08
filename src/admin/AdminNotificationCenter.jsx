import { useEffect, useState } from 'react'
import { Archive, ArrowUpRight, Bell, CheckCheck, FileText, RefreshCw, Settings, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth } from './AdminAuth'
import { Button, ChipGroup, Modal } from './AdminUI'
import { relativeNotificationTime } from './adminNotificationModel'
import { useAdminNotifications } from './AdminNotifications'

const COPY = {
  en: {
    title: 'Notifications', eyebrow: 'Notification center', all: 'All', unreadFilter: 'Unread', aivex: 'AIVEX', join: 'Join',
    unread: 'unread', markAll: 'Mark all as read', settings: 'Settings', loading: 'Loading notifications…',
    empty: 'No notifications yet.', caughtUp: 'You’re all caught up.', error: 'Unable to load notifications.',
    retry: 'Retry', loadMore: 'Load more', archive: 'Archive notification', open: 'Open notification',
  },
  ar: {
    title: 'الإشعارات', eyebrow: 'مركز الإشعارات', all: 'الكل', unreadFilter: 'غير مقروء', aivex: 'AIVEX', join: 'الانضمام',
    unread: 'غير مقروء', markAll: 'تحديد الكل كمقروء', settings: 'الإعدادات', loading: 'جارٍ تحميل الإشعارات…',
    empty: 'لا توجد إشعارات.', caughtUp: 'كل شيء محدّث.', error: 'تعذّر تحميل الإشعارات.',
    retry: 'إعادة المحاولة', loadMore: 'عرض المزيد', archive: 'أرشفة الإشعار', open: 'فتح الإشعار',
  },
}

const iconFor = (source) => source === 'join' ? Users : source === 'aivex' ? FileText : Bell

export default function AdminNotificationCenter({ language = 'en' }) {
  const navigate = useNavigate()
  const { user } = useAdminAuth()
  const center = useAdminNotifications()
  const labels = COPY[language] || COPY.en
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    if (!center.open) return undefined
    const timer = window.setInterval(() => setClock(new Date()), 60 * 1000)
    return () => window.clearInterval(timer)
  }, [center.open])

  const filters = [
    { value: 'all', label: labels.all },
    { value: 'unread', label: labels.unreadFilter },
    { value: 'aivex', label: labels.aivex },
    ...(user.role === 'super_admin' ? [{ value: 'join', label: labels.join }] : []),
  ]

  const openNotification = async (notification) => {
    if (!notification.readAt) await center.markRead(notification.id).catch(() => {})
    center.setOpen(false)
    if (notification.actionPath) navigate(notification.actionPath)
  }

  const openSettings = () => {
    center.setOpen(false)
    navigate('/admin/settings', { state: { settingsTab: 'Notifications' } })
  }

  return <>
    <span className="sr-only" aria-live="polite">{center.liveMessage}</span>
    <Modal open={center.open} onClose={() => center.setOpen(false)} title={labels.title} eyebrow={labels.eyebrow} wide className="adm-notification-center" footer={<div className="adm-notification-center__footer"><Button type="button" variant="secondary" onClick={openSettings} icon={<Settings size={15} aria-hidden="true"/>}>{labels.settings}</Button>{center.nextCursor && <Button type="button" variant="secondary" onClick={center.loadMore}>{labels.loadMore}</Button>}</div>}>
      <div className="adm-notification-center__toolbar">
        <ChipGroup label={labels.title} value={center.filter} onChange={center.setFilter} options={filters}/>
        <div><span className="adm-notification-count"><b>{center.unreadCount}</b> {labels.unread}</span><Button type="button" variant="text" onClick={() => center.markAllRead().catch(() => {})} disabled={!center.unreadCount} icon={<CheckCheck size={15} aria-hidden="true"/>}>{labels.markAll}</Button></div>
      </div>
      {center.status === 'loading' && !center.notifications.length
        ? <div className="adm-notification-state" role="status"><RefreshCw className="adm-spin" size={20}/><p>{labels.loading}</p></div>
        : center.status === 'error' && !center.notifications.length
          ? <div className="adm-notification-state" role="alert"><p>{center.error || labels.error}</p><Button type="button" variant="secondary" onClick={center.refresh}>{labels.retry}</Button></div>
          : center.notifications.length
            ? <div className="adm-notification-list">{center.notifications.map((notification) => {
              const Icon = iconFor(notification.source)
              return <article key={notification.id} className={`adm-notification-row${notification.readAt ? '' : ' is-unread'}`} data-severity={notification.severity}>
                <button type="button" className="adm-notification-row__main" onClick={() => openNotification(notification)} aria-label={`${labels.open}: ${notification.title}`}>
                  <span className="adm-notification-row__icon"><Icon size={18} aria-hidden="true"/></span>
                  <span><span className="adm-notification-row__heading"><b>{notification.title}</b>{!notification.readAt && <i aria-label={labels.unread}/>}</span><small>{notification.body}</small>{notification.payload?.reference && <em>{notification.payload.reference}</em>}<time dateTime={notification.createdAt}>{relativeNotificationTime(notification.createdAt, clock, language)}</time></span>
                  {notification.actionPath && <ArrowUpRight size={16} aria-hidden="true"/>}
                </button>
                <button type="button" className="adm-notification-row__archive" onClick={() => center.archive(notification.id).catch(() => {})} aria-label={labels.archive} title={labels.archive}><Archive size={15}/></button>
              </article>
            })}</div>
            : <div className="adm-notification-state"><Bell size={22}/><p>{center.filter === 'all' ? labels.empty : labels.caughtUp}</p></div>}
      {center.error && center.notifications.length ? <p className="adm-notification-inline-error" role="alert">{center.error} <button type="button" onClick={center.refresh}>{labels.retry}</button></p> : null}
    </Modal>
  </>
}
