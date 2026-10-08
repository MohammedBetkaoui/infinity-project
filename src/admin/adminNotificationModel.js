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
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : undefined, { day: 'numeric', month: 'short' }).format(date)
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
