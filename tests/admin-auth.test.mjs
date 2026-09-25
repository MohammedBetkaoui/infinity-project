import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import { createAdminAuthService, ADMIN_INVALID_CREDENTIALS_MESSAGE } from '../api/_lib/admin-auth.js'
import { hashAdminPassword, verifyAdminPassword } from '../api/_lib/admin-password.js'
import { hashAdminSessionToken } from '../api/_lib/admin-session.js'
import {
  ADMIN_DEVELOPMENT_COOKIE, ADMIN_PRODUCTION_COOKIE, createAdminSessionCookie,
} from '../api/_lib/admin-security.js'
import { createAdminLoginHandler } from '../api/admin/auth/login.js'
import { createAdminLogoutHandler } from '../api/admin/auth/logout.js'
import { adminLoginPathFor, safeAdminReturnTo } from '../src/admin/adminAuthPath.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const NOW = new Date('2026-09-25T10:00:00.000Z')
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SESSION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const RAW_TOKEN = 'test_session_token_abcdefghijklmnopqrstuvwxyz_0123456789'
const CURRENT_PASSWORD = 'Current password 2026!'
const NEXT_PASSWORD = 'Next password 2026!'
const RATE_SECRET = 'test-only-rate-limit-secret-at-least-32-bytes'

class MemoryAdminStore {
  constructor({ active = true } = {}) {
    this.user = {
      id: USER_ID,
      username: 'Infinity.Admin',
      username_normalized: 'infinity.admin',
      display_name: 'Infinity Operator',
      password_hash: 'fixture-current-hash',
      role: 'super_admin',
      is_active: active,
      failed_login_count: 0,
      locked_until: null,
      password_changed_at: '2026-09-20T08:00:00.000Z',
    }
    this.sessions = new Map()
    this.events = []
    this.limits = new Map()
    this.sessionSequence = 0
  }

  async consumeRateLimit(type, hash, policy, now) {
    const key = `${type}:${hash}`
    const existing = this.limits.get(key)
    if (!existing || now.getTime() - existing.started >= policy.windowMs) {
      this.limits.set(key, { count: 1, started: now.getTime(), blockedUntil: 0 })
      return { allowed: true, retryAfterSeconds: 0 }
    }
    if (existing.blockedUntil > now.getTime()) return { allowed: false, retryAfterSeconds: Math.ceil((existing.blockedUntil - now.getTime()) / 1000) }
    existing.count += 1
    if (existing.count > policy.limit) {
      existing.blockedUntil = now.getTime() + policy.blockMs
      return { allowed: false, retryAfterSeconds: Math.ceil(policy.blockMs / 1000) }
    }
    return { allowed: true, retryAfterSeconds: 0 }
  }

  async findUser(username) { return username === this.user.username_normalized ? { ...this.user } : null }

  async recordLoginFailure(userId, now) {
    assert.equal(userId, USER_ID)
    this.events.push({ userId, type: 'login_failure' })
    if (this.user.locked_until && new Date(this.user.locked_until) > now) return { justLocked: false, lockedUntil: this.user.locked_until }
    this.user.failed_login_count = this.user.locked_until ? 1 : this.user.failed_login_count + 1
    this.user.locked_until = null
    if (this.user.failed_login_count >= 5) {
      this.user.locked_until = new Date(now.getTime() + 15 * 60 * 1000).toISOString()
      this.events.push({ userId, type: 'account_locked' })
      return { justLocked: true, lockedUntil: this.user.locked_until }
    }
    return { justLocked: false, lockedUntil: null }
  }

  async recordUnknownLoginFailure() { this.events.push({ userId: null, type: 'login_failure' }) }

