import { createServerAdminAuthService } from '../../_lib/admin-auth.js'
import {
  adminAuthEnabled, adminSessionTokenFromRequest, clearAdminSessionCookie, isStrictAdminOrigin,
  safeAdminAuthLog, sendAdminJson,
} from '../../_lib/admin-security.js'

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

export default createAdminLogoutHandler()
