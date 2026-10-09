import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { Readable } from 'node:stream'
import test from 'node:test'
import {
  createStaffConfirmationSubmitHandler, createStaffConfirmationVerifyHandler, isStrictStaffConfirmationOrigin,
} from '../api/_lib/staff-confirmation-handlers.js'
import {
  parseStaffConfirmationListOptions, validateStaffConfirmationSubmitBody, validateStaffConfirmationVerifyBody,
} from '../api/_lib/staff-confirmation-validation.js'
import {
  buildStaffConfirmationUrl, generateStaffConfirmationToken, hashStaffConfirmationToken,
  isPlausibleStaffConfirmationToken, staffConfirmationExpiryFrom,
} from '../api/_lib/staff-confirmation-tokens.js'
import { createStaffConfirmationsService } from '../api/_lib/staff-confirmations.js'
import { createAdminApplicationsService } from '../api/_lib/admin-applications.js'
import { allowedApplicationActions, canManageApplication } from '../api/_lib/admin-applications-permissions.js'
import { safeAdminNotificationActionPath } from '../api/_lib/admin-notifications.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const RAW_TOKEN = Buffer.alloc(32, 7).toString('base64url')
const TOKEN_HASH = hashStaffConfirmationToken(RAW_TOKEN)
const APPLICATION_ID = '11111111-1111-4111-8111-111111111111'
const CONFIRMATION_ID = '22222222-2222-4222-8222-222222222222'
const SUBMISSION_ID = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-10-09T09:00:00.000Z')
const EXPIRES = '2026-10-16T09:00:00.000Z'
const MOTIVATION = 'I want to help the Dev and Tech team build useful student projects, contribute consistently, learn from experienced members, and share what I know with other students. This is meaningful to me.'

function request(method, body, headers = {}) {
  const raw = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  const req = Readable.from(raw === undefined ? [] : [Buffer.from(raw)])
  req.method = method
  req.url = '/api/join?__join_action=staff-confirmation-verify'
  req.headers = headers
  req.socket = { remoteAddress: '127.0.0.44' }
  return req
}

function response() {
  return {
    statusCode: 0, headers: {}, body: null, raw: '',
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(value) { this.raw = value || ''; this.body = value ? JSON.parse(value) : null },
  }
}

class MemoryStore {
  constructor() {
    this.token = {
      id: '44444444-4444-4444-8444-444444444444', confirmation_id: CONFIRMATION_ID,
      purpose: 'initial', expires_at: EXPIRES, consumed_at: null, revoked_at: null,
    }
    this.confirmationRow = {
      id: CONFIRMATION_ID, application_id: APPLICATION_ID, status: 'invited', expires_at: EXPIRES,
      revision_message: null, invited_at: NOW.toISOString(), submitted_at: null, updated_at: NOW.toISOString(),
    }
    this.applicationRow = {
      id: APPLICATION_ID, reference: 'JOIN-26-TEST01', full_name: 'Amel Benali', email: 'private@example.dz',
      join_type: 'staff', staff_department: 'dev-tech', primary_field: 'Dev / Tech', status: 'in_review',
    }
    this.submissions = []
  }
  async tokenByHash(hash) { this.lastHash = hash; return hash === TOKEN_HASH ? this.token : null }
  async confirmation(id) { return id === CONFIRMATION_ID ? this.confirmationRow : null }
  async application(id) { return id === APPLICATION_ID ? this.applicationRow : null }
  async submit(input) {
    this.submissions.push(input)
    return {
      application_id: APPLICATION_ID, application_reference: this.applicationRow.reference,
      confirmation_id: CONFIRMATION_ID, submission_id: SUBMISSION_ID, submission_version: 1,
      submitted_at: NOW.toISOString(), already_submitted: false,
    }
  }
}

test('Staff confirmation tokens have 256 bits of entropy, use fragments and are hashed before storage', () => {
  const token = generateStaffConfirmationToken((size) => { assert.equal(size, 32); return Buffer.alloc(size, 7) })
  assert.equal(token, RAW_TOKEN)
  assert.equal(token.length, 43)
  assert.equal(isPlausibleStaffConfirmationToken(token), true)
  assert.match(hashStaffConfirmationToken(token), /^[0-9a-f]{64}$/)
  assert.notEqual(hashStaffConfirmationToken(token), token)
  assert.equal(buildStaffConfirmationUrl('https://www.infinty-bba.com', token), `https://www.infinty-bba.com/join/staff-confirmation#token=${token}`)
  assert.equal(staffConfirmationExpiryFrom(NOW).toISOString(), EXPIRES)
})

