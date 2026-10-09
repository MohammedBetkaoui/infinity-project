import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { Readable } from 'node:stream'
import test from 'node:test'
import { createStaffConfirmationSubmitHandler } from '../api/_lib/staff-confirmation-handlers.js'
import { validateStaffConfirmationSubmitBody } from '../api/_lib/staff-confirmation-validation.js'
import { hashStaffConfirmationToken } from '../api/_lib/staff-confirmation-tokens.js'
import { STAFF_DEPARTMENT_LABELS, createStaffConfirmationsService } from '../api/_lib/staff-confirmations.js'
import { createStaffConfirmationsStore } from '../api/_lib/staff-confirmations-store.js'
import {
  STAFF_WORK_LINKS_MAX, STAFF_WORK_LINK_MAX_LENGTH, describeStaffWorkLink, normalizeStaffWorkLink, validateStaffWorkLinks,
} from '../shared/membership/staff-work-links.js'
import {
  STAFF_MOTIVATION_GUIDANCE, STAFF_MOTIVATION_QUESTION, staffMotivationGuidance,
} from '../src/pages/join/staffMotivationGuidance.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const RAW_TOKEN = Buffer.alloc(32, 7).toString('base64url')
const MOTIVATION = 'I want to help the Dev and Tech team build useful student projects, contribute consistently, learn from experienced members, and share what I know with other students. This is meaningful to me.'
const NOW = new Date('2026-10-10T09:00:00.000Z')
const GITHUB = 'https://github.com/amel/student-portal'
const fiveLinks = Array.from({ length: 5 }, (_, index) => `https://example.com/project-${index + 1}`)
const submitBody = (extra = {}) => ({ token: RAW_TOKEN, motivation: MOTIVATION, ...extra })

function request(body) {
  const req = Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))])
  Object.assign(req, {
    method: 'POST', url: '/api/join?__join_action=staff-confirmation-submit',
    headers: { 'content-type': 'application/json' }, socket: { remoteAddress: '127.0.0.45' },
  })
  return req
}

function response() {
  return {
    statusCode: 0, headers: {}, body: null, raw: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(value) { this.raw = value || ''; this.body = value ? JSON.parse(value) : null },
  }
}

const submitHandler = (createService) => createStaffConfirmationSubmitHandler({
  env: { STAFF_CONFIRMATION_API_ENABLED: 'true' },
  rateLimit: async () => ({ allowed: true }),
  trustedOrigin: () => true,
  createService,
})

const submissionRow = (overrides = {}) => ({
  application_id: '11111111-1111-4111-8111-111111111111', application_reference: 'JOIN-26-TEST01',
  confirmation_id: '22222222-2222-4222-8222-222222222222', submission_id: '33333333-3333-4333-8333-333333333333',
  submission_version: 1, submitted_at: NOW.toISOString(), already_submitted: false, ...overrides,
})

const databaseError = (message, code) => Object.assign(new Error(message), { code, databaseMessage: message })

const functionBody = (sql, signature) => {
  const start = sql.indexOf(signature)
  assert.notEqual(start, -1, signature)
  const bodyStart = sql.indexOf('as $$', start) + 'as $$'.length
  return sql.slice(bodyStart, sql.indexOf('$$;', bodyStart))
}
const squash = (text) => text.replace(/\s+/g, ' ').trim()

// --- Validation ------------------------------------------------------------

test('a valid motivation is accepted with no links, one link or five links', () => {
  assert.deepEqual(validateStaffConfirmationSubmitBody(submitBody()).value.workLinks, [], 'missing workLinks means none')
  assert.deepEqual(validateStaffConfirmationSubmitBody(submitBody({ workLinks: [] })).value.workLinks, [])
  assert.deepEqual(validateStaffConfirmationSubmitBody(submitBody({ workLinks: [GITHUB] })).value, {
    token: RAW_TOKEN, motivation: MOTIVATION, workLinks: [GITHUB],
  })
  assert.deepEqual(validateStaffConfirmationSubmitBody(submitBody({ workLinks: fiveLinks })).value.workLinks, fiveLinks)
  assert.equal(STAFF_WORK_LINKS_MAX, 5)
})