  async createLoginSession(userId, tokenHash, expectedPasswordChangedAt, now, expiresAt) {
    assert.equal(expectedPasswordChangedAt, this.user.password_changed_at)
    this.user.failed_login_count = 0
    this.user.locked_until = null
    const id = this.sessionSequence++ ? crypto.randomUUID() : SESSION_ID
    this.sessions.set(tokenHash, {
      id, admin_user_id: userId, created_at: now.toISOString(), last_seen_at: now.toISOString(),
      expires_at: expiresAt.toISOString(), revoked_at: null, admin_user: { ...this.user },
    })
    this.events.push({ userId, type: 'login_success' })
    return id
  }

  async findSession(tokenHash) { return this.sessions.get(tokenHash) || null }
  async touchSession(sessionId, now) {
    const session = [...this.sessions.values()].find((entry) => entry.id === sessionId)
    if (session) session.last_seen_at = now.toISOString()
  }
  async revokeSession(sessionId, eventType, now) {
    const session = [...this.sessions.values()].find((entry) => entry.id === sessionId)
    if (!session || session.revoked_at) return false
    session.revoked_at = now.toISOString()
    this.events.push({ userId: session.admin_user_id, type: eventType })
    return true
  }
  async changePasswordAndRotate(userId, currentSessionId, passwordHash, tokenHash, now, expiresAt) {
    this.user.password_hash = passwordHash
    this.user.password_changed_at = now.toISOString()
    for (const session of this.sessions.values()) if (session.admin_user_id === userId && !session.revoked_at) session.revoked_at = now.toISOString()
    const id = crypto.randomUUID()
    this.sessions.set(tokenHash, {
      id, admin_user_id: userId, created_at: now.toISOString(), last_seen_at: now.toISOString(),
      expires_at: expiresAt.toISOString(), revoked_at: null, admin_user: { ...this.user },
    })
    this.events.push({ userId, type: 'password_changed', currentSessionId })
    return id
  }
}

const verifyFixturePassword = async (password, hash) => (
  (hash === 'fixture-current-hash' && password === CURRENT_PASSWORD)
  || (hash === 'fixture-next-hash' && password === NEXT_PASSWORD)
)

function serviceFor(store, { token = RAW_TOKEN, now = () => NOW } = {}) {
  return createAdminAuthService({
    store,
    now,
    rateLimitSecret: RATE_SECRET,
    verifyPassword: verifyFixturePassword,
    hashPassword: async () => 'fixture-next-hash',
    consumePasswordTiming: async () => false,
    createToken: () => token,
  })
}

function request(method, body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.headers = headers
  req.socket = { remoteAddress: '127.0.0.8' }
  return req
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(value) { this.body = value ? JSON.parse(value) : null },
  }
}

const productionEnv = { NODE_ENV: 'production', ADMIN_AUTH_ENABLED: 'true' }
const sameOriginHeaders = { host: 'admin.infinity.example', origin: 'https://admin.infinity.example', 'content-type': 'application/json' }

