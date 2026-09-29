import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { consumeDistributedRateLimit, rateLimitKey, resetDistributedRateLimitState } from '../api/_lib/distributed-rate-limit.js'
import { normalizeMembershipPhone } from '../api/_lib/membership-phone.js'
import { verifyTurnstileToken } from '../api/_lib/turnstile.js'
import {
  SECRETS, SUPABASE_URL, TURNSTILE_TOKEN, UPSTASH_URL, callJoin, insertRequests, nextClientIp, validBody, withJoinServices,
} from './support/join-harness.mjs'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const SECURITY_MIGRATION = 'supabase/migrations/20261009120000_membership_join_security.sql'
const DUPLICATE_MESSAGE = 'An application with these contact details may already exist. Please contact the club if you need help.'

// Nothing that identifies an applicant, a client or a credential may reach a log line.
const assertNoSensitiveLogs = (logs, values) => {
  const text = logs.map((entry) => entry.text).join('\n')
  for (const value of [...values, SECRETS.supabase, SECRETS.turnstile, SECRETS.upstash, SECRETS.hash, TURNSTILE_TOKEN, UPSTASH_URL]) {
    assert.equal(text.includes(value), false, `log leaked ${value}`)
  }
}
const assertNoInternals = (res) => assert.doesNotMatch(res.raw, /supabase|postgres|sql|relation|membership_applications|23505|redis|upstash|turnstile_secret|stack|SUPABASE_|TURNSTILE_|UPSTASH_/i)

test('1-2. only POST is accepted', async () => {
  await withJoinServices({}, async ({ requests }) => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const res = await callJoin({ method })
      assert.equal(res.statusCode, 405, method)
      assert.equal(res.headers.allow, 'POST')
    }
    assert.equal(requests.length, 0)
  })
})

test('3. anything but application/json is refused with 415 before the body is read', async () => {
  await withJoinServices({}, async ({ requests }) => {
    for (const type of ['text/plain', 'multipart/form-data; boundary=x', 'application/x-www-form-urlencoded', 'application/jsonp', '']) {
      const res = await callJoin({ body: validBody(), headers: { 'content-type': type } })
      assert.equal(res.statusCode, 415, type || '(none)')
    }
    assert.equal((await callJoin({ body: validBody(), headers: { 'content-type': 'application/json; charset=utf-8' } })).statusCode, 201)
    assert.equal(insertRequests(requests).length, 1)
  })
})

test('4. malformed JSON, arrays and non-objects are refused with 400', async () => {
  await withJoinServices({}, async ({ requests }) => {
    for (const raw of ['{"form":', 'not json', '[]', '[{"form":"membership"}]', '"membership"', 'null', '42', '']) {
      const res = await callJoin({ raw })
      assert.equal(res.statusCode, 400, JSON.stringify(raw))
      assert.equal(res.body.message, 'Invalid application data.')
      assertNoInternals(res)
    }
    assert.equal(insertRequests(requests).length, 0)
  })
})

test('5. bodies over 64 KB are refused with 413, declared or streamed', async () => {
  await withJoinServices({}, async ({ requests }) => {
    const oversized = JSON.stringify(validBody({ answers: { fullName: 'x'.repeat(70 * 1024) } }))
    assert.equal((await callJoin({ raw: oversized })).statusCode, 413)
    assert.equal((await callJoin({ raw: '{}', headers: { 'content-length': String(1024 * 1024) } })).statusCode, 413)
    assert.equal(insertRequests(requests).length, 0)
  })
})

