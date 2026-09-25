import { createServerAdminAuthService, requireAdminSession } from './_lib/admin-auth.js'
import { createServerAdminApplicationsService } from './_lib/admin-applications.js'
import { createServerAdminAivexService } from './_lib/admin-aivex.js'
import {
  isApplicationId, parseApplicationListOptions, validateApplicationActionBody,
  validateApplicationBulkBody,
} from './_lib/admin-applications-validation.js'
import {
  isAivexDocumentKey, isAivexReference, parseAivexListOptions, validateAivexActionBody,
} from './_lib/admin-aivex-validation.js'
import { readJsonBody } from './_lib/http.js'
import { getClientIp } from './_lib/security.js'
import {
  adminAuthEnabled,
  adminSessionTokenFromRequest,
  clearAdminSessionCookie,
  createAdminSessionCookie,
  isStrictAdminOrigin,
  safeAdminAuthLog,
  sendAdminJson,
} from './_lib/admin-security.js'

const MAX_BODY_BYTES = 4 * 1024
const MAX_APPLICATION_BODY_BYTES = 24 * 1024
const MAX_AIVEX_BODY_BYTES = 24 * 1024

export function createAdminLoginHandler({
  createService = createServerAdminAuthService,
  env = process.env,
  enabled = adminAuthEnabled,
  trustedOrigin = isStrictAdminOrigin,
} = {}) {
  return async function adminLoginHandler(req, res) {
    res.setHeader('Allow', 'POST')
    if (req.method !== 'POST') return sendAdminJson(res, 405, { success: false, message: 'Method not allowed.' })
    if (!enabled(env)) return sendAdminJson(res, 503, { success: false, message: 'Administrative authentication is unavailable.' })
    if (!trustedOrigin(req, env)) return sendAdminJson(res, 403, { success: false, message: 'Request rejected.' })
    if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return sendAdminJson(res, 415, { success: false, message: 'Unsupported request.' })
    }

    const body = await readJsonBody(req, MAX_BODY_BYTES)
    if (!body || typeof body.username !== 'string' || typeof body.password !== 'string') {
      return sendAdminJson(res, 401, { success: false, message: 'Invalid username or password.' })
    }

    try {
      const result = await createService().login({
        username: body.username,
        password: body.password,
        ip: getClientIp(req),
      })
      if (!result.ok) {
        if (result.retryAfterSeconds) res.setHeader('Retry-After', String(result.retryAfterSeconds))
        return sendAdminJson(res, result.status, { success: false, message: result.message })
      }
      res.setHeader('Set-Cookie', createAdminSessionCookie(result.token, env))
      return sendAdminJson(res, 200, { success: true, user: result.user })
    } catch (error) {
      safeAdminAuthLog('login', error)
      return sendAdminJson(res, 503, { success: false, message: 'Unable to sign in right now.' })
    }
  }
}

export function createAdminSessionHandler({
  createService = createServerAdminAuthService,
  env = process.env,
  enabled = adminAuthEnabled,
} = {}) {
  return async function adminSessionHandler(req, res) {
    res.setHeader('Allow', 'GET')
    if (req.method !== 'GET') return sendAdminJson(res, 405, { authenticated: false })
    if (!enabled(env)) return sendAdminJson(res, 401, { authenticated: false })
    try {
      const result = await createService().resolveSession(adminSessionTokenFromRequest(req, env))
      if (!result.ok) {
        res.setHeader('Set-Cookie', clearAdminSessionCookie(env))
        return sendAdminJson(res, 401, { authenticated: false })
      }
      return sendAdminJson(res, 200, { authenticated: true, user: result.user })
    } catch (error) {
      safeAdminAuthLog('session', error)
      return sendAdminJson(res, 503, { authenticated: false })
    }
  }
}

export function createAdminLogoutHandler({
  createService = createServerAdminAuthService,
  env = process.env,
  enabled = adminAuthEnabled,
  trustedOrigin = isStrictAdminOrigin,
} = {}) {
  return async function adminLogoutHandler(req, res) {
    res.setHeader('Allow', 'POST')
    if (req.method !== 'POST') return sendAdminJson(res, 405, { success: false })
    if (!trustedOrigin(req, env)) return sendAdminJson(res, 403, { success: false, message: 'Request rejected.' })
    try {
      if (enabled(env)) await createService().logout(adminSessionTokenFromRequest(req, env))
    } catch (error) {
      // Logout remains locally effective even if the database is unavailable.
      // The server error is logged without token/cookie/request data.
      safeAdminAuthLog('logout', error)
    }
    res.setHeader('Set-Cookie', clearAdminSessionCookie(env))
    return sendAdminJson(res, 200, { success: true })
  }
}