test('passwords use strong salted scrypt hashes and plaintext is never embedded', async () => {
  const first = await hashAdminPassword(CURRENT_PASSWORD)
  const second = await hashAdminPassword(CURRENT_PASSWORD)
  assert.notEqual(first, second)
  assert.match(first, /^scrypt\$v=1\$N=65536,r=8,p=1\$/)
  assert.doesNotMatch(first, new RegExp(CURRENT_PASSWORD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.equal(await verifyAdminPassword(CURRENT_PASSWORD, first), true)
  assert.equal(await verifyAdminPassword('Incorrect password 2026!', first), false)
})

test('valid login creates a hash-only server session and returns safe identity', async () => {
  const store = new MemoryAdminStore()
  const result = await serviceFor(store).login({ username: ' Infinity.Admin ', password: CURRENT_PASSWORD, ip: '192.0.2.10' })
  assert.equal(result.ok, true)
  assert.equal(result.token, RAW_TOKEN)
  assert.deepEqual(result.user, { id: USER_ID, username: 'Infinity.Admin', displayName: 'Infinity Operator', role: 'super_admin' })
  assert.equal(store.sessions.has(RAW_TOKEN), false)
  assert.equal(store.sessions.has(hashAdminSessionToken(RAW_TOKEN)), true)
  assert.doesNotMatch(JSON.stringify([...store.sessions.values()]), new RegExp(RAW_TOKEN))
})

test('unknown username and incorrect password produce the same generic response', async () => {
  const unknown = await serviceFor(new MemoryAdminStore()).login({ username: 'missing.admin', password: CURRENT_PASSWORD, ip: '192.0.2.11' })
  const incorrect = await serviceFor(new MemoryAdminStore()).login({ username: 'infinity.admin', password: 'Incorrect password 2026!', ip: '192.0.2.12' })
  assert.deepEqual({ status: unknown.status, message: unknown.message }, { status: 401, message: ADMIN_INVALID_CREDENTIALS_MESSAGE })
  assert.deepEqual({ status: incorrect.status, message: incorrect.message }, { status: 401, message: ADMIN_INVALID_CREDENTIALS_MESSAGE })
})

test('five consecutive failures lock the account and correct credentials remain generic while locked', async () => {
  const store = new MemoryAdminStore()
  const service = serviceFor(store)
  for (let index = 0; index < 5; index++) {
    const result = await service.login({ username: 'infinity.admin', password: 'Incorrect password 2026!', ip: '192.0.2.13' })
    assert.equal(result.message, ADMIN_INVALID_CREDENTIALS_MESSAGE)
  }
  assert.equal(store.user.failed_login_count, 5)
  assert(new Date(store.user.locked_until) > NOW)
  assert(store.events.some((event) => event.type === 'account_locked'))
  const locked = await service.login({ username: 'infinity.admin', password: CURRENT_PASSWORD, ip: '192.0.2.13' })
  assert.deepEqual({ status: locked.status, message: locked.message }, { status: 401, message: ADMIN_INVALID_CREDENTIALS_MESSAGE })
  assert.equal(store.sessions.size, 0)
})

test('inactive administrators cannot create or use sessions', async () => {
  const inactiveStore = new MemoryAdminStore({ active: false })
  const rejected = await serviceFor(inactiveStore).login({ username: 'infinity.admin', password: CURRENT_PASSWORD, ip: '192.0.2.14' })
  assert.equal(rejected.ok, false)
  assert.equal(inactiveStore.sessions.size, 0)

  const activeStore = new MemoryAdminStore()
  const service = serviceFor(activeStore)
  await service.login({ username: 'infinity.admin', password: CURRENT_PASSWORD, ip: '192.0.2.15' })
  activeStore.sessions.get(hashAdminSessionToken(RAW_TOKEN)).admin_user.is_active = false
  assert.equal((await service.resolveSession(RAW_TOKEN)).ok, false)
})

test('valid sessions resolve; expired and revoked sessions are rejected', async () => {
  const store = new MemoryAdminStore()
  const service = serviceFor(store)
  await service.login({ username: 'infinity.admin', password: CURRENT_PASSWORD, ip: '192.0.2.16' })
  const valid = await service.resolveSession(RAW_TOKEN)
  assert.equal(valid.ok, true)
  assert.equal(valid.user.username, 'Infinity.Admin')
  const session = store.sessions.get(hashAdminSessionToken(RAW_TOKEN))
  session.expires_at = new Date(NOW.getTime() - 1).toISOString()
  assert.equal((await service.resolveSession(RAW_TOKEN)).ok, false)
  assert.equal(session.revoked_at, NOW.toISOString())
  assert(store.events.some((event) => event.type === 'session_expired'))

  const revokedStore = new MemoryAdminStore()
  const revokedService = serviceFor(revokedStore)
  await revokedService.login({ username: 'infinity.admin', password: CURRENT_PASSWORD, ip: '192.0.2.17' })
  revokedStore.sessions.get(hashAdminSessionToken(RAW_TOKEN)).revoked_at = NOW.toISOString()
  assert.equal((await revokedService.resolveSession(RAW_TOKEN)).ok, false)
})

test('logout revokes the server session and the endpoint expires the cookie', async () => {
  const store = new MemoryAdminStore()
  const service = serviceFor(store)
  await service.login({ username: 'infinity.admin', password: CURRENT_PASSWORD, ip: '192.0.2.18' })
  const handler = createAdminLogoutHandler({ createService: () => service, env: productionEnv })
  const res = response()
  await handler(request('POST', {}, { ...sameOriginHeaders, cookie: `${ADMIN_PRODUCTION_COOKIE}=${RAW_TOKEN}` }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(store.sessions.get(hashAdminSessionToken(RAW_TOKEN)).revoked_at, NOW.toISOString())
  assert.match(res.headers['set-cookie'], new RegExp(`^${ADMIN_PRODUCTION_COOKIE}=;`))
  assert.match(res.headers['set-cookie'], /HttpOnly/)
  assert.match(res.headers['set-cookie'], /Max-Age=0/)
})

test('password change hashes the new password, revokes every old session and rotates the current one', async () => {
  const store = new MemoryAdminStore()
  const service = serviceFor(store, { token: RAW_TOKEN })
  await service.login({ username: 'infinity.admin', password: CURRENT_PASSWORD, ip: '192.0.2.19' })
  store.sessions.set(hashAdminSessionToken('another-old-session-token-abcdefghijklmnopqrstuvwxyz'), {
    id: crypto.randomUUID(), admin_user_id: USER_ID, created_at: NOW.toISOString(), last_seen_at: NOW.toISOString(),
    expires_at: new Date(NOW.getTime() + 60_000).toISOString(), revoked_at: null, admin_user: { ...store.user },
  })
  const rotatedToken = 'rotated_session_token_abcdefghijklmnopqrstuvwxyz_9876543210'
  const changed = await serviceFor(store, { token: rotatedToken }).changePassword({
    token: RAW_TOKEN,
    currentPassword: CURRENT_PASSWORD,
    newPassword: NEXT_PASSWORD,
  })
  assert.equal(changed.ok, true)
  assert.equal(store.user.password_hash, 'fixture-next-hash')
  assert.notEqual(store.user.password_hash, NEXT_PASSWORD)
  assert.equal(store.sessions.get(hashAdminSessionToken(RAW_TOKEN)).revoked_at, NOW.toISOString())
  assert(store.sessions.get(hashAdminSessionToken('another-old-session-token-abcdefghijklmnopqrstuvwxyz')).revoked_at)
  assert.equal(store.sessions.get(hashAdminSessionToken(rotatedToken)).revoked_at, null)
  assert(store.events.some((event) => event.type === 'password_changed'))
})

test('production cookie uses the __Host prefix and all required flags; localhost has a separate cookie', () => {
  const production = createAdminSessionCookie(RAW_TOKEN, { NODE_ENV: 'production' })
  assert.match(production, new RegExp(`^${ADMIN_PRODUCTION_COOKIE}=`))
  for (const flag of ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict', 'Max-Age=28800']) assert.match(production, new RegExp(flag))
  assert.doesNotMatch(production, /Domain=/i)
  const development = createAdminSessionCookie(RAW_TOKEN, { NODE_ENV: 'development' })
  assert.match(development, new RegExp(`^${ADMIN_DEVELOPMENT_COOKIE}=`))
  assert.doesNotMatch(development, /; Secure/)
})

test('cross-origin login mutations fail closed before authentication runs', async () => {
  let called = false
  const handler = createAdminLoginHandler({
    createService: () => ({ login: async () => { called = true } }),
    env: productionEnv,
  })
  const res = response()
  await handler(request('POST', { username: 'infinity.admin', password: CURRENT_PASSWORD }, {
    host: 'admin.infinity.example', origin: 'https://evil.example', 'content-type': 'application/json',
  }), res)
  assert.equal(res.statusCode, 403)
  assert.equal(called, false)
  assert.equal(res.headers['cache-control'], 'no-store')
})

test('login endpoint never returns the raw token or password', async () => {
  const store = new MemoryAdminStore()
  const handler = createAdminLoginHandler({ createService: () => serviceFor(store), env: productionEnv })
  const res = response()
  await handler(request('POST', { username: 'infinity.admin', password: CURRENT_PASSWORD }, sameOriginHeaders), res)
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['set-cookie'], new RegExp(`^${ADMIN_PRODUCTION_COOKIE}=${RAW_TOKEN}`))
  assert.doesNotMatch(JSON.stringify(res.body), new RegExp(RAW_TOKEN))
  assert.doesNotMatch(JSON.stringify(res.body), new RegExp(CURRENT_PASSWORD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('route guard accepts only internal admin return paths and protects direct workspace access', async () => {
  assert.equal(safeAdminReturnTo('/admin/aivex/nova?lang=ar'), '/admin/aivex/nova?lang=ar')
  assert.equal(adminLoginPathFor('/admin/overview'), '/admin/login?returnTo=%2Fadmin%2Foverview')
  for (const unsafe of ['https://evil.example/admin/overview', '//evil.example/admin/overview', '/admin/login?returnTo=/admin/overview', '/members', '/admin/../']) {
    assert.equal(safeAdminReturnTo(unsafe), '/admin/overview')
  }
  const app = await read('src/admin/AdminApp.jsx')
  assert.match(app, /status !== 'authenticated'/)
  assert.match(app, /<Navigate to={adminLoginPathFor\(/)
  assert.match(app, /<AdminProvider><Workspace\/><\/AdminProvider>/)
  assert.match(app, /status === 'loading'.*SecureLoadingState/s)
})

test('browser auth code persists no token and imports no Supabase server client', async () => {
  const auth = await read('src/admin/AdminAuth.jsx')
  const browserAuth = `${auth}\n${await read('src/admin/adminAuthPath.js')}`
  assert.doesNotMatch(browserAuth, /localStorage|sessionStorage|SUPABASE_SECRET_KEY|service_role|createClient\(|@supabase\/supabase-js/)
  assert.match(auth, /credentials: 'same-origin'/)
  assert.match(auth, /\/api\/admin\/auth\/session/)
})

test('admin migration is credential-free, RLS-protected and grants no browser table access', async () => {
  const migration = (await read('supabase/migrations/20260925120000_admin_authentication.sql')).toLowerCase()
  for (const table of ['admin_users', 'admin_sessions', 'admin_auth_events', 'admin_login_rate_limits']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`))
  }
  assert.doesNotMatch(migration, /create\s+policy/)
  assert.doesNotMatch(migration, /insert\s+into\s+public\.admin_users/)
  assert.match(migration, /grant execute on function public\.admin_change_password_and_rotate[\s\S]+to service_role/)
  assert.match(migration, /revoke all on function public\.admin_change_password_and_rotate[\s\S]+from public, anon, authenticated/)
})

test('the existing dashboard remains behind auth and uses the real identity for actions', async () => {
  const store = await read('src/admin/AdminStore.jsx')
  const ui = await read('src/admin/AdminUI.jsx')
  const login = await read('src/admin/AdminUtilityPages.jsx')
  assert.match(store, /actor = user\?\.displayName/)
  assert.doesNotMatch(ui, /Demo session ended|navigate\('\/admin\/login'\) \}\}/)
  assert.match(ui, /await logout\(\)/)
  assert.match(login, /autocomplete="username"/i)
  assert.match(login, /autocomplete="current-password"/i)
  assert.doesNotMatch(login, /DEMONSTRATION PROFILE|Enter demo workspace|No credentials or external services are used/)
})