test('6-10, 20-21. server validation refuses each invalid answer with 400 and a field', async () => {
  await withJoinServices({}, async ({ requests }) => {
    const cases = [
      [{ form: 'aivex' }, 'form'],
      [{ form: undefined }, 'form'],
      [{ answers: { studyYear: 'PhD' } }, 'studyYear'],
      [{ answers: { joinType: 'admin' } }, 'joinType'],
      [{ answers: { joinType: 'staff', staffDepartment: 'finance' } }, 'staffDepartment'],
      [{ answers: { consent: 'true' } }, 'consent'],
      [{ answers: { consent: undefined } }, 'consent'],
      [{ answers: { faculty: 'unknown', department: 'mathematics' } }, 'faculty'],
      [{ answers: { faculty: 'fst', department: 'mathematics' } }, 'department'],
      [{ answers: { faculty: 'fmi', department: 'civil-engineering' } }, 'department'], // 24
    ]
    for (const [changes, field] of cases) {
      const res = await callJoin({ body: validBody(changes) })
      assert.equal(res.statusCode, 400, JSON.stringify(changes))
      assert.equal(res.body.field, field, JSON.stringify(changes))
    }
    assert.equal(insertRequests(requests).length, 0, 'an invalid application never reaches the database')
    assert.equal(requests.filter((request) => request.url.startsWith('https://challenges.cloudflare.com/')).length, 0, 'invalid payloads are refused before the security check is spent')
  })
})

test('an open tab from an older form version is asked to reload', async () => {
  await withJoinServices({}, async () => {
    for (const version of [1, 2, 3, undefined, '4']) {
      const res = await callJoin({ body: validBody({ version }) })
      assert.equal(res.statusCode, 400, String(version))
      assert.equal(res.body.field, 'version')
      assert.match(res.body.message, /reload the page/)
    }
  })
})

test('22-23. valid Faculty -> Department pairs are accepted', async () => {
  await withJoinServices({}, async ({ requests }) => {
    for (const department of ['computer-science', 'mathematics']) {
      const res = await callJoin({ body: validBody({ answers: { faculty: 'fmi', department } }) })
      assert.equal(res.statusCode, 201, department)
    }
    assert.deepEqual(insertRequests(requests).map((request) => JSON.parse(request.body).department), ['computer-science', 'mathematics'])
  })
})

test('11, 29. unknown and privileged keys never reach the inserted row', async () => {
  await withJoinServices({}, async ({ requests }) => {
    const res = await callJoin({
      body: validBody({
        answers: { role: 'super_admin', status: 'accepted', isAdmin: true, accepted_as: 'staff', phone_normalized: '0000', reference: 'FORGED' },
        status: 'accepted', role: 'super_admin', reviewed_by_admin_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', verified: true,
      }),
    })
    assert.equal(res.statusCode, 201)
    const row = JSON.parse(insertRequests(requests)[0].body)
    assert.deepEqual(Object.keys(row).sort(), [
      'availability', 'consent', 'department', 'email', 'experience', 'faculty', 'form_version', 'full_name', 'join_type',
      'phone', 'primary_field', 'source', 'staff_department', 'study_year', 'submitted_at',
    ])
    assert.equal(row.form_version, 4)
  })
})