test('candidate verification returns the minimum safe Staff projection and treats invalid states generically', async () => {
  const store = new MemoryStore()
  const service = createStaffConfirmationsService({ store, now: () => NOW })
  const valid = await service.verify(RAW_TOKEN)
  assert.equal(valid.ok, true)
  assert.equal(valid.status, 'valid')
  assert.deepEqual(valid.confirmation, {
    reference: 'JOIN-26-TEST01', displayName: 'Amel Benali', staffDepartment: 'Dev / Tech',
    status: 'invited', expiresAt: EXPIRES, revisionMessage: null,
  })
  assert.equal(valid.confirmation.email, undefined)
  assert.equal(store.lastHash, TOKEN_HASH)

  assert.deepEqual(await service.verify('not-a-token'), { ok: false, status: 'invalid' })
  store.token.revoked_at = NOW.toISOString()
  assert.deepEqual(await service.verify(RAW_TOKEN), { ok: false, status: 'invalid' })
  store.token.revoked_at = null
  store.token.consumed_at = NOW.toISOString()
  assert.deepEqual(await service.verify(RAW_TOKEN), { ok: true, status: 'already_submitted' })
  store.token.consumed_at = null
  store.token.expires_at = '2026-10-08T09:00:00.000Z'
  assert.deepEqual(await service.verify(RAW_TOKEN), { ok: false, status: 'expired' })
})

test('submission sends only the token hash to the atomic store and emits a versioned notification', async () => {
  const store = new MemoryStore()
  const notifications = []
  const service = createStaffConfirmationsService({ store, now: () => NOW, notify: async (input) => notifications.push(input) })
  const result = await service.submit(RAW_TOKEN, MOTIVATION)
  assert.deepEqual({ ok: result.ok, status: result.status, reference: result.reference }, {
    ok: true, status: 'submitted', reference: 'JOIN-26-TEST01',
  })
  assert.equal(store.submissions.length, 1)
  assert.equal(store.submissions[0].tokenHash, TOKEN_HASH)
  assert.equal(JSON.stringify(store.submissions[0]).includes(RAW_TOKEN), false)
  assert.equal(notifications.length, 1)
  assert.deepEqual({ confirmationId: notifications[0].confirmationId, version: notifications[0].version }, { confirmationId: CONFIRMATION_ID, version: 1 })
  assert.equal(JSON.stringify(notifications[0]).includes(MOTIVATION), false)
})

test('public request schemas are strict and motivation normalization preserves paragraphs', () => {
  assert.equal(validateStaffConfirmationVerifyBody({ token: RAW_TOKEN }).ok, true)
  assert.equal(validateStaffConfirmationVerifyBody({ token: RAW_TOKEN, reference: 'JOIN-X' }).ok, false)
  const valid = validateStaffConfirmationSubmitBody({ token: RAW_TOKEN, motivation: `  ${MOTIVATION}\r\n\r\nSecond paragraph.  ` })
  assert.equal(valid.ok, true)
  assert.match(valid.value.motivation, /\n\nSecond paragraph\.$/)
  assert.equal(validateStaffConfirmationSubmitBody({ token: RAW_TOKEN, motivation: 'too short' }).field, 'motivation')
  assert.equal(validateStaffConfirmationSubmitBody({ token: RAW_TOKEN, motivation: 'x'.repeat(2001) }).ok, false)
  assert.equal(validateStaffConfirmationSubmitBody({ token: RAW_TOKEN, motivation: MOTIVATION, reference: 'JOIN-X' }).ok, false)
})