test('more than five links, non-array lists, non-string entries and unknown fields are rejected', () => {
  assert.deepEqual(validateStaffConfirmationSubmitBody(submitBody({ workLinks: [...fiveLinks, 'https://example.com/6'] })), {
    ok: false, field: 'workLinks', errors: [],
  })
  for (const workLinks of [GITHUB, null, {}, { 0: GITHUB }, 5, [42], [GITHUB, null], [[GITHUB]]]) {
    const result = validateStaffConfirmationSubmitBody(submitBody({ workLinks }))
    assert.deepEqual({ ok: result.ok, field: result.field }, { ok: false, field: 'workLinks' }, JSON.stringify(workLinks))
  }
  for (const body of [
    submitBody({ workLinks: [], portfolio: GITHUB }),
    submitBody({ links: [GITHUB] }),
    { token: RAW_TOKEN, workLinks: [GITHUB] },
    { motivation: MOTIVATION, workLinks: [GITHUB] },
    JSON.parse(`{"token":"${RAW_TOKEN}","motivation":"${MOTIVATION}","__proto__":{"workLinks":[]}}`),
  ]) {
    assert.deepEqual(validateStaffConfirmationSubmitBody(body), { ok: false }, JSON.stringify(Object.keys(body)))
  }
  // A short motivation is still reported on its own field, with or without links.
  assert.equal(validateStaffConfirmationSubmitBody(submitBody({ motivation: 'short', workLinks: [GITHUB] })).field, 'motivation')
})

test('only absolute http(s) URLs of at most 500 characters are accepted, reported per index', () => {
  const codeOf = (link) => validateStaffWorkLinks([link]).errors?.[0]?.code
  for (const link of ['javascript:alert(1)', 'JavaScript:alert(document.cookie)', 'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd', 'ftp://example.com/file', 'mailto:amel@example.dz', 'tel:+213555000000']) {
    assert.equal(codeOf(link), 'scheme', link)
  }
  for (const link of ['/projects/demo', 'projects/demo', '//github.com/amel', 'github.com/amel', 'https://', 'http://localhost:5173', 'https://github', 'https://git\thub.com']) {
    assert.equal(codeOf(link), 'invalid', link)
  }
  const exact = `https://example.com/${'a'.repeat(STAFF_WORK_LINK_MAX_LENGTH - 20)}`
  assert.equal(exact.length, 500)
  assert.equal(normalizeStaffWorkLink(exact).ok, true)
  assert.equal(codeOf(`${exact}b`), 'too_long')
  assert.equal(codeOf('https://user:secret@github.com/amel'), 'credentials')
  assert.equal(codeOf('https://github.com@evil.example/amel'), 'credentials', 'deceptive userinfo is refused')
  assert.equal(codeOf('   '), 'empty')
  assert.deepEqual(validateStaffWorkLinks([GITHUB, 'javascript:alert(1)', ' HTTPS://GITHUB.COM/amel/student-portal ']), {
    ok: false, errors: [{ index: 1, code: 'scheme' }, { index: 2, code: 'duplicate' }],
  })
})

test('normalization trims and canonicalises without dropping paths, query strings or fragments', () => {
  assert.deepEqual(normalizeStaffWorkLink('  https://GitHub.com/Amel/Repo?tab=readme&sort=asc#top \n'), {
    ok: true, value: 'https://github.com/Amel/Repo?tab=readme&sort=asc#top',
  })
  const figma = 'https://www.figma.com/proto/AbC123/Club-App?node-id=1-2&t=xyz&scaling=min-zoom'
  assert.equal(normalizeStaffWorkLink(figma).value, figma)
  assert.equal(normalizeStaffWorkLink('http://portfolio.example.dz:80/work').value, 'http://portfolio.example.dz/work')
  assert.equal(normalizeStaffWorkLink('https://amel.dev').value, 'https://amel.dev/')
})

// --- Public API ------------------------------------------------------------

