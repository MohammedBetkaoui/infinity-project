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

// Small, bounded JSON body reader for POST endpoints that take a tiny
// payload (a token, a reference) and therefore have no reason to accept a
// platform body parser's default limits. Reads the raw stream itself so it
// behaves the same on Vercel and under scripts/dev-api.mjs. Resolves `null`
// on anything that isn't a parseable JSON object within `maxBytes` — the
// caller turns that into its own 400, never a thrown exception.
export function readJsonBody(req, maxBytes) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > maxBytes) tooLarge = true
      else chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) return resolve(null)
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve(null)
      }
    })
    req.on('error', () => resolve(null))
  })
}
