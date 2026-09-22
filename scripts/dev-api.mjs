// Local dev runner for the Vercel Functions in api/ (dev only).
//
// `npm run dev` (Vite) proxies /api/* here. Production (Vercel) is
// unaffected: it serves api/ natively on the same domain.
//
// Usage (two terminals):
//   npm run dev:api   -> http://localhost:3001  (/api/join, /api/aivex/register, /api/aivex/document,
//                        /api/aivex/magic-link, /api/aivex/magic-link/verify, /api/aivex/magic-link/document,
//                        /api/aivex/magic-link/upload)
//   npm run dev       -> http://localhost:5173 (proxies /api to the above)
//
// Only Node builtins are used. .env.local is loaded server-side and is
// never exposed to the browser.

import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.DEV_API_PORT) || 3001
const MAX_BYTES = 256 * 1024

if (existsSync(join(root, '.env.local'))) {
  for (const line of readFileSync(join(root, '.env.local'), 'utf8').split('\n')) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(match[1] in process.env)) process.env[match[1]] = value
  }
}

const load = async (...segments) => (await import(pathToFileURL(join(root, 'api', ...segments)).href)).default
const joinHandler = await load('join.js')
// These routes read the raw request stream themselves: the runner must
// not consume the body before handing the request over.
const streamingRoutes = {
  '/api/aivex/register': await load('aivex', 'register.js'),
  '/api/aivex/register/init': await load('aivex', 'register', 'init.js'),
  '/api/aivex/register/finalize': await load('aivex', 'register', 'finalize.js'),
  '/api/aivex/document': await load('aivex', 'document.js'),
  '/api/aivex/magic-link': await load('aivex', 'magic-link.js'),
  '/api/aivex/magic-link/verify': await load('aivex', 'magic-link', 'verify.js'),
  '/api/aivex/magic-link/upload': await load('aivex', 'magic-link', 'upload.js'),
  '/api/aivex/magic-link/upload/init': await load('aivex', 'magic-link', 'upload', 'init.js'),
  '/api/aivex/magic-link/upload/finalize': await load('aivex', 'magic-link', 'upload', 'finalize.js'),
  '/api/aivex/magic-link/document': await load('aivex', 'magic-link', 'document.js'),
}

const json = (res, status, payload) => {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(payload))
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const streamingHandler = streamingRoutes[url.pathname]
  if (streamingHandler) {
    Promise.resolve(streamingHandler(req, res)).catch(() => {
      if (!res.headersSent) json(res, 500, { success: false, message: 'Server error.' })
    })
    return
  }
  if (url.pathname !== '/api/join') {
    json(res, 404, { success: false, message: 'Not found.' })
    return
  }
  if (req.method !== 'POST') {
    // Let the function produce the canonical 405 + Allow header.
    req.body = undefined
    joinHandler(req, res)
    return
  }
  let size = 0
  const chunks = []
  req.on('data', (chunk) => {
    size += chunk.length
    if (size <= MAX_BYTES) chunks.push(chunk)
  })
  req.on('end', () => {
    if (size > MAX_BYTES) {
      json(res, 413, { success: false, message: 'Payload too large.' })
      return
    }
    const text = Buffer.concat(chunks).toString('utf8')
    let body = {}
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = {}
      }
    }
    // Mutate the real request instead of spreading it into a plain object:
    // IncomingMessage exposes headers/url through prototype getters, which
    // `{ ...req }` silently drops (spread only copies own enumerable
    // properties) — the handler would then see req.headers as undefined.
    req.body = body
    joinHandler(req, res)
  })
}).listen(PORT, () => {
  console.log(`[dev-api] serving api/*.js on http://localhost:${PORT}`)
})