test('the submit handler forwards normalized links and reports link errors by index without echoing URLs', async () => {
  const calls = []
  const service = () => ({ submit: async (...args) => { calls.push(args); return { ok: true, status: 'submitted', reference: 'JOIN-26-TEST01' } } })
  let res = response()
  await submitHandler(service)(request(submitBody({ workLinks: [' HTTPS://GitHub.com/amel/student-portal '] })), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(calls, [[RAW_TOKEN, MOTIVATION, [GITHUB]]])

  res = response()
  await submitHandler(service)(request(submitBody({ workLinks: [GITHUB, 'javascript:alert(1)'] })), res)
  assert.equal(res.statusCode, 400)
  assert.deepEqual({ field: res.body.field, errors: res.body.errors }, { field: 'workLinks', errors: [{ index: 1, code: 'scheme' }] })
  assert.doesNotMatch(res.raw, /javascript|github\.com/)

  res = response()
  await submitHandler(service)(request(submitBody({ workLinks: 'https://github.com/amel' })), res)
  assert.equal(res.statusCode, 400)
  assert.equal(res.body.field, 'workLinks')

  res = response()
  await submitHandler(service)(request(submitBody({ workLinks: [], extra: true })), res)
  assert.deepEqual({ status: res.statusCode, message: res.body.message, field: res.body.field }, { status: 400, message: 'Invalid request.', field: undefined })

  res = response()
  await submitHandler(() => ({ submit: async () => ({ ok: false, status: 'invalid_work_links' }) }))(request(submitBody({ workLinks: [GITHUB] })), res)
  assert.deepEqual({ status: res.statusCode, field: res.body.field, state: res.body.status }, { status: 400, field: 'workLinks', state: 'invalid_work_links' })
  assert.equal(calls.length, 1, 'rejected payloads never reach the service')
})

test('the largest valid submission still fits the unchanged 16 KB request limit', async () => {
  const longest = Array.from({ length: 5 }, (_, index) => `https://example.com/${index}${'a'.repeat(STAFF_WORK_LINK_MAX_LENGTH - 21)}`)
  assert.ok(longest.every((link) => normalizeStaffWorkLink(link).value.length === STAFF_WORK_LINK_MAX_LENGTH))
  const body = submitBody({ motivation: '🙂'.repeat(2000), workLinks: longest })
  assert.ok(Buffer.byteLength(JSON.stringify(body)) < 16 * 1024)
  const res = response()
  await submitHandler(() => ({ submit: async () => ({ ok: true, status: 'submitted' }) }))(request(body), res)
  assert.equal(res.statusCode, 200)
  const handler = await read('api/_lib/staff-confirmation-handlers.js')
  assert.match(handler, /const MAX_BODY_BYTES = 16 \* 1024/)
})

test('the service writes motivation and links in one store call and maps database link errors', async () => {
  const writes = []
  const notifications = []
  const store = {
    submit: async (input) => { writes.push(input); return submissionRow() },
  }
  const service = createStaffConfirmationsService({ store, now: () => NOW, notify: async (input) => notifications.push(input) })
  assert.equal((await service.submit(RAW_TOKEN, MOTIVATION, [GITHUB])).status, 'submitted')
  assert.deepEqual(writes, [{ tokenHash: hashStaffConfirmationToken(RAW_TOKEN), motivation: MOTIVATION, workLinks: [GITHUB], now: NOW }])
  assert.equal(notifications.length, 1)
  assert.doesNotMatch(JSON.stringify(notifications), /github|https?:/i, 'notifications never carry candidate URLs')

  assert.deepEqual((await service.submit(RAW_TOKEN, MOTIVATION)).status, 'submitted')
  assert.deepEqual(writes[1].workLinks, [], 'a submission without links stores an empty list')

  const failing = (message) => createStaffConfirmationsService({ store: { submit: async () => { throw databaseError(message, '22023') } }, now: () => NOW })
  assert.deepEqual(await failing('staff_confirmation_invalid_work_links').submit(RAW_TOKEN, MOTIVATION, [GITHUB]), { ok: false, status: 'invalid_work_links' })
  assert.deepEqual(await failing('staff_confirmation_invalid_motivation').submit(RAW_TOKEN, MOTIVATION, [GITHUB]), { ok: false, status: 'invalid_motivation' })
})

test('the production store submits through staff_submit_confirmation_v2 and reads links per version', async () => {
  const rpcCalls = []
  const selects = []
  const supabase = {
    rpc: async (name, args) => { rpcCalls.push([name, args]); return { data: [submissionRow()], error: null } },
    from: (table) => {
      const query = {
        select: (columns) => { selects.push([table, columns]); return query },
        eq: () => query, is: () => query, order: () => query, limit: () => query,
        maybeSingle: () => Promise.resolve({ data: table === 'membership_staff_confirmations' ? { id: 'c' } : null, error: null }),
        then: (resolve, reject) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
      }
      return query
    },
  }
  const store = createStaffConfirmationsStore(supabase)
  await store.submit({ tokenHash: 'a'.repeat(64), motivation: MOTIVATION, workLinks: [GITHUB], now: NOW })
  assert.deepEqual(rpcCalls, [['staff_submit_confirmation_v2', {
    p_token_hash: 'a'.repeat(64), p_motivation: MOTIVATION, p_work_links: [GITHUB], p_now: NOW.toISOString(),
  }]])
  await store.forApplication('11111111-1111-4111-8111-111111111111', { submissions: true })
  assert.deepEqual(selects.find(([table]) => table === 'membership_staff_confirmation_submissions'), [
    'membership_staff_confirmation_submissions', 'id, version, motivation, work_links, submitted_at',
  ])
})

// --- Security --------------------------------------------------------------

test('submitted URLs are never fetched and no network helper exists in the submission path', async () => {
  const originalFetch = globalThis.fetch
  const fetched = []
  globalThis.fetch = async (...args) => { fetched.push(args); throw new Error('network access is forbidden here') }
  try {
    const store = { submit: async () => submissionRow() }
    const handler = submitHandler(() => createStaffConfirmationsService({ store, now: () => NOW }))
    const res = response()
    await handler(request(submitBody({ workLinks: [GITHUB, 'http://169.254.169.254/latest/meta-data/', 'https://internal.example/admin'] })), res)
    assert.equal(res.statusCode, 200)
    describeStaffWorkLink(GITHUB)
  } finally {
    globalThis.fetch = originalFetch
  }
  assert.deepEqual(fetched, [])

  const network = /\bfetch\s*\(|XMLHttpRequest|from ['"](?:node:)?(?:https?|dns|net|tls|dgram)['"]|require\(['"](?:node:)?(?:https?|dns|net)['"]\)|undici|axios|\bgot\(|\.lookup\(/
  for (const path of [
    'shared/membership/staff-work-links.js', 'api/_lib/staff-confirmation-validation.js', 'api/_lib/staff-confirmation-handlers.js',
    'api/_lib/staff-confirmations.js', 'api/_lib/staff-confirmations-store.js',
  ]) assert.doesNotMatch(await read(path), network, path)
})

test('candidate text and links are rendered as text and only http(s) links become clickable', async () => {
  const [page, people] = await Promise.all([read('src/pages/join/StaffConfirmationPage.jsx'), read('src/admin/PeoplePages.jsx')])
  for (const [path, source] of [['StaffConfirmationPage', page], ['PeoplePages', people]]) {
    assert.doesNotMatch(source, /dangerouslySetInnerHTML|\.innerHTML\s*=|insertAdjacentHTML/, path)
  }
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:msgbox', 'file:///c:/x', '/relative', 'not a url']) {
    assert.equal(describeStaffWorkLink(value), null, value)
  }
  const component = people.match(/function MotivationWorkLinks[\s\S]*?\n}\r?\n/)?.[0] || ''
  assert.match(component, /describeStaffWorkLink\(link\)/)
  assert.match(component, /<a href=\{display\.href\} target="_blank" rel="noopener noreferrer"/)
  assert.equal(component.match(/<a /g)?.length, 1, 'one anchor, built only from a validated link')
  const version = people.match(/function MotivationVersion[\s\S]*?\n}\r?\n/)?.[0] || ''
  assert.match(version, /<p>\{submission\.motivation\}<\/p>/, 'motivation stays an escaped React text node')
  assert.match(version, /<MotivationWorkLinks links=\{submission\.workLinks\}\/>/)
})