export function createAdminChangePasswordHandler({
  createService = createServerAdminAuthService,
  env = process.env,
  enabled = adminAuthEnabled,
  trustedOrigin = isStrictAdminOrigin,
} = {}) {
  return async function adminChangePasswordHandler(req, res) {
    res.setHeader('Allow', 'POST')
    if (req.method !== 'POST') return sendAdminJson(res, 405, { success: false, message: 'Method not allowed.' })
    if (!enabled(env)) return sendAdminJson(res, 503, { success: false, message: 'Administrative authentication is unavailable.' })
    if (!trustedOrigin(req, env)) return sendAdminJson(res, 403, { success: false, message: 'Request rejected.' })
    if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return sendAdminJson(res, 415, { success: false, message: 'Unsupported request.' })
    }

    const body = await readJsonBody(req, MAX_BODY_BYTES)
    if (!body || typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') {
      return sendAdminJson(res, 400, { success: false, message: 'Unable to change password.' })
    }

    try {
      const result = await createService().changePassword({
        token: adminSessionTokenFromRequest(req, env),
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
      })
      if (!result.ok) return sendAdminJson(res, result.status, { success: false, message: result.message })
      res.setHeader('Set-Cookie', createAdminSessionCookie(result.token, env))
      return sendAdminJson(res, 200, { success: true, user: result.user })
    } catch (error) {
      safeAdminAuthLog('change_password', error)
      return sendAdminJson(res, 503, { success: false, message: 'Unable to change password right now.' })
    }
  }
}

const actionFromRequest = (req) => {
  const url = new URL(req.url || '/', 'http://localhost')
  const rewrittenAction = url.searchParams.get('__admin_auth_action')
  if (rewrittenAction) return rewrittenAction
  const rewrittenPath = url.searchParams.get('__admin_path')
  if (rewrittenPath?.startsWith('auth/')) return rewrittenPath.slice('auth/'.length)
  const prefix = '/api/admin/auth/'
  return url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : ''
}

export function createAdminAuthRouter(handlers = {}) {
  const routes = {
    login: handlers.login || createAdminLoginHandler(),
    session: handlers.session || createAdminSessionHandler(),
    logout: handlers.logout || createAdminLogoutHandler(),
    'change-password': handlers.changePassword || createAdminChangePasswordHandler(),
  }

  return function adminAuthRouter(req, res) {
    const handler = routes[actionFromRequest(req)]
    if (!handler) return sendAdminJson(res, 404, { success: false, message: 'Not found.' })
    return handler(req, res)
  }
}

const adminPathFromRequest = (req) => {
  const url = new URL(req.url || '/', 'http://localhost')
  const rewrittenPath = url.searchParams.get('__admin_path')
  if (rewrittenPath) return rewrittenPath.replace(/^\/+|\/+$/g, '')
  return url.pathname.replace(/^\/api\/admin\/?/, '').replace(/^\/+|\/+$/g, '')
}

const joinAdministrationEnabled = (env = process.env) => env.ADMIN_JOIN_API_ENABLED === 'true'