test('public handlers enforce method, JSON, body size, origin and distributed rate limits', async () => {
  const options = {
    env: { STAFF_CONFIRMATION_API_ENABLED: 'true' },
    createService: () => ({ verify: async () => ({ ok: true, status: 'valid', confirmation: { reference: 'JOIN-26-TEST01' } }) }),
    rateLimit: async () => ({ allowed: true }),
    trustedOrigin: () => true,
  }
  const handler = createStaffConfirmationVerifyHandler(options)

  let res = response()
  await handler(request('GET', undefined), res)
  assert.equal(res.statusCode, 405)
  assert.equal(res.headers.allow, 'POST')

  res = response()
  await handler(request('POST', { token: RAW_TOKEN }), res)
  assert.equal(res.statusCode, 415)

  res = response()
  await handler(request('POST', { token: RAW_TOKEN }, { 'content-type': 'application/json', 'content-length': String(16 * 1024 + 1) }), res)
  assert.equal(res.statusCode, 413)

  res = response()
  await createStaffConfirmationVerifyHandler({ ...options, trustedOrigin: () => false })(
    request('POST', { token: RAW_TOKEN }, { 'content-type': 'application/json' }), res,
  )
  assert.equal(res.statusCode, 403)

  res = response()
  await createStaffConfirmationSubmitHandler({
    ...options,
    rateLimit: async (scope, ip, limit) => {
      assert.equal(scope, 'staff-confirmation-submit')
      assert.equal(ip, '127.0.0.44')
      assert.deepEqual(limit, { max: 10, windowMs: 15 * 60 * 1000 })
      return { allowed: false, retryAfterSeconds: 37 }
    },
  })(request('POST', { token: RAW_TOKEN, motivation: MOTIVATION }, { 'content-type': 'application/json' }), res)
  assert.equal(res.statusCode, 429)
  assert.equal(res.headers['retry-after'], '37')
})

test('public handler returns generic token errors and never reflects the submitted token', async () => {
  const handler = createStaffConfirmationVerifyHandler({
    env: { STAFF_CONFIRMATION_API_ENABLED: 'true' },
    createService: () => ({ verify: async () => ({ ok: false, status: 'invalid' }) }),
    rateLimit: async () => ({ allowed: true }),
    trustedOrigin: () => true,
  })
  const res = response()
  await handler(request('POST', { token: RAW_TOKEN }, { 'content-type': 'application/json' }), res)
  assert.equal(res.statusCode, 401)
  assert.equal(res.body.status, 'invalid')
  assert.equal(JSON.stringify(res.body).includes(RAW_TOKEN), false)
})

test('public handlers fail closed and map malformed, successful, duplicate and expired outcomes safely', async () => {
  const shared = {
    env: { STAFF_CONFIRMATION_API_ENABLED: 'true' },
    rateLimit: async () => ({ allowed: true }),
    trustedOrigin: () => true,
  }
  let res = response()
  await createStaffConfirmationVerifyHandler({ ...shared, createService: () => { throw new Error('must not create service') } })(
    request('POST', '{', { 'content-type': 'application/json' }), res,
  )
  assert.equal(res.statusCode, 400)

  res = response()
  await createStaffConfirmationVerifyHandler({
    ...shared,
    createService: () => ({ verify: async () => ({ ok: true, status: 'valid', confirmation: { reference: 'JOIN-26-TEST01' } }) }),
  })(request('POST', { token: RAW_TOKEN }, { 'content-type': 'application/json' }), res)
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.confirmation, { reference: 'JOIN-26-TEST01' })

  res = response()
  await createStaffConfirmationSubmitHandler({
    ...shared,
    createService: () => ({ submit: async () => ({ ok: true, status: 'already_submitted', reference: 'JOIN-26-TEST01' }) }),
  })(request('POST', { token: RAW_TOKEN, motivation: MOTIVATION }, { 'content-type': 'application/json' }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.status, 'already_submitted')

  res = response()
  await createStaffConfirmationVerifyHandler({
    ...shared,
    createService: () => ({ verify: async () => ({ ok: false, status: 'expired' }) }),
  })(request('POST', { token: RAW_TOKEN }, { 'content-type': 'application/json' }), res)
  assert.equal(res.statusCode, 410)
  assert.equal(JSON.stringify(res.body).includes('JOIN-26-TEST01'), false)

  res = response()
  await createStaffConfirmationVerifyHandler({
    ...shared, env: { STAFF_CONFIRMATION_API_ENABLED: 'false' },
    createService: () => { throw new Error('must remain disabled') },
  })(request('POST', { token: RAW_TOKEN }, { 'content-type': 'application/json' }), res)
  assert.equal(res.statusCode, 503)
})

test('production origin policy requires an exact HTTPS origin and host match', () => {
  const production = { VERCEL: '1' }
  assert.equal(isStrictStaffConfirmationOrigin({ headers: { origin: 'https://www.infinty-bba.com', host: 'www.infinty-bba.com' } }, production), true)
  assert.equal(isStrictStaffConfirmationOrigin({ headers: { origin: 'http://www.infinty-bba.com', host: 'www.infinty-bba.com' } }, production), false)
  assert.equal(isStrictStaffConfirmationOrigin({ headers: { origin: 'https://evil.example', host: 'www.infinty-bba.com' } }, production), false)
  assert.equal(isStrictStaffConfirmationOrigin({ headers: { host: 'www.infinty-bba.com' } }, production), false)
  assert.equal(isStrictStaffConfirmationOrigin({ headers: {} }, {}), true)
})