test('the v2 RPC is the stable-link submission plus work links, with no token or lifecycle changes', async () => {
  const [stable, workLinks] = await Promise.all([
    read('supabase/migrations/20261017120000_stable_staff_confirmation_links.sql'),
    read('supabase/migrations/20261019120000_staff_confirmation_work_links.sql'),
  ])
  const v1 = functionBody(stable, 'create or replace function public.staff_submit_confirmation(')
  const v2 = functionBody(workLinks, 'create function public.staff_submit_confirmation_v2(')
  const withoutLinks = v2
    .replace(/\n\s*clean_work_links text\[\] := [^\n]*/, '')
    .replace(/\n\s*if not public\.membership_staff_work_links_valid\(clean_work_links\) then[\s\S]*?end if;/, '')
    .replace('motivation, work_links, submitted_at', 'motivation, submitted_at')
    .replace('clean_motivation, clean_work_links, changed_at', 'clean_motivation, changed_at')
  assert.equal(squash(withoutLinks), squash(v1))
  // The original RPC remains for code deployed before the migration and delegates without links.
  assert.match(squash(workLinks), /create or replace function public\.staff_submit_confirmation\( p_token_hash text, p_motivation text, p_now timestamptz \)[\s\S]*?select \* from public\.staff_submit_confirmation_v2\(p_token_hash, p_motivation, '\{\}'::text\[\], p_now\);/)
  assert.doesNotMatch(workLinks, /alter table public\.membership_staff_confirmation(?:s|_tokens)\b|\btoken_hash text|\blink_nonce text|admin_apply_stable_staff_confirmation_action/i)
})