export function createAdminApplicationsHandler({
  createService = createServerAdminApplicationsService,
  requireSession = requireAdminSession,
  env = process.env,
  enabled = joinAdministrationEnabled,
  trustedOrigin = isStrictAdminOrigin,
} = {}) {
  return async function adminApplicationsHandler(req, res) {
    if (!enabled(env)) {
      return sendAdminJson(res, 503, { success: false, message: 'Join administration is not enabled yet.' })
    }

    let session
    try {
      session = await requireSession(req)
    } catch (error) {
      safeAdminAuthLog('applications_session', error)
      return sendAdminJson(res, 503, { success: false, message: 'Administrative service unavailable.' })
    }
    if (!session) return sendAdminJson(res, 401, { success: false, message: 'Your session has expired.' })

    const path = adminPathFromRequest(req)
    const url = new URL(req.url || '/', 'http://localhost')
    const detailMatch = path.match(/^applications\/([0-9a-f-]+)$/i)
    const actionMatch = path.match(/^applications\/([0-9a-f-]+)\/actions$/i)
    const isMutation = req.method === 'POST'

    if (isMutation && !trustedOrigin(req, env)) {
      return sendAdminJson(res, 403, { success: false, message: 'Request rejected.' })
    }

    try {
      const service = createService()

      if (path === 'applications' && req.method === 'GET') {
        const parsed = parseApplicationListOptions(url.searchParams)
        if (!parsed.ok) return sendAdminJson(res, 400, { success: false, message: 'Invalid application filters.' })
        const result = await service.list(parsed.value, session.user)
        return sendAdminJson(res, 200, { success: true, ...result })
      }

      if (detailMatch && req.method === 'GET') {
        const applicationId = detailMatch[1]
        if (!isApplicationId(applicationId)) return sendAdminJson(res, 404, { success: false, message: 'Application not found.' })
        const application = await service.detail(applicationId, session.user)
        if (!application) return sendAdminJson(res, 404, { success: false, message: 'Application not found.' })
        return sendAdminJson(res, 200, { success: true, application })
      }

      if (actionMatch && req.method === 'POST') {
        if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
          return sendAdminJson(res, 415, { success: false, message: 'Unsupported request.' })
        }
        const applicationId = actionMatch[1]
        if (!isApplicationId(applicationId)) return sendAdminJson(res, 404, { success: false, message: 'Application not found.' })
        const parsed = validateApplicationActionBody(await readJsonBody(req, MAX_APPLICATION_BODY_BYTES))
        if (!parsed.ok) return sendAdminJson(res, 400, { success: false, message: 'Invalid administrative action.' })
        const result = await service.act(applicationId, parsed.value, session.user)
        if (!result.ok) return sendAdminJson(res, result.status, { success: false, message: result.message })
        return sendAdminJson(res, 200, { success: true, application: result.application })
      }

      if (path === 'applications/bulk-actions' && req.method === 'POST') {
        if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
          return sendAdminJson(res, 415, { success: false, message: 'Unsupported request.' })
        }
        const parsed = validateApplicationBulkBody(await readJsonBody(req, MAX_APPLICATION_BODY_BYTES))
        if (!parsed.ok) return sendAdminJson(res, 400, { success: false, message: 'Invalid bulk action.' })
        const result = await service.bulk(parsed.value, session.user)
        if (!result.ok) return sendAdminJson(res, result.status, { success: false, message: result.message })
        return sendAdminJson(res, 200, { success: true, succeeded: result.succeeded, failed: result.failed })
      }

      res.setHeader('Allow', path === 'applications' || detailMatch ? 'GET' : actionMatch || path === 'applications/bulk-actions' ? 'POST' : 'GET, POST')
      return sendAdminJson(res, path.startsWith('applications') ? 405 : 404, {
        success: false,
        message: path.startsWith('applications') ? 'Method not allowed.' : 'Not found.',
      })
    } catch (error) {
      safeAdminAuthLog('applications', error)
      return sendAdminJson(res, 503, { success: false, message: 'Unable to load Join applications right now.' })
    }
  }
}

const aivexAdministrationEnabled = (env = process.env) => env.ADMIN_AIVEX_API_ENABLED === 'true'

const safeDownloadName = (value) => String(value || 'document')
  .normalize('NFKD')
  .replace(/[^A-Za-z0-9._ -]/g, '_')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 160) || 'document'

function sendAdminDocument(res, document) {
  const disposition = document.confidential ? 'inline' : 'attachment'
  res.statusCode = 200
  res.setHeader('Cache-Control', 'no-store, private')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Vary', 'Cookie, Origin')
  res.setHeader('Content-Type', document.mimeType || 'application/octet-stream')
  res.setHeader('Content-Length', String(document.buffer.length))
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeDownloadName(document.name)}"`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.end(document.buffer)
}

