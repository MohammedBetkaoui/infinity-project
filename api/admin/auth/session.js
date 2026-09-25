import { createServerAdminAuthService } from '../../_lib/admin-auth.js'
import {
  adminAuthEnabled, adminSessionTokenFromRequest, clearAdminSessionCookie, safeAdminAuthLog, sendAdminJson,
} from '../../_lib/admin-security.js'

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

export default createAdminSessionHandler()