// --- Database --------------------------------------------------------------

test('the forward migration versions links on the immutable submission row', async () => {
  const directory = new URL('../supabase/migrations/', import.meta.url)
  const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort()
  assert.ok(files.indexOf('20261019120000_staff_confirmation_work_links.sql')
    > files.indexOf('20261018120000_fix_stable_staff_link_audit_and_regeneration.sql'), 'applies after the stable-link fixes')
  for (const earlier of ['20261016120000_staff_confirmation_workflow.sql', '20261017120000_stable_staff_confirmation_links.sql']) {
    assert.doesNotMatch(await read(`supabase/migrations/${earlier}`), /work_links/, `${earlier} is unchanged`)
  }
  const sql = (await read('supabase/migrations/20261019120000_staff_confirmation_work_links.sql')).toLowerCase()
  assert.match(sql, /alter table public\.membership_staff_confirmation_submissions\s+add column work_links text\[\] not null default '\{\}'/)
  assert.match(sql, /check \(cardinality\(work_links\) <= 5\)/)
  assert.match(sql, /check \(public\.membership_staff_work_links_valid\(work_links\)\)/)
  assert.match(sql, /char_length\(link\.value\) not between 1 and 500/)
  assert.match(sql, /link\.value !~ '\^https\?:\/\//)
  assert.match(sql, /create function public\.staff_submit_confirmation_v2\(\s+p_token_hash text,\s+p_motivation text,\s+p_work_links text\[\],\s+p_now timestamptz\s+\)/)
  assert.match(sql, /insert into public\.membership_staff_confirmation_submissions \(\s+confirmation_id, token_id, version, motivation, work_links, submitted_at/)
  assert.doesNotMatch(sql, /alter table public\.membership_staff_confirmations\b/, 'links are never stored on the confirmation')
  assert.doesNotMatch(sql, /update public\.membership_staff_confirmation_submissions|delete from public\.membership_staff_confirmation_submissions/)
  assert.doesNotMatch(sql, /create table/, 'no separate portfolio table')
  for (const signature of ['staff_submit_confirmation_v2\\(text, text, text\\[\\], timestamptz\\)', 'membership_staff_work_links_valid\\(text\\[\\]\\)']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature} from public, anon, authenticated`))
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature} to service_role`))
  }
  assert.match(sql, /^begin;[\s\S]*commit;\s*$/m)
})

// --- Admin -----------------------------------------------------------------

test('admin link labels come from the hostname and never trust lookalike domains', () => {
  const label = (value) => describeStaffWorkLink(value)
  assert.deepEqual(label('https://github.com/amel/student-portal/'), {
    href: 'https://github.com/amel/student-portal/', label: 'GitHub', detail: 'github.com/amel/student-portal',
  })
  assert.equal(label('https://www.behance.net/amel').label, 'Behance')
  assert.equal(label('https://www.instagram.com/amel.design/').label, 'Instagram')
  assert.equal(label('https://youtu.be/dQw4w9WgXcQ').label, 'YouTube')
  assert.deepEqual(label('https://www.youtube.com/watch?v=abc'), { href: 'https://www.youtube.com/watch?v=abc', label: 'YouTube', detail: 'youtube.com/watch?v=abc' })
  assert.equal(label('https://gist.github.com/amel/1').label, 'GitHub')
  assert.equal(label('https://amel-portfolio.dz/').label, 'amel-portfolio.dz')
  assert.equal(label('https://amel.github.io/club/').label, 'amel.github.io')
  assert.equal(label('https://github.com.evil.example/').label, 'github.com.evil.example')
  assert.equal(label('https://notgithub.com/').label, 'notgithub.com')
})

test('the dossier renders the latest and previous versions with their own links', async () => {
  const people = await read('src/admin/PeoplePages.jsx')
  assert.match(people, /<MotivationVersion submission=\{latestSubmission\} latest\/>/)
  assert.match(people, /previousSubmissions\.map\(\(submission\) => <MotivationVersion key=\{submission\.id\} submission=\{submission\}\/>\)/)
  assert.match(people, /Work \/ portfolio/)
  assert.match(people, /No links shared with this version\./)
  const styles = await read('src/admin/admin.css')
  const block = styles.match(/\.adm-motivation-links[\s\S]*?\.adm-motivation-links__unsafe[^}]*}/)?.[0] || ''
  assert.ok(block, 'work-link styles exist')
  assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b|rgb\(\d/i, 'theme variables only, so dark mode and accents apply')
})

