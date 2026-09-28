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
// behaves the same on Vercel and under scripts/dev-api.mjs. Resolves
// { ok: true, value } or { ok: false, reason: 'too_large' | 'invalid' } —
// the caller turns that into its own 413/400, never a thrown exception.
// Bytes past `maxBytes` are drained and discarded, never buffered.
export function readBoundedJsonBody(req, maxBytes) {
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
      if (tooLarge) return resolve({ ok: false, reason: 'too_large' })
      try {
        resolve({ ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
      } catch {
        resolve({ ok: false, reason: 'invalid' })
      }
    })
    req.on('error', () => resolve({ ok: false, reason: 'invalid' }))
  })
}

// Same reader for callers that only need "a value or null".
export async function readJsonBody(req, maxBytes) {
  const body = await readBoundedJsonBody(req, maxBytes)
  return body.ok ? body.value : null
}

// True for `application/json`, with or without parameters such as charset.
export const isJsonContentType = (req) => /^application\/json\s*(;|$)/i.test(String(req?.headers?.['content-type'] || '').trim())