test('12-13. SQL and HTML payloads are stored as plain data through the parameterised client', async () => {
  const names = ["Robert'); DROP TABLE membership_applications;--", '<script>alert(1)</script>', '<img src=x onerror=alert(1)>']
  await withJoinServices({}, async ({ requests }) => {
    for (const fullName of names) {
      assert.equal((await callJoin({ body: validBody({ answers: { fullName } }) })).statusCode, 201)
    }
    const inserts = insertRequests(requests)
    assert.deepEqual(inserts.map((request) => JSON.parse(request.body).full_name), names)
    // The value travels in the JSON body only, never in the URL or a query.
    for (const request of requests) assert.equal(request.url.includes('DROP'), false)
  })
  const api = await read('api/join.js')
  assert.doesNotMatch(api, /\.rpc\(|\bsql`|execute\(|query\(/, 'no hand-built SQL path in the Join API')
})

test('14. a cross-origin request on a Vercel deployment is refused', async () => {
  await withJoinServices({ vercel: true }, async ({ requests }) => {
    const res = await callJoin({ body: validBody(), headers: { host: 'www.infinty-bba.com', origin: 'https://evil.example' } })
    assert.equal(res.statusCode, 403)
    const sameSite = await callJoin({ body: validBody(), headers: { host: 'www.infinty-bba.com', origin: 'https://www.infinty-bba.com' } })
    assert.equal(sameSite.statusCode, 201)
    assert.equal(insertRequests(requests).length, 1)
  })
})

test('15. a filled honeypot gets a neutral success without any outbound call', async () => {
  await withJoinServices({}, async ({ requests }) => {
    for (const body of [validBody({ answers: { website: 'https://spam.example' } }), validBody({ website: 'https://spam.example' })]) {
      const res = await callJoin({ body })
      assert.equal(res.statusCode, 201)
      assert.equal(res.body.success, true)
    }
    assert.equal(requests.length, 0, 'no Supabase row, no Turnstile check')
  })
})

test('16. the distributed limit answers 429 with Retry-After, keyed by a hashed address', async () => {
  await withJoinServices({ upstash: 'ok' }, async ({ requests, redisCounts }) => {
    const ip = nextClientIp()
    for (let attempt = 1; attempt <= 8; attempt += 1) assert.equal((await callJoin({ raw: '{}', ip })).statusCode, 400)
    const limited = await callJoin({ raw: '{}', ip })
    assert.equal(limited.statusCode, 429)
    assert.equal(limited.headers['retry-after'], '600')
    const [key] = redisCounts.keys()
    assert.match(key, /^join:[0-9a-f]{64}$/)
    assert.equal(key, rateLimitKey('join', ip, SECRETS.hash))
    const call = requests.find((request) => request.url.startsWith(UPSTASH_URL))
    assert.equal(call.body.includes(ip), false, 'the raw address never reaches Redis')
    assert.equal(call.headers.Authorization, `Bearer ${SECRETS.upstash}`)
  })
})

test('27. when Redis is down the local limiter takes over, logging a code only', async () => {
  await withJoinServices({ upstash: 'down' }, async ({ logs }) => {
    const ip = nextClientIp()
    const email = 'redis-down@example.invalid'
    assert.equal((await callJoin({ body: validBody({ answers: { email } }), ip })).statusCode, 201)
    for (let attempt = 2; attempt <= 8; attempt += 1) assert.equal((await callJoin({ raw: '{}', ip })).statusCode, 400)
    assert.equal((await callJoin({ raw: '{}', ip })).statusCode, 429, 'the fallback still limits')
    assert(logs.some((entry) => entry.text.includes('[join] distributed rate limiter unavailable')))
    assertNoSensitiveLogs(logs, [ip, email])
  })
  resetDistributedRateLimitState()
  const result = await consumeDistributedRateLimit('join', '10.9.9.9', { max: 1, windowMs: 1000 }, {
    env: { UPSTASH_REDIS_REST_URL: 'http://insecure.example', UPSTASH_REDIS_REST_TOKEN: 'x' },
  })
  assert.deepEqual(result, { allowed: true, source: 'memory' }, 'a non-HTTPS Redis URL is never used')
})

test('17-19. Turnstile: missing, refused or foreign tokens are rejected; a valid one proceeds', async () => {
  for (const [turnstile, body, status] of [
    ['pass', validBody({ turnstileToken: undefined }), 403],
    ['pass', validBody({ turnstileToken: '' }), 403],
    ['pass', validBody({ turnstileToken: 'x'.repeat(2049) }), 403],
    ['pass', validBody({ turnstileToken: { verified: true } }), 403],
    ['fail', validBody(), 403],
    ['wrong-action', validBody(), 403],
    ['pass', validBody(), 201],
  ]) {
    await withJoinServices({ turnstile }, async ({ requests }) => {
      const res = await callJoin({ body })
      assert.equal(res.statusCode, status, `${turnstile} ${JSON.stringify(body.turnstileToken)?.slice(0, 20)}`)
      if (status === 403) {
        assert.equal(res.body.message, 'We couldn’t verify the security check. Please try again.')
        assert.equal(insertRequests(requests).length, 0)
      }
    })
  }

  await withJoinServices({ turnstile: 'pass' }, async ({ requests }) => {
    await callJoin({ body: validBody(), ip: '10.200.0.7' })
    const verification = requests.find((request) => request.url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
    const form = new URLSearchParams(verification.body)
    assert.equal(form.get('secret'), SECRETS.turnstile)
    assert.equal(form.get('response'), TURNSTILE_TOKEN)
    assert.equal(form.get('remoteip'), '10.200.0.7')
  })
})

test('28. an unreachable or slow Turnstile service fails closed with a generic 503', async () => {
  for (const turnstile of ['timeout', 'http-error']) {
    await withJoinServices({ turnstile }, async ({ requests, logs }) => {
      const res = await callJoin({ body: validBody() })
      assert.equal(res.statusCode, 503, turnstile)
      assert.equal(res.body.message, 'We could not send your application right now. Please try again in a few minutes.')
      assertNoInternals(res)
      assert.equal(insertRequests(requests).length, 0)
      assertNoSensitiveLogs(logs, [])
    })
  }
  // The real timeout path, shortened.
  const never = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
  assert.deepEqual(await verifyTurnstileToken({ secret: 's', token: 't', fetchImpl: never, timeoutMs: 20 }), { ok: false, reason: 'unavailable', code: 'timeout' })
})

test('Cloudflare testing keys pass locally and on previews, never in production', async () => {
  for (const [vercelEnv, status] of [[undefined, 201], ['preview', 201], ['production', 503]]) {
    await withJoinServices({ turnstile: 'testing-key', vercelEnv }, async ({ requests, logs }) => {
      const res = await callJoin({ body: validBody() })
      assert.equal(res.statusCode, status, String(vercelEnv))
      if (status === 503) {
        assert.equal(insertRequests(requests).length, 0)
        assert(logs.some((entry) => entry.text.includes('testing_key')), 'the misconfiguration is logged by code')
      }
    })
  }
})

test('a Vercel deployment without the Turnstile secret closes the form instead of skipping the check', async () => {
  await withJoinServices({ turnstile: 'unconfigured', vercel: true }, async ({ requests }) => {
    const res = await callJoin({ body: validBody(), headers: { host: 'www.infinty-bba.com', origin: 'https://www.infinty-bba.com' } })
    assert.equal(res.statusCode, 503)
    assert.equal(insertRequests(requests).length, 0)
  })
})

test('25. duplicates — early lookup or unique index — get one neutral 409', async () => {
  await withJoinServices({ supabase: { duplicate: true } }, async ({ requests, logs }) => {
    const res = await callJoin({ body: validBody({ answers: { phone: '+213 555 01 02 03' } }) })
    assert.equal(res.statusCode, 409)
    assert.deepEqual(res.body, { success: false, message: DUPLICATE_MESSAGE })
    assert.equal(insertRequests(requests).length, 0)
    assert(logs.some((entry) => entry.text.includes('duplicate_contact')))
  })
  await withJoinServices({
    supabase: {
      insertError: {
        status: 409, code: '23505', message: 'duplicate key value violates unique constraint "membership_applications_email_unique_idx"',
        details: 'Key (lower(btrim(email)))=(racer@example.invalid) already exists.',
      },
    },
  }, async ({ logs }) => {
    const res = await callJoin({ body: validBody({ answers: { email: 'racer@example.invalid' } }) })
    assert.equal(res.statusCode, 409)
    assert.deepEqual(res.body, { success: false, message: DUPLICATE_MESSAGE })
    assert.doesNotMatch(res.raw, /email|phone|racer/i, 'the answer never says which contact matched')
    assertNoSensitiveLogs(logs, ['racer@example.invalid'])
  })
})

test('26. a database failure answers a generic 500 without internals', async () => {
  await withJoinServices({
    supabase: { insertError: { status: 500, code: 'XX000', message: 'relation "membership_applications" violates something', details: 'postgres internals' } },
  }, async ({ logs }) => {
    const res = await callJoin({ body: validBody() })
    assert.equal(res.statusCode, 500)
    assert.deepEqual(res.body, { success: false, message: 'We could not save your application. Please try again.' })
    assertNoInternals(res)
    assert(logs.some((entry) => entry.text.includes('XX000')), 'the code is logged for operators')
  })
})

test('24. duplicate detection uses indexed equality lookups, never a scan of stored phones', async () => {
  await withJoinServices({}, async ({ requests }) => {
    await callJoin({ body: validBody({ answers: { phone: '00213 555 01 02 03' } }) })
    const lookups = requests.filter((request) => request.url.startsWith(SUPABASE_URL) && request.method === 'GET').map((request) => decodeURIComponent(request.url))
    assert.equal(lookups.length, 2)
    assert(lookups.some((url) => /email=eq\.applicant-\d+@example\.invalid/.test(url) && url.includes('limit=1')))
    assert(lookups.some((url) => url.includes('phone_normalized=eq.0555010203') && url.includes('limit=1')))
    for (const url of lookups) assert.doesNotMatch(url, /select=phone\b|limit=10000/)
  })
  assert.doesNotMatch(await read('api/join.js'), /limit\(10000\)|\.select\('phone'\)/)
})

test('30. responses never echo the Turnstile token, and logs carry no personal data', async () => {
  await withJoinServices({}, async ({ logs }) => {
    const answers = { fullName: 'Amina Private', email: 'amina.private@example.invalid', phone: '0555 99 88 77' }
    const success = await callJoin({ body: validBody({ answers }) })
    assert.equal(success.statusCode, 201)
    assert.deepEqual(success.body, { success: true, reference: 'JOIN-26-TEST01' })
    const refused = await callJoin({ body: validBody({ answers: { ...answers, faculty: 'nope' } }) })
    for (const res of [success, refused]) assert.equal(res.raw.includes(TURNSTILE_TOKEN), false)
    assertNoSensitiveLogs(logs, Object.values(answers))
  })
  const api = await read('api/join.js')
  assert.doesNotMatch(api, /console\.\w+\([^)]*(body|answers|email|phone|fullName|token|secret|process\.env)\b/i)
})

test('the stored source is the page path only', async () => {
  await withJoinServices({}, async ({ requests }) => {
    for (const source of ['https://www.infinty-bba.com/join?utm_source=x&token=secret#frag', '/join', 'javascript:alert(1)', '/join/../<script>']) {
      await callJoin({ body: validBody({ source }) })
    }
    assert.deepEqual(insertRequests(requests).map((request) => JSON.parse(request.body).source), ['/join', '/join', null, null])
  })
  assert.match(await read('src/lib/applicationSubmission.js'), /source: window\.location\.pathname,/)
})

test('phone numbers written differently normalise to the same key', () => {
  for (const [input, expected] of [
    ['+213 555 01 02 03', '0555010203'],
    ['00213 555 01 02 03', '0555010203'],
    ['0555 01 02 03', '0555010203'],
    ['555010203', '0555010203'],
    ['213555010203', '0555010203'],
    ['+33 6 12 34 56 78', '33612345678'],
    ['(0555) 01-02-03', '0555010203'],
    ['', null],
    [null, null],
    ['phone', null],
  ]) assert.equal(normalizeMembershipPhone(input), expected, String(input))
})

test('the security migration mirrors the phone rule, enforces uniqueness and keeps the table private', async () => {
  const sql = await read(SECURITY_MIGRATION)
  const phoneFunction = sql.match(/create or replace function public\.membership_phone_key[\s\S]+?\$\$([\s\S]+?)\$\$/)[1]
  for (const rule of [/regexp_replace\(coalesce\(p_phone, ''\), '\[\^0-9\]', '', 'g'\)/, /digits like '00213%' then substr\(digits, 6\)/, /digits like '213%' and length\(digits\) > 9 then substr\(digits, 4\)/, /length\(local_digits\) = 9 then '0' \|\| local_digits/, /nullif\(/]) {
    assert.match(phoneFunction, rule)
  }
  assert.match(sql, /add column if not exists phone_normalized text\s+generated always as \(public\.membership_phone_key\(phone\)\) stored/)
  assert.match(sql, /create unique index if not exists membership_applications_email_unique_idx\s+on public\.membership_applications \(lower\(btrim\(email\)\)\)/)
  assert.match(sql, /create unique index if not exists membership_applications_phone_unique_idx\s+on public\.membership_applications \(phone_normalized\)\s+where phone_normalized is not null/)
  assert.match(sql, /raise exception 'membership_applications contains % duplicated e-mail group\(s\)/)
  assert.match(sql, /alter table public\.membership_applications enable row level security;/)
  assert.match(sql, /revoke all on table public\.membership_applications from anon, authenticated;/)
  assert.match(sql, /grant select, insert, update on table public\.membership_applications to service_role;/)
  assert.match(sql, /revoke all on function public\.membership_phone_key\(text\) from public, anon, authenticated;/)
  assert.doesNotMatch(sql, /create policy|grant [^;]*to (anon|authenticated|public)|drop column|drop table|delete from|truncate|update public\./i)

  const faculty = await read('supabase/migrations/20261008120000_membership_faculty_department.sql')
  assert.match(faculty, /check \(faculty is null or faculty in \('fmi', 'fst', 'fsnv', 'fsecg', 'fll', 'fdsp', 'fshs'\)\)/)

  // No migration anywhere opens the table to the browser roles.
  for (const name of await readdir(new URL('../supabase/migrations/', import.meta.url))) {
    const text = await read(`supabase/migrations/${name}`)
    assert.doesNotMatch(text, /create policy[^;]*membership_applications/i, name)
    assert.doesNotMatch(text, /grant [^;]*on table public\.membership_applications[^;]*to (anon|authenticated|public)/i, name)
  }
})

test('browser code holds no server secret, no direct database client and no raw applicant HTML', async () => {
  const serverOnly = ['SUPABASE_SECRET_KEY', 'TURNSTILE_SECRET_KEY', 'UPSTASH_REDIS_REST_TOKEN', 'UPSTASH_REDIS_REST_URL', 'RATE_LIMIT_HASH_SECRET', 'service_role', 'SUPABASE_URL']
  const walk = async (dir) => (await Promise.all((await readdir(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true }))
    .map((entry) => (entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`])))).flat()
  const browserFiles = (await walk('src')).filter((path) => /\.(jsx?|css)$/.test(path))
  for (const path of browserFiles) {
    const source = await read(path)
    for (const name of serverOnly) assert.equal(source.includes(name), false, `${path} mentions ${name}`)
    assert.doesNotMatch(source, /process\.env|createClient\(|@supabase\/supabase-js/, path)
  }

  // Vite only inlines variables with these prefixes; no server-only name may match one.
  const prefixes = JSON.parse((await read('vite.config.js')).match(/envPrefix:\s*(\[[^\]]+\])/)[1].replaceAll("'", '"'))
  assert.equal(prefixes.some((prefix) => 'TURNSTILE_SITE_KEY'.startsWith(prefix)), true, 'the public Turnstile site key is exposed to the client')
  for (const name of serverOnly) assert.equal(prefixes.some((prefix) => name.startsWith(prefix)), false, name)

  // Applicant values render as React text, never as markup.
  const applicantViews = [
    'src/pages/join/JoinPage.jsx', 'src/pages/join/JoinPanelChoice.jsx', 'src/components/forms/ApplicationField.jsx',
    'src/components/forms/ApplicationChoice.jsx', 'src/components/forms/ApplicationConsent.jsx', 'src/components/forms/TurnstileWidget.jsx',
    'src/admin/ApplicationsPage.jsx', 'src/admin/PeoplePages.jsx', 'src/admin/DirectoryPage.jsx', 'src/admin/AdminRecords.jsx', 'src/admin/AdminUI.jsx',
  ]
  for (const path of applicantViews) assert.doesNotMatch(await read(path), /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML/, path)

  const example = await read('.env.example')
  for (const name of ['SUPABASE_SECRET_KEY', 'TURNSTILE_SECRET_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'RATE_LIMIT_HASH_SECRET', 'TURNSTILE_SITE_KEY', 'ADMIN_RATE_LIMIT_SECRET']) {
    assert.match(example, new RegExp(`^${name}=$`, 'm'), `${name} must be an empty placeholder`)
  }
})

