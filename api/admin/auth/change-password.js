import { createServerAdminAuthService } from '../../_lib/admin-auth.js'
import { readJsonBody } from '../../_lib/http.js'
import {
  adminAuthEnabled, adminSessionTokenFromRequest, createAdminSessionCookie, isStrictAdminOrigin,
  safeAdminAuthLog, sendAdminJson,
} from '../../_lib/admin-security.js'

const MAX_BODY_BYTES = 4 * 1024

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

export default createAdminChangePasswordHandler()
