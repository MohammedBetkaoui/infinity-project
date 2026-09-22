// Legacy multipart endpoint intentionally retired. The status page uses the
// JSON init/finalize endpoints and uploads bytes directly to private Storage.
import { sendJson } from '../../_lib/http.js'

export function createMagicLinkUploadHandler() {
  return async function handler(req, res) {
    res.setHeader('Allow', 'POST')
    sendJson(res, req.method === 'POST' ? 410 : 405, {
      success: false,
      status: req.method === 'POST' ? 'direct_upload_required' : 'method_not_allowed',
      message: req.method === 'POST'
        ? 'This upload page is out of date. Reload it before submitting.'
        : 'Method not allowed.',
    })
  }
}

export default createMagicLinkUploadHandler()
