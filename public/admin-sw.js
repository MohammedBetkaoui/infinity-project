/* Infinity Administration push worker. It never intercepts public-site fetches. */
'use strict'

const ADMIN_WORKER_VERSION = '2026-10-15-1'
const DEFAULT_ACTION = '/admin'
const AIVEX_PATH = /^\/admin\/aivex\/AIVEX[1-9][0-9]?-[0-9A-HJKMNP-TV-Z]{8}$/
const APPLICATION_PATH = /^\/admin\/applications\?record=[0-9a-fA-F-]{36}$/
const STATIC_ADMIN_PATH = /^\/admin\/(overview|activity|settings|applications|aivex)$/

function safeActionPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/admin') || value.includes('\\')) return DEFAULT_ACTION
  try {
    const parsed = new URL(value, self.location.origin)
    if (parsed.origin !== self.location.origin || parsed.hash) return DEFAULT_ACTION
    const candidate = `${parsed.pathname}${parsed.search}`
    return AIVEX_PATH.test(candidate) || APPLICATION_PATH.test(candidate) || STATIC_ADMIN_PATH.test(candidate)
      ? candidate
      : DEFAULT_ACTION
  } catch {
    return DEFAULT_ACTION
  }
}

function normalizePushPayload(event) {
  try {
    const value = event.data?.json()
    if (!value || typeof value !== 'object') return null
    return {
      title: 'Infinity Administration',
      body: typeof value.body === 'string' && value.body.length <= 180
        ? value.body
        : 'A new administration notification is available.',
      tag: typeof value.tag === 'string' ? value.tag.slice(0, 300) : 'infinity-admin-notification',
      notificationId: typeof value.notificationId === 'string' ? value.notificationId : null,
      actionPath: safeActionPath(value.actionPath),
      kind: typeof value.kind === 'string' ? value.kind : 'system_notice',
      severity: ['info', 'success', 'warning', 'critical'].includes(value.severity) ? value.severity : 'info',
    }
  } catch {
    return null
  }
}

self.addEventListener('install', () => {
  // The browser activates this version through its normal update lifecycle;
  // no dashboard reload is forced.
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  const payload = normalizePushPayload(event) || {
    title: 'Infinity Administration',
    body: 'A new administration notification is available.',
    tag: `infinity-admin-${ADMIN_WORKER_VERSION}`,
    notificationId: null,
    actionPath: DEFAULT_ACTION,
    kind: 'system_notice',
    severity: 'info',
  }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const visibleAdmins = windows.filter((client) => {
      try { return client.visibilityState === 'visible' && new URL(client.url).pathname.startsWith('/admin') } catch { return false }
    })
    if (visibleAdmins.length) {
      for (const client of visibleAdmins) client.postMessage({
        type: 'INFINITY_ADMIN_NOTIFICATION',
        notificationId: payload.notificationId,
      })
      return
    }
    await self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/infinity-favicon.svg',
      badge: '/infinity-favicon.svg',
      tag: payload.tag,
      renotify: payload.severity === 'critical',
      requireInteraction: payload.severity === 'critical',
      data: { notificationId: payload.notificationId, actionPath: payload.actionPath },
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const actionPath = safeActionPath(event.notification.data?.actionPath)
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existing = windows.find((client) => {
      try { return new URL(client.url).origin === self.location.origin && new URL(client.url).pathname.startsWith('/admin') } catch { return false }
    })
    if (existing) {
      if ('navigate' in existing) await existing.navigate(actionPath)
      return existing.focus()
    }
    return self.clients.openWindow(actionPath)
  })())
})

