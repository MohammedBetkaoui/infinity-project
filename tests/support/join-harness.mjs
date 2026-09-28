// Test harness for api/join.js: requests arrive as raw streams (as on Vercel
// and under scripts/dev-api.mjs), and every outside service the handler can
// reach — Supabase REST, Cloudflare Siteverify, Upstash Redis — is answered
// by a local stub that records what it received. Nothing leaves the machine.
import { Readable } from 'node:stream'
import joinHandler from '../../api/join.js'
import { resetDistributedRateLimitState } from '../../api/_lib/distributed-rate-limit.js'

export const SUPABASE_URL = 'https://join-test.supabase.invalid'
export const UPSTASH_URL = 'https://join-test.upstash.invalid'
export const SECRETS = Object.freeze({
  supabase: 'sb_secret_test_value_never_logged',
  turnstile: '0x4AAAAAAA_test_turnstile_secret',
  upstash: 'upstash_test_token_never_logged',
  hash: 'rate_limit_hash_secret_for_tests',
})
export const TURNSTILE_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX-valid-turnstile-token'

let addressCounter = 0
// A fresh private address per request unless one is given, so the in-memory
// limiter never mixes up unrelated tests.
export const nextClientIp = () => {
  addressCounter += 1
  return `10.${(addressCounter >> 16) & 255}.${(addressCounter >> 8) & 255}.${addressCounter & 255}`
}

let applicantCounter = 0
export const validAnswers = (changes = {}) => {
  applicantCounter += 1
  return {
    fullName: 'Test Applicant', email: `applicant-${applicantCounter}@example.invalid`, phone: '', studyYear: 'L2',
    faculty: 'fmi', department: 'computer-science', joinType: 'member', experience: 'starting',
    memberInterest: 'AI Engineering', staffDepartment: null, availability: 'weekly', consent: true, ...changes,
  }
}

export const validBody = ({ answers = {}, ...changes } = {}) => ({
  form: 'membership', version: 4, reference: 'INF-TEST-0001', submittedAt: '2026-10-09T09:00:00.000Z',
  source: '/join', answers: validAnswers(answers), turnstileToken: TURNSTILE_TOKEN, ...changes,
})

export async function callJoin({ method = 'POST', body, raw, headers = {}, ip } = {}) {
  const payload = raw ?? (body === undefined ? '' : JSON.stringify(body))
  const req = Readable.from(payload ? [Buffer.from(payload)] : [])
  req.method = method
  req.url = '/api/join'
  req.headers = { 'content-type': 'application/json', 'x-forwarded-for': ip || nextClientIp(), ...headers }
  const res = {
    statusCode: 0,
    headers: {},
    raw: '',
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(value) { this.raw = value || ''; this.body = value ? JSON.parse(value) : null },
  }
  await joinHandler(req, res)
  return res
}

const json = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })

// options:
//   turnstile: 'pass' | 'fail' | 'wrong-action' | 'testing-key' | 'timeout' | 'http-error' | 'unconfigured'
//   upstash:   'absent' | 'ok' | 'down' | 'http-error'
//   supabase:  { duplicate: boolean, insertError: { status, code, message, details } }
//   vercel:    true to run as a Vercel deployment (origin check, mandatory Turnstile)
//   vercelEnv: VERCEL_ENV value ('production', 'preview')
export async function withJoinServices(options, run) {
  const { turnstile = 'pass', upstash = 'absent', supabase = {}, vercel = false, vercelEnv } = options
  const saved = { fetch: globalThis.fetch, env: { ...process.env }, console: { log: console.log, info: console.info, warn: console.warn, error: console.error } }
  const requests = []
  const logs = []
  const redisCounts = new Map()

  for (const name of ['VERCEL', 'VERCEL_ENV', 'TURNSTILE_SECRET_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'RATE_LIMIT_HASH_SECRET']) delete process.env[name]
  process.env.SUPABASE_URL = SUPABASE_URL
  process.env.SUPABASE_SECRET_KEY = SECRETS.supabase
  process.env.RATE_LIMIT_HASH_SECRET = SECRETS.hash
  if (turnstile !== 'unconfigured') process.env.TURNSTILE_SECRET_KEY = SECRETS.turnstile
  if (upstash !== 'absent') {
    process.env.UPSTASH_REDIS_REST_URL = UPSTASH_URL
    process.env.UPSTASH_REDIS_REST_TOKEN = SECRETS.upstash
  }
  if (vercel) process.env.VERCEL = '1'
  if (vercelEnv) process.env.VERCEL_ENV = vercelEnv
  resetDistributedRateLimitState()

  for (const level of ['log', 'info', 'warn', 'error']) {
    console[level] = (...args) => logs.push({ level, text: args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ') })
  }

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input)
    const method = init.method || 'GET'
    const body = typeof init.body === 'string' ? init.body : null
    requests.push({ url, method, body, headers: init.headers })

    if (url.startsWith('https://challenges.cloudflare.com/')) {
      if (turnstile === 'timeout') throw Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })
      if (turnstile === 'http-error') return json({}, 502)
      if (turnstile === 'fail') return json({ success: false, 'error-codes': ['invalid-input-response'] })
      // Cloudflare's documented answer for its testing keys: success, no action.
      if (turnstile === 'testing-key') return json({ success: true, hostname: 'example.com', metadata: { result_with_testing_key: true } })
      return json({ success: true, action: turnstile === 'wrong-action' ? 'another-form' : 'join', hostname: 'www.infinty-bba.com' })
    }

    if (url.startsWith(UPSTASH_URL)) {
      if (upstash === 'down') throw new TypeError('fetch failed')
      if (upstash === 'http-error') return json({ error: 'unavailable' }, 503)
      const [, , , key, windowMs] = JSON.parse(body)
      const count = (redisCounts.get(key) || 0) + 1
      redisCounts.set(key, count)
      return json({ result: [count, Number(windowMs)] })
    }

    if (url.startsWith(SUPABASE_URL)) {
      if (method === 'GET') return json(supabase.duplicate ? [{ id: '44444444-4444-4444-8444-444444444444' }] : [])
      if (supabase.insertError) {
        const { status = 500, ...error } = supabase.insertError
        return json(error, status)
      }
      return json({ id: '33333333-3333-4333-8333-333333333333', reference: 'JOIN-26-TEST01', status: 'new', created_at: '2026-10-09T09:00:00.000Z' }, 201)
    }

    throw new Error(`Unexpected outbound request in test: ${url}`)
  }

  try {
    return await run({ requests, logs, redisCounts })
  } finally {
    globalThis.fetch = saved.fetch
    Object.assign(console, saved.console)
    for (const name of Object.keys(process.env)) if (!(name in saved.env)) delete process.env[name]
    Object.assign(process.env, saved.env)
    resetDistributedRateLimitState()
  }
}

export const insertRequests = (requests) => requests.filter((request) => request.url.startsWith(SUPABASE_URL) && request.method === 'POST')
