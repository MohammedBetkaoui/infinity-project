// Legacy multipart registration endpoint intentionally retired. Candidate
// clients must use /api/aivex/register/init then /finalize; file bytes are
// never accepted by a Vercel Function anymore.
import { sendJson } from '../_lib/http.js'

export function createRegisterHandler() {
  return async function handler(req, res) {
    res.setHeader('Allow', 'POST')
    sendJson(res, req.method === 'POST' ? 410 : 405, {
      success: false,
      status: req.method === 'POST' ? 'direct_upload_required' : 'method_not_allowed',
      message: req.method === 'POST'
        ? 'This registration page is out of date. Reload it before submitting.'
        : 'Method not allowed.',
    })
  }
}

export default createRegisterHandler()