test('the Join page keeps the security token and contact details out of storage', async () => {
  const page = await read('src/pages/join/JoinPage.jsx')
  const hook = await read('src/hooks/useApplicationForm.js')
  const model = await read('src/pages/join/joinModel.js')
  const draftFields = JSON.parse(model.match(/DRAFT_FIELDS = Object\.freeze\((\[[\s\S]+?\])\)/)[1].replaceAll("'", '"').replace(/,\s*\]$/, ']'))
  for (const name of ['email', 'phone', 'website', 'consent', 'turnstileToken']) assert.equal(draftFields.includes(name), false, name)
  assert.match(page, /draftFields: DRAFT_FIELDS/)
  assert.match(page, /STORAGE_KEY = 'infinity-membership-draft-v4'/)
  assert.match(page, /'infinity-membership-draft-v3'\]/)
  assert.match(page, /const \[turnstileToken, setTurnstileToken\] = useState\(''\)/)
  assert.doesNotMatch(`${page}\n${hook}`, /(session|local)Storage[^\n]*turnstile/i)
  assert.match(hook, /JSON\.stringify\(\{ values: draftValues, step \}\)/)
  // Double submission stays impossible, and a used token is always replaced.
  assert.match(hook, /if \(status === 'submitting' \|\| submittingRef\.current\) return false/)
  assert.match(page, /if \(sent && TURNSTILE_SITE_KEY\) \{\s*setTurnstileToken\(''\)\s*setTurnstileRound\(\(round\) => round \+ 1\)/)
})