test('admin Staff queue query validation is bounded and rejects duplicate or unknown filters', () => {
  assert.deepEqual(parseStaffConfirmationListOptions(new URLSearchParams('status=submitted&department=dev-tech&page=2&limit=25&sort=name_asc')), {
    ok: true,
    value: { q: '', status: 'submitted', department: 'dev-tech', sort: 'name_asc', page: 2, limit: 25 },
  })
  assert.equal(parseStaffConfirmationListOptions(new URLSearchParams('status=unknown')).ok, false)
  assert.equal(parseStaffConfirmationListOptions(new URLSearchParams('limit=51')).ok, false)
  assert.equal(parseStaffConfirmationListOptions(new URLSearchParams('q=a&q=b')).ok, false)
})

test('Staff acceptance cannot bypass the confirmation workflow', () => {
  const application = { status: 'in_review', join_type: 'staff' }
  const withoutConfirmation = allowedApplicationActions('super_admin', application)
  assert.equal(withoutConfirmation.includes('accept_staff'), false)
  assert.equal(withoutConfirmation.includes('invite_staff_confirmation'), true)

  const submitted = allowedApplicationActions('super_admin', application, { status: 'submitted' })
  assert.equal(submitted.includes('confirm_staff_membership'), true)
  assert.equal(submitted.includes('request_staff_confirmation_revision'), true)
  assert.equal(canManageApplication('super_admin', 'confirm_staff_membership'), true)
  assert.equal(canManageApplication('administrator', 'confirm_staff_membership'), false)
  assert.equal(canManageApplication('super_admin', 'accept_staff'), false)
})

test('disabled workflow does not query unmigrated confirmation tables from existing application detail', async () => {
  let confirmationReads = 0
  const store = {
    find: async () => ({
      id: APPLICATION_ID, reference: 'JOIN-26-TEST01', full_name: 'Amel Benali', join_type: 'staff',
      status: 'in_review', staff_department: 'dev-tech', primary_field: 'Dev / Tech', updated_at: NOW.toISOString(),
    }),
    notes: async () => [], interviews: async () => [], audit: async () => [],
    staffConfirmation: async () => { confirmationReads += 1; throw new Error('table_missing') },
  }
  const service = createAdminApplicationsService({ store, staffConfirmationEnabled: false, now: () => NOW })
  const detail = await service.detail(APPLICATION_ID, { role: 'super_admin' })
  assert.equal(confirmationReads, 0)
  assert.equal(detail.staffConfirmation, null)
  const action = await service.act(APPLICATION_ID, {
    action: 'invite_staff_confirmation', expectedUpdatedAt: NOW.toISOString(), payload: {},
  }, { id: '55555555-5555-4555-8555-555555555555', role: 'super_admin' }, { origin: 'https://www.infinty-bba.com' })
  assert.equal(action.status, 503)
})

test('admin invitation returns a raw fragment link once while persisting only its hash', async () => {
  let confirmation = null
  let actionInput
  const application = {
    id: APPLICATION_ID, reference: 'JOIN-26-TEST01', full_name: 'Amel Benali', join_type: 'staff',
    status: 'in_review', staff_department: 'dev-tech', primary_field: 'Dev / Tech', updated_at: NOW.toISOString(),
  }
  const store = {
    find: async () => application,
    notes: async () => [], interviews: async () => [], audit: async () => [],
    staffConfirmation: async () => confirmation,
    applyStaffConfirmationAction: async (input) => {
      actionInput = input
      confirmation = {
        id: CONFIRMATION_ID, application_id: APPLICATION_ID, status: 'invited', invited_at: NOW.toISOString(),
        expires_at: EXPIRES, updated_at: NOW.toISOString(), submissions: [],
      }
    },
  }
  const service = createAdminApplicationsService({ store, now: () => NOW })
  const result = await service.act(APPLICATION_ID, {
    action: 'invite_staff_confirmation', expectedUpdatedAt: NOW.toISOString(), payload: {},
  }, { id: '55555555-5555-4555-8555-555555555555', role: 'super_admin' }, { origin: 'https://www.infinty-bba.com' })

  assert.equal(result.ok, true)
  assert.equal(actionInput.action, 'invite_staff_confirmation')
  assert.match(actionInput.tokenHash, /^[0-9a-f]{64}$/)
  assert.equal(actionInput.tokenPurpose, 'initial')
  const rawToken = new URLSearchParams(new URL(result.invitation.url).hash.slice(1)).get('token')
  assert.equal(hashStaffConfirmationToken(rawToken), actionInput.tokenHash)
  assert.equal(JSON.stringify(actionInput).includes(rawToken), false)
  assert.match(result.invitation.message, /Please do not share this link/)
  const bulk = await service.bulk({
    action: 'confirm_staff_membership', reason: '', records: [{ id: APPLICATION_ID, expectedUpdatedAt: NOW.toISOString() }],
  }, { id: '55555555-5555-4555-8555-555555555555', role: 'super_admin' })
  assert.equal(bulk.status, 400)
})

