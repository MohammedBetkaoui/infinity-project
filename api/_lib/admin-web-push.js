import webpush from 'web-push'

const VAPID_KEY_RE = /^[A-Za-z0-9_-]{40,180}$/
const VAPID_SUBJECT_RE = /^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/i

export const ADMIN_PUSH_TIMEOUT_MS = 5000

export function readAdminWebPushConfig(env = process.env) {
  const publicKey = String(env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY || '').trim()
  const privateKey = String(env.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim()
  const subject = String(env.WEB_PUSH_VAPID_SUBJECT || '').trim()
  if (!publicKey && !privateKey && !subject) return { configured: false }
  if (!VAPID_KEY_RE.test(publicKey) || !VAPID_KEY_RE.test(privateKey) || !VAPID_SUBJECT_RE.test(subject)) {
    return { configured: false, invalid: true }
  }
  return { configured: true, publicKey, privateKey, subject }
}

export function createAdminWebPush({ env = process.env, client = webpush } = {}) {
  const config = readAdminWebPushConfig(env)
  if (!config.configured) return { configured: false, invalid: config.invalid === true }

  client.setVapidDetails(config.subject, config.publicKey, config.privateKey)
  return {
    configured: true,
    async send(subscription, payload, { urgency = 'normal' } = {}) {
      return client.sendNotification(subscription, JSON.stringify(payload), {
        TTL: 60 * 60,
        urgency,
        timeout: ADMIN_PUSH_TIMEOUT_MS,
      })
    },
  }
}

export function pushFailureStatus(error) {
  const value = Number(error?.statusCode || error?.status)
  return Number.isInteger(value) ? value : null
}

export function isExpiredPushSubscription(error) {
  return [404, 410].includes(pushFailureStatus(error))
}