test('site-wide headers keep framing, sniffing and script sources locked down', async () => {
  const config = JSON.parse(await read('vercel.json'))
  const headerFor = (source, key) => config.headers.find((rule) => rule.source === source)?.headers.find((header) => header.key === key)?.value
  const site = headerFor('/((?!admin).*)', 'Content-Security-Policy')
  const admin = headerFor('/admin(.*)', 'Content-Security-Policy')
  for (const policy of [site, admin]) {
    for (const directive of ["default-src 'self'", "base-uri 'self'", "frame-ancestors 'self'", "form-action 'self'"]) assert(policy.includes(directive), directive)
    assert.doesNotMatch(policy, /unsafe-eval|script-src[^;]*unsafe-inline|script-src[^;]*\*/)
  }
  assert(site.includes("object-src 'none'"))
  assert.match(site, /script-src 'self' https:\/\/challenges\.cloudflare\.com;/)
  assert.match(site, /frame-src https:\/\/challenges\.cloudflare\.com;/)
  assert.equal(headerFor('/(.*)', 'X-Content-Type-Options'), 'nosniff')
  assert.equal(headerFor('/(.*)', 'X-Frame-Options'), 'SAMEORIGIN')
  assert.equal(headerFor('/aivex/status', 'Referrer-Policy'), 'no-referrer')
  assert.equal(headerFor('/((?!aivex/status).*)', 'Referrer-Policy'), 'strict-origin-when-cross-origin')
})
