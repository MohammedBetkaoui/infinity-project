// Shared JSON response helper for api/ handlers.
//
// Responses only ever carry a submission outcome: never cached, never
// sniffed as another content type.
export const sendJson = (res, status, payload) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.end(JSON.stringify(payload))
}

export const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '')

export const isFilled = (value) => typeof value === 'string' && value.trim().length > 0