export function createAdminAivexHandler({
  createService = createServerAdminAivexService,
  requireSession = requireAdminSession,
  env = process.env,
  enabled = aivexAdministrationEnabled,
  trustedOrigin = isStrictAdminOrigin,
} = {}) {
  return async function adminAivexHandler(req, res) {
    if (!enabled(env)) {
      return sendAdminJson(res, 503, { success: false, message: 'AIVEX administration is not enabled yet.' })
    }

    let session
    try {
      session = await requireSession(req)
    } catch (error) {
      safeAdminAuthLog('aivex_session', error)
      return sendAdminJson(res, 503, { success: false, message: 'Administrative service unavailable.' })
    }
    if (!session) return sendAdminJson(res, 401, { success: false, message: 'Your session has expired.' })

    const path = adminPathFromRequest(req)
    const url = new URL(req.url || '/', 'http://localhost')
    const detailMatch = path.match(/^aivex\/(AIVEX[1-9][0-9]?-[0-9A-HJKMNP-TV-Z]{8})$/)
    const actionMatch = path.match(/^aivex\/(AIVEX[1-9][0-9]?-[0-9A-HJKMNP-TV-Z]{8})\/actions$/)
    const documentMatch = path.match(/^aivex\/(AIVEX[1-9][0-9]?-[0-9A-HJKMNP-TV-Z]{8})\/documents\/([A-Za-z0-9-]+)\/content$/)

    if (req.method === 'POST' && !trustedOrigin(req, env)) {
      return sendAdminJson(res, 403, { success: false, message: 'Request rejected.' })
    }

    try {
      const service = createService()
      if (path === 'aivex' && req.method === 'GET') {
        const parsed = parseAivexListOptions(url.searchParams)
        if (!parsed.ok) return sendAdminJson(res, 400, { success: false, message: 'Invalid AIVEX filters.' })
        const result = await service.list(parsed.value, session.user)
        return sendAdminJson(res, 200, { success: true, ...result })
      }

      if (detailMatch && req.method === 'GET') {
        const reference = detailMatch[1]
        if (!isAivexReference(reference)) return sendAdminJson(res, 404, { success: false, message: 'AIVEX file not found.' })
        const team = await service.detail(reference, session.user)
        if (!team) return sendAdminJson(res, 404, { success: false, message: 'AIVEX file not found.' })
        return sendAdminJson(res, 200, { success: true, team })
      }

      if (actionMatch && req.method === 'POST') {
        if (!String(req.headers?.['content-type'] || '').toLowerCase().startsWith('application/json')) {
          return sendAdminJson(res, 415, { success: false, message: 'Unsupported request.' })
        }
        const reference = actionMatch[1]
        const parsed = validateAivexActionBody(await readJsonBody(req, MAX_AIVEX_BODY_BYTES))
        if (!parsed.ok) return sendAdminJson(res, 400, { success: false, message: 'Invalid administrative action.' })
        const result = await service.act(reference, parsed.value, session.user)
        if (!result.ok) return sendAdminJson(res, result.status, { success: false, message: result.message })
        return sendAdminJson(res, 200, { success: true, team: result.team })
      }

      if (documentMatch && req.method === 'GET') {
        const [, reference, documentKey] = documentMatch
        if (!isAivexReference(reference) || !isAivexDocumentKey(documentKey)) {
          return sendAdminJson(res, 404, { success: false, message: 'Document not found.' })
        }
        const result = await service.document(reference, documentKey, session.user)
        if (!result.ok) return sendAdminJson(res, result.status, { success: false, message: result.message })
        return sendAdminDocument(res, result)
      }

      const isAivexPath = path === 'aivex' || path.startsWith('aivex/')
      res.setHeader('Allow', actionMatch ? 'POST' : 'GET')
      return sendAdminJson(res, isAivexPath ? 405 : 404, {
        success: false,
        message: isAivexPath ? 'Method not allowed.' : 'Not found.',
      })
    } catch (error) {
      safeAdminAuthLog('aivex', error)
      return sendAdminJson(res, 503, { success: false, message: 'Unable to load AIVEX administration right now.' })
    }
  }
}

export function createAdminRouter(handlers = {}) {
  const auth = handlers.auth || createAdminAuthRouter()
  const applications = handlers.applications || createAdminApplicationsHandler()
  const aivex = handlers.aivex || createAdminAivexHandler()
  return function adminRouter(req, res) {
    const path = adminPathFromRequest(req)
    if (path.startsWith('auth/')) return auth(req, res)
    if (path === 'applications' || path.startsWith('applications/')) return applications(req, res)
    if (path === 'aivex' || path.startsWith('aivex/')) return aivex(req, res)
    return sendAdminJson(res, 404, { success: false, message: 'Not found.' })
  }
}

export default createAdminRouter()
