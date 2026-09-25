import { createServerSupabaseClient } from './aivex-server.js'
import { createAdminAuthStore } from './admin-auth-store.js'
import {
  consumeAdminPasswordTiming, hashAdminPassword, passwordPolicyError, verifyAdminPassword,
} from './admin-password.js'
import {
  ADMIN_ABSOLUTE_SESSION_MS, adminSessionState, createAdminSessionToken,
  hashAdminSessionToken, shouldTouchAdminSession,
} from './admin-session.js'
import {
  adminRateLimitKey, adminSessionTokenFromRequest, normalizeAdminUsername, publicAdminIdentity,
} from './admin-security.js'

export const ADMIN_INVALID_CREDENTIALS_MESSAGE = 'Invalid username or password.'
export const ADMIN_PASSWORD_POLICY_MESSAGE = 'Use a password between 12 and 128 characters.'

const USERNAME_RATE_POLICY = Object.freeze({ limit: 10, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 })
const IP_RATE_POLICY = Object.freeze({ limit: 30, windowMs: 15 * 60 * 1000, blockMs: 15 * 60 * 1000 })

const isFuture = (value, now) => value && new Date(value).getTime() > now.getTime()

export function createAdminAuthService({
  store,
  now = () => new Date(),
  rateLimitSecret = process.env.ADMIN_RATE_LIMIT_SECRET,
  verifyPassword = verifyAdminPassword,
  hashPassword = hashAdminPassword,
  consumePasswordTiming = consumeAdminPasswordTiming,
  createToken = createAdminSessionToken,
  hashToken = hashAdminSessionToken,
} = {}) {
  if (!store) throw Object.assign(new Error('admin_auth_store_required'), { stage: 'configuration', code: 'configuration_error' })

  const resolveToken = async (token, { touch = true } = {}) => {
    if (!token) return { ok: false, reason: 'missing' }
    const session = await store.findSession(hashToken(token))
    if (!session) return { ok: false, reason: 'invalid' }
    const clock = now()
    const state = adminSessionState(session, clock)
    if (state !== 'active') {
      if (!session.revoked_at) await store.revokeSession(session.id, 'session_expired', clock)
      return { ok: false, reason: state }
    }
    if (touch && shouldTouchAdminSession(session, clock)) await store.touchSession(session.id, clock)
    return {
      ok: true,
      sessionId: session.id,
      userRecord: session.admin_user,
      user: publicAdminIdentity(session.admin_user),
    }
  }

  return {
    async login({ username, password, ip }) {
      const clock = now()
      const normalized = normalizeAdminUsername(username)
      const safeUsernameKey = normalized || `invalid:${String(username || '').slice(0, 80)}`
      const [usernameLimit, ipLimit] = await Promise.all([
        store.consumeRateLimit('username', adminRateLimitKey(safeUsernameKey, rateLimitSecret), USERNAME_RATE_POLICY, clock),
        store.consumeRateLimit('ip', adminRateLimitKey(ip || 'unknown', rateLimitSecret), IP_RATE_POLICY, clock),
      ])

      if (!usernameLimit.allowed || !ipLimit.allowed) {
        await consumePasswordTiming(password)
        return {
          ok: false,
          status: 429,
          message: ADMIN_INVALID_CREDENTIALS_MESSAGE,
          retryAfterSeconds: Math.max(usernameLimit.retryAfterSeconds, ipLimit.retryAfterSeconds, 1),
        }
      }

      const user = normalized ? await store.findUser(normalized) : null
      const passwordMatches = user
        ? await verifyPassword(password, user.password_hash)
        : await consumePasswordTiming(password)
      const locked = user && isFuture(user.locked_until, clock)

      if (!user || !passwordMatches || !user.is_active || locked) {
        if (user) await store.recordLoginFailure(user.id, clock)
        else if (!user) await store.recordUnknownLoginFailure(clock)
        return { ok: false, status: 401, message: ADMIN_INVALID_CREDENTIALS_MESSAGE }
      }

      const token = createToken()
      const expiresAt = new Date(clock.getTime() + ADMIN_ABSOLUTE_SESSION_MS)
      await store.createLoginSession(user.id, hashToken(token), user.password_changed_at, clock, expiresAt)
      return { ok: true, token, expiresAt, user: publicAdminIdentity(user) }
    },

    resolveSession(token, options) {
      return resolveToken(token, options)
    },

    async logout(token) {
      if (!token) return { ok: true }
      const session = await store.findSession(hashToken(token))
      if (session && !session.revoked_at) await store.revokeSession(session.id, 'logout', now())
      return { ok: true }
    },

    async changePassword({ token, currentPassword, newPassword }) {
      const policyError = passwordPolicyError(newPassword)
      if (policyError) return { ok: false, status: 400, message: ADMIN_PASSWORD_POLICY_MESSAGE }
      const resolved = await resolveToken(token, { touch: false })
      if (!resolved.ok) return { ok: false, status: 401, message: 'Your session has expired.' }
      const currentMatches = await verifyPassword(currentPassword, resolved.userRecord.password_hash)
      if (!currentMatches) return { ok: false, status: 400, message: 'Unable to change password.' }
      const reusesCurrentPassword = await verifyPassword(newPassword, resolved.userRecord.password_hash)
      if (reusesCurrentPassword) return { ok: false, status: 400, message: 'Choose a password different from your current password.' }

      const passwordHash = await hashPassword(newPassword)
      const nextToken = createToken()
      const clock = now()
      const expiresAt = new Date(clock.getTime() + ADMIN_ABSOLUTE_SESSION_MS)
      await store.changePasswordAndRotate(
        resolved.userRecord.id,
        resolved.sessionId,
        passwordHash,
        hashToken(nextToken),
        clock,
        expiresAt,
      )
      return { ok: true, token: nextToken, expiresAt, user: resolved.user }
    },
  }
}

export function createServerAdminAuthService() {
  return createAdminAuthService({ store: createAdminAuthStore(createServerSupabaseClient()) })
}

// Reusable server-side guard for every future /api/admin/* endpoint.
// Callers receive only the authenticated identity/session id, never the token.
export async function requireAdminSession(req, { service = createServerAdminAuthService(), env = process.env } = {}) {
  const token = adminSessionTokenFromRequest(req, env)
  const result = await service.resolveSession(token)
  return result.ok ? { user: result.user, sessionId: result.sessionId } : null
}
