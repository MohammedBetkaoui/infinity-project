import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAdminAuth } from './AdminAuth'
import { useAdminPreferences } from './AdminPreferences'

const AdminNotificationsContext = createContext(null)
const NOTIFICATIONS_ENDPOINT = '/api/admin/notifications'
const ACTIONS_ENDPOINT = '/api/admin/notifications/actions'
const PUSH_ENDPOINT = '/api/admin/notifications/push-subscription'
const FOREGROUND_REFRESH_MS = 60 * 1000

const readJson = async (response) => {
  try { return await response.json() } catch { return {} }
}

export function relativeNotificationTime(value, now = new Date(), language = 'en') {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))
  if (language === 'ar') {
    if (seconds < 45) return 'الآن'
    if (seconds < 60 * 60) return `منذ ${Math.floor(seconds / 60)} د`
    if (seconds < 24 * 60 * 60) return `منذ ${Math.floor(seconds / 3600)} س`
    if (seconds < 48 * 60 * 60) return 'أمس'
  }
  if (seconds < 45) return 'Just now'
  if (seconds < 60 * 60) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 24 * 60 * 60) return `${Math.floor(seconds / 3600)} h ago`
  if (seconds < 48 * 60 * 60) return language === 'ar' ? 'أمس' : 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date)
}

export function notificationCapability() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  return 'available'
}

export function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replaceAll('-', '+').replaceAll('_', '/')
  const decoded = window.atob(base64)
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

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
  const inFlight = useRef(false)
  const pulseTimer = useRef(null)

  const mutate = useCallback(async (body) => {
    const { response, body: result } = await request(ACTIONS_ENDPOINT, { method: 'POST', body: JSON.stringify(body) })
    if (!response.ok) throw new Error(result.message || 'Unable to update notifications.')
    return result
  }, [request])

  const load = useCallback(async ({ append = false, cursor = null, silent = false } = {}) => {
    if (inFlight.current && !append) return null
    if (!append) inFlight.current = true
    if (!silent && !append) setState((current) => ({ ...current, status: 'loading', error: '' }))
    try {
      const params = new URLSearchParams({ limit: '24' })
      if (filter !== 'all') params.set('source', filter)
      if (cursor) params.set('cursor', cursor)
      const { response, body } = await request(`${NOTIFICATIONS_ENDPOINT}?${params}`)
      if (!response.ok) throw new Error(body.message || 'Unable to load notifications.')
      setState((current) => ({
        status: 'ready',
        notifications: append ? [...current.notifications, ...(body.notifications || [])] : (body.notifications || []),
        unreadCount: Number(body.unreadCount || 0),
        nextCursor: body.nextCursor || null,
        error: '',
      }))
      return body.notifications || []
    } catch (error) {
      setState((current) => ({ ...current, status: silent ? current.status : 'error', error: error.message || 'Unable to load notifications.' }))
      return null
    } finally {
      if (!append) inFlight.current = false
    }
  }, [filter, request])

  useEffect(() => { load() }, [load])

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
      setLiveMessage('New administration notification received.')
      setNewPulse(true)
      window.clearTimeout(pulseTimer.current)
      pulseTimer.current = window.setTimeout(() => setNewPulse(false), 900)
      if (preferences.notificationSoundEnabled) playNotificationTone()
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage)
      window.clearTimeout(pulseTimer.current)
    }
  }, [preferences.notificationSoundEnabled, refresh])

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
    const clock = new Date().toISOString()
    setState((current) => ({
      ...current,
      unreadCount: Number(result.unreadCount || 0),
      notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt || clock, seenAt: item.seenAt || clock })),
    }))
  }, [mutate])

  const archive = useCallback(async (notificationId) => {
    const result = await mutate({ action: 'archive', notificationId })
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
    setPush((current) => ({ ...current, status: 'enabling', error: '' }))
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        const status = permission === 'denied' ? 'blocked' : 'not_configured'
        setPush((current) => ({ ...current, status }))
        return { ok: false, status }
      }
      const publicKey = String(import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY || '').trim()
      if (!publicKey) throw new Error('Web Push is not configured for this deployment.')
      const registration = await registerWorker()
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const { response, body } = await request(PUSH_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ subscription: subscription.toJSON(), deviceLabel: 'This browser' }),
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
