import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAdminAuth } from './AdminAuth'
import { notificationCapability, urlBase64ToUint8Array } from './adminNotificationModel'
import { useAdminPreferences } from './AdminPreferences'

const AdminNotificationsContext = createContext(null)
const NOTIFICATIONS_ENDPOINT = '/api/admin/notifications'
const ACTIONS_ENDPOINT = '/api/admin/notifications/actions'
const PUSH_ENDPOINT = '/api/admin/notifications/push-subscription'
const FOREGROUND_REFRESH_MS = 60 * 1000

function playNotificationTone() {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 620
    gain.gain.setValueAtTime(0.035, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.18)
    oscillator.addEventListener('ended', () => context.close().catch(() => {}), { once: true })
  } catch { /* Sound is best effort and may be blocked before user interaction. */ }
}

export function AdminNotificationsProvider({ children }) {
  const { request } = useAdminAuth()
  const { preferences } = useAdminPreferences()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('all')
  const [state, setState] = useState({ status: 'loading', notifications: [], unreadCount: 0, nextCursor: null, error: '' })
  const [push, setPush] = useState({ status: 'checking', error: '', devices: [] })
  const [liveMessage, setLiveMessage] = useState('')
  const [newPulse, setNewPulse] = useState(false)
  const requestSequence = useRef(0)
  const pulseTimer = useRef(null)
  const previousUnreadCount = useRef(null)

  const signalNewNotification = useCallback(() => {
    setLiveMessage('New administration notification received.')
    setNewPulse(true)
    window.clearTimeout(pulseTimer.current)
    pulseTimer.current = window.setTimeout(() => setNewPulse(false), 900)
    if (preferences.notificationSoundEnabled) playNotificationTone()
  }, [preferences.notificationSoundEnabled])

  const mutate = useCallback(async (body) => {
    try {
      const { response, body: result } = await request(ACTIONS_ENDPOINT, { method: 'POST', body: JSON.stringify(body) })
      if (!response.ok) throw new Error(result.message || 'Unable to update notifications.')
      return result
    } catch (error) {
      setState((current) => ({ ...current, error: error.message || 'Unable to update notifications.' }))
      throw error
    }
  }, [request])

  const load = useCallback(async ({ append = false, cursor = null, silent = false } = {}) => {
    const sequence = ++requestSequence.current
    if (!silent && !append) setState((current) => ({ ...current, status: 'loading', error: '' }))
    try {
      const params = new URLSearchParams({ limit: '24' })
      if (filter === 'unread') params.set('unread', 'true')
      else if (filter !== 'all') params.set('source', filter)
      if (cursor) params.set('cursor', cursor)
      const { response, body } = await request(`${NOTIFICATIONS_ENDPOINT}?${params}`)
      if (!response.ok) throw new Error(body.message || 'Unable to load notifications.')
      if (sequence !== requestSequence.current) return null
      const unreadCount = Number(body.unreadCount || 0)
      if (silent && previousUnreadCount.current !== null && unreadCount > previousUnreadCount.current) {
        signalNewNotification()
      }
      previousUnreadCount.current = unreadCount
      setState((current) => ({
        status: 'ready',
        notifications: append ? [...current.notifications, ...(body.notifications || [])] : (body.notifications || []),
        unreadCount,
        nextCursor: body.nextCursor || null,
        error: '',
      }))
      return body.notifications || []
    } catch (error) {
      if (sequence !== requestSequence.current) return null
      setState((current) => ({ ...current, status: silent ? current.status : 'error', error: error.message || 'Unable to load notifications.' }))
      return null
    }
  }, [filter, request, signalNewNotification])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const operation = state.unreadCount > 0
      ? navigator.setAppBadge?.(state.unreadCount)
      : navigator.clearAppBadge?.()
    Promise.resolve(operation).catch(() => {})
  }, [state.unreadCount])

  useEffect(() => () => {
    Promise.resolve(navigator.clearAppBadge?.()).catch(() => {})
  }, [])

  const refresh = useCallback(() => load({ silent: true }), [load])

  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === 'visible') refresh() }
    const timer = window.setInterval(refreshVisible, FOREGROUND_REFRESH_MS)
    window.addEventListener('focus', refreshVisible)
    window.addEventListener('online', refreshVisible)
    document.addEventListener('visibilitychange', refreshVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshVisible)
      window.removeEventListener('online', refreshVisible)
      document.removeEventListener('visibilitychange', refreshVisible)
    }
  }, [refresh])

  useEffect(() => {
    const manifest = document.createElement('link')
    manifest.rel = 'manifest'
    manifest.href = '/admin.webmanifest'
    manifest.dataset.infinityAdminManifest = 'true'
    document.head.append(manifest)
    return () => manifest.remove()
  }, [])

  const registerWorker = useCallback(async () => {
    if (notificationCapability() === 'unsupported') return null
    return navigator.serviceWorker.register('/admin-sw.js', { scope: '/admin/' })
  }, [])

  const refreshPushState = useCallback(async () => {
    const capability = notificationCapability()
    if (capability !== 'available') {
      setPush((current) => ({ ...current, status: capability, error: '' }))
      return capability
    }
    try {
      const registration = await registerWorker()
      const subscription = await registration?.pushManager.getSubscription()
      const { response, body } = await request(PUSH_ENDPOINT)
      setPush({
        status: Notification.permission === 'granted' && subscription ? 'enabled' : 'not_configured',
        error: response.ok ? '' : (body.message || 'Unable to load registered devices.'),
        devices: response.ok ? (body.devices || []) : [],
      })
      return subscription ? 'enabled' : 'not_configured'
    } catch {
      setPush((current) => ({ ...current, status: 'subscription_error', error: 'Unable to inspect browser notification settings.' }))
      return 'subscription_error'
    }
  }, [registerWorker, request])

  useEffect(() => { refreshPushState() }, [refreshPushState])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined
    const onMessage = (event) => {
      if (event.data?.type !== 'INFINITY_ADMIN_NOTIFICATION') return
      refresh()
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage)
      window.clearTimeout(pulseTimer.current)
    }
  }, [refresh])

  const openCenter = useCallback(async () => {
    setOpen(true)
    const rows = await load({ silent: true })
    const unseen = (rows || []).filter((item) => !item.seenAt).map((item) => item.id)
    if (unseen.length) {
      mutate({ action: 'mark_seen', notificationIds: unseen })
        .then(() => setState((current) => ({
          ...current,
          notifications: current.notifications.map((item) => unseen.includes(item.id) ? { ...item, seenAt: new Date().toISOString() } : item),
        })))
        .catch(() => {})
    }
  }, [load, mutate])

  const markRead = useCallback(async (notificationId) => {
    const result = await mutate({ action: 'mark_read', notificationId })
    previousUnreadCount.current = Number(result.unreadCount || 0)
    setState((current) => ({
      ...current,
      unreadCount: Number(result.unreadCount || 0),
      notifications: current.notifications.map((item) => item.id === notificationId
        ? { ...item, readAt: item.readAt || new Date().toISOString(), seenAt: item.seenAt || new Date().toISOString() }
        : item),
    }))
  }, [mutate])

  const markAllRead = useCallback(async () => {
    const result = await mutate({ action: 'mark_all_read' })
    previousUnreadCount.current = Number(result.unreadCount || 0)
    const clock = new Date().toISOString()
    setState((current) => ({
      ...current,
      unreadCount: Number(result.unreadCount || 0),
      notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt || clock, seenAt: item.seenAt || clock })),
    }))
  }, [mutate])

  const archive = useCallback(async (notificationId) => {
    const result = await mutate({ action: 'archive', notificationId })
    previousUnreadCount.current = Number(result.unreadCount || 0)
    setState((current) => ({
      ...current,
      unreadCount: Number(result.unreadCount || 0),
      notifications: current.notifications.filter((item) => item.id !== notificationId),
    }))
  }, [mutate])

  const enablePush = useCallback(async () => {
    const capability = notificationCapability()
    if (capability === 'unsupported' || capability === 'blocked') {
      setPush((current) => ({ ...current, status: capability }))
      return { ok: false, status: capability }
    }
    const publicKey = String(import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY || '').trim()
    if (!publicKey) {
      const message = 'Web Push is not configured for this deployment.'
      setPush((current) => ({ ...current, status: 'not_configured', error: message }))
      return { ok: false, status: 'not_configured', message }
    }
    setPush((current) => ({ ...current, status: 'enabling', error: '' }))
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        const status = permission === 'denied' ? 'blocked' : 'not_configured'
        setPush((current) => ({ ...current, status }))
        return { ok: false, status }
      }
      const registration = await registerWorker()
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const serialized = subscription.toJSON()
      const { response, body } = await request(PUSH_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({
          subscription: { endpoint: serialized.endpoint, keys: serialized.keys },
          deviceLabel: 'This browser',
        }),
      })
      if (!response.ok) throw new Error(body.message || 'Unable to register this browser.')
      await refreshPushState()
      return { ok: true }
    } catch (error) {
      setPush((current) => ({ ...current, status: 'subscription_error', error: error.message || 'Unable to enable browser notifications.' }))
      return { ok: false, status: 'subscription_error', message: error.message }
    }
  }, [refreshPushState, registerWorker, request])

  const disablePush = useCallback(async () => {
    try {
      const registration = await registerWorker()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        const { response, body } = await request(PUSH_ENDPOINT, {
          method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        if (!response.ok) throw new Error(body.message || 'Unable to disable this browser.')
        await subscription.unsubscribe()
      }
      await refreshPushState()
      return { ok: true }
    } catch (error) {
      setPush((current) => ({ ...current, status: 'subscription_error', error: error.message || 'Unable to disable this browser.' }))
      return { ok: false, message: error.message }
    }
  }, [refreshPushState, registerWorker, request])

  const sendTest = useCallback(async () => {
    await mutate({ action: 'test' })
    await refresh()
    return { ok: true }
  }, [mutate, refresh])

  const value = useMemo(() => ({
    ...state,
    open,
    setOpen,
    filter,
    setFilter,
    push,
    liveMessage,
    newPulse,
    openCenter,
    refresh,
    loadMore: () => state.nextCursor ? load({ append: true, cursor: state.nextCursor, silent: true }) : Promise.resolve(),
    markRead,
    markAllRead,
    archive,
    enablePush,
    disablePush,
    sendTest,
  }), [archive, disablePush, enablePush, filter, liveMessage, load, markAllRead, markRead, newPulse, open, openCenter, push, refresh, sendTest, state])

  return <AdminNotificationsContext.Provider value={value}>{children}</AdminNotificationsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminNotifications() {
  const value = useContext(AdminNotificationsContext)
  if (!value) throw new Error('useAdminNotifications must be used inside AdminNotificationsProvider')
  return value
}