test('Staff notification deep links are allowlisted and reject open redirects or extra parameters', () => {
  const safe = `/admin/applications?view=staff-confirmations&record=${APPLICATION_ID}`
  assert.equal(safeAdminNotificationActionPath(safe), safe)
  assert.equal(safeAdminNotificationActionPath(`/admin/applications?record=${APPLICATION_ID}&next=https://evil.example`), null)
  assert.equal(safeAdminNotificationActionPath('//evil.example/admin/applications'), null)
  assert.equal(safeAdminNotificationActionPath(`/admin/applications?view=staff-confirmations&record=not-a-uuid`), null)
})

test('migration stores token hashes only, keeps submission history and enforces atomic transitions', async () => {
  const migration = (await read('supabase/migrations/20261016120000_staff_confirmation_workflow.sql')).toLowerCase()
  assert.match(migration, /create table public\.membership_staff_confirmations/)
  assert.match(migration, /create table public\.membership_staff_confirmation_tokens/)
  assert.match(migration, /token_hash text not null/)
  assert.doesNotMatch(migration, /raw_token|token_plain|plain_token/)
  assert.match(migration, /create table public\.membership_staff_confirmation_submissions/)
  assert.match(migration, /unique \(confirmation_id, version\)/)
  assert.match(migration, /create or replace function public\.staff_submit_confirmation/)
  assert.match(migration, /for update/)
  assert.match(migration, /create or replace function public\.admin_apply_staff_confirmation_action/)
  assert.match(migration, /confirm_staff_membership/)
  assert.match(migration, /membership_require_staff_confirmation/)
  assert.match(migration, /application_row\.join_type <> 'staff'/)
  assert.match(migration, /application_row\.status not in \('new', 'in_review', 'interview'\)/)
  assert.match(migration, /set status = 'accepted',[\s\S]*?accepted_as = 'staff',[\s\S]*?assigned_staff_department = staff_department/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on function public\.staff_submit_confirmation/)
})

test('private candidate route captures fragments, clears the address bar and is excluded from indexing', async () => {
  const [page, seo, build, vercel] = await Promise.all([
    read('src/pages/join/StaffConfirmationPage.jsx'),
    read('src/seo/seoConfig.js'),
    read('scripts/seo-build.mjs'),
    read('vercel.json'),
  ])
  assert.match(page, /window\.location\.hash/)
  assert.match(page, /window\.history\.replaceState/)
  assert.doesNotMatch(page, /localStorage|sessionStorage|document\.cookie/)
  assert.match(seo, /\/join\/staff-confirmation/)
  assert.match(seo, /noindex/)
  assert.match(build, /join\/staff-confirmation/)
  assert.match(vercel, /"source": "\/join\/staff-confirmation"[\s\S]*?"Referrer-Policy", "value": "no-referrer"/)
  assert.match(vercel, /staff-confirmation\/verify[\s\S]*?__join_action=staff-confirmation-verify/)
})

test('public Staff endpoints reuse join.js and keep the deployment at twelve API functions', async () => {
  async function listApiEntries(directory) {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = []
    for (const entry of entries) {
      if (entry.name === '_lib') continue
      const target = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory)
      if (entry.isDirectory()) files.push(...await listApiEntries(target))
      else if (entry.name.endsWith('.js')) files.push(target.pathname)
    }
    return files
  }
  assert.equal((await listApiEntries(new URL('../api/', import.meta.url))).length, 12)
  const join = await read('api/join.js')
  assert.match(join, /staff-confirmation-verify/)
  assert.match(join, /staff-confirmation-submit/)
})
