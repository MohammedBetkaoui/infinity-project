// Legacy multipart registration endpoint intentionally retired. Candidate
// clients must use /api/aivex/register/init then /finalize; file bytes are
// never accepted by a Vercel Function anymore.
import { AIVEX_EDITION } from '../../shared/aivex/contract-v4.js'
import {
  loadAivexOperationalSettings, publicRegistrationStatus,
} from '../_lib/aivex-operational-settings.js'
import { createServerSupabaseClient } from '../_lib/aivex-server.js'
import { sendJson } from '../_lib/http.js'

export function createRegisterHandler({
  createSupabase = createServerSupabaseClient,
  loadSettings = loadAivexOperationalSettings,
  now = () => new Date(),
} = {}) {
  return async function handler(req, res) {
    if (req.method === 'POST') {
      res.setHeader('Allow', 'POST')
      return sendJson(res, 410, {
        success: false,
        status: 'direct_upload_required',
        message: 'This registration page is out of date. Reload it before submitting.',
      })
    }

    if (req.method === 'GET') {
      res.setHeader('Allow', 'GET, POST')
      try {
        const supabase = createSupabase()
        if (!supabase) throw Object.assign(new Error('server_configuration'), { code: 'configuration_error' })
        const settings = await loadSettings(supabase, AIVEX_EDITION)
        const payload = publicRegistrationStatus(settings, now())
        payload.edition = AIVEX_EDITION
        return sendJson(res, 200, payload)
      } catch (error) {
        console.error('[aivex] Campaign status failed', { stage: error?.stage || 'settings', code: error?.code || 'unexpected_error' })
        return sendJson(res, 503, {
          success: false,
          status: 'unavailable',
          message: 'Registration status could not be confirmed.',
        })
      }
    }

    res.setHeader('Allow', 'GET, POST')
    return sendJson(res, 405, {
      success: false,
      status: 'method_not_allowed',
      message: 'Method not allowed.',
    })
  }
}

export default createRegisterHandler()