test('work links stay out of the Staff queue, CSV export, notifications and global search', async () => {
  const sql = await read('supabase/migrations/20261019120000_staff_confirmation_work_links.sql')
  assert.doesNotMatch(sql, /admin_staff_confirmations|admin_staff_link_credentials/, 'queue and CSV views are untouched')
  const [notifications, applications] = await Promise.all([read('api/_lib/admin-notifications.js'), read('api/_lib/admin-applications.js')])
  assert.doesNotMatch(notifications, /work_?links/i)
  assert.equal(applications.split('\n').filter((line) => /work_?links/i.test(line)).length, 1, 'only the dossier mapping reads work links')
  assert.match(applications, /workLinks: Array\.isArray\(submission\.work_links\) \? submission\.work_links : \[\]/)
  const libraries = (await readdir(new URL('../api/_lib/', import.meta.url))).filter((name) => name.endsWith('.js'))
  const readers = []
  for (const name of libraries) if (/\bwork_links\b/.test(await read(`api/_lib/${name}`))) readers.push(name)
  assert.deepEqual(readers.sort(), ['admin-applications.js', 'staff-confirmations-store.js'])
})

// --- Public form -----------------------------------------------------------

test('department guidance lives in one mapping keyed by the Staff department values', () => {
  assert.deepEqual(Object.keys(STAFF_MOTIVATION_GUIDANCE).sort(), Object.keys(STAFF_DEPARTMENT_LABELS).sort())
  assert.equal(STAFF_MOTIVATION_QUESTION, 'What attracts you to this team, and what would you like to bring to it?')
  for (const [key, guidance] of Object.entries(STAFF_MOTIVATION_GUIDANCE)) {
    assert.match(guidance.example, /^Example: /, key)
    assert.ok(guidance.example.length < 300, `${key} placeholder stays concise`)
    assert.match(guidance.linkPlaceholder, /^https:\/\//, key)
    assert.doesNotMatch(`${guidance.ideas} ${guidance.example}`, /\bmust\b|professional experience|required/i, key)
  }
  assert.match(STAFF_MOTIVATION_GUIDANCE['dev-tech'].ideas, /GitHub/)
  assert.match(STAFF_MOTIVATION_GUIDANCE['design-content'].ideas, /Behance/)
  assert.match(STAFF_MOTIVATION_GUIDANCE['management-logistics'].ideas, /events you helped organise/)
  assert.equal(staffMotivationGuidance('unknown').linkPlaceholder, 'https://')
  assert.equal(staffMotivationGuidance(undefined), staffMotivationGuidance(null))
})

test('the public form uses controlled inputs, optional links and the agreed copy', async () => {
  const page = await read('src/pages/join/StaffConfirmationPage.jsx')
  assert.match(page, /value=\{motivation\}/)
  assert.match(page, /value=\{row\.value\}/)
  assert.match(page, /type="url"/)
  assert.doesNotMatch(page, /querySelector|getElementById|new FormData|\.elements\b/, 'no DOM scraping')
  assert.doesNotMatch(page, /dev-tech|design-content|management-logistics/, 'department copy stays in the mapping')
  assert.match(page, /staffMotivationGuidance\(confirmation\?\.staffDepartmentKey\)/)
  assert.match(page, /STAFF_WORK_LINKS_MAX/)
  assert.match(page, /normalizeStaffWorkLink/)
  assert.match(page, /useState\(\[\]\)/, 'the links section starts empty: links are optional')
  assert.match(page, /Portfolio or links to your work <span>Optional<\/span>/)
  assert.match(page, /Motivation letter/)
  assert.match(page, /beyond your application/)
  assert.doesNotMatch(page, /beyond your CV|detect AI|we can detect/i)
  assert.match(page, /Write in your own voice/)
  assert.match(page, /identity document numbers, home addresses, banking details or health information/)
  assert.match(page, /Enter a complete URL beginning with https:\/\//)
  assert.match(page, /Maximum 500 characters\./)
  assert.doesNotMatch(page, /localStorage|sessionStorage|document\.cookie/)
})
