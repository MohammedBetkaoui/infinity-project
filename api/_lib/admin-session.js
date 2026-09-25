import { createHash, randomBytes } from 'node:crypto'

export const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000
export const ADMIN_ABSOLUTE_SESSION_MS = 8 * 60 * 60 * 1000
export const ADMIN_SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000

export const createAdminSessionToken = () => randomBytes(32).toString('base64url')

export const hashAdminSessionToken = (token) => createHash('sha256').update(token).digest('hex')

export function adminSessionState(session, now = new Date()) {
  if (!session || session.revoked_at) return 'revoked'
  const timestamp = now.getTime()
  const createdAt = new Date(session.created_at).getTime()
  const lastSeenAt = new Date(session.last_seen_at).getTime()
  const expiresAt = new Date(session.expires_at).getTime()
  const passwordChangedAt = new Date(session.admin_user?.password_changed_at || 0).getTime()
  if (![createdAt, lastSeenAt, expiresAt].every(Number.isFinite)) return 'expired'
  if (timestamp >= expiresAt || timestamp - lastSeenAt >= ADMIN_IDLE_TIMEOUT_MS) return 'expired'
  if (passwordChangedAt > createdAt) return 'expired'
  if (!session.admin_user?.is_active) return 'inactive'
  return 'active'
}

export function shouldTouchAdminSession(session, now = new Date()) {
  return now.getTime() - new Date(session.last_seen_at).getTime() >= ADMIN_SESSION_TOUCH_INTERVAL_MS
}
