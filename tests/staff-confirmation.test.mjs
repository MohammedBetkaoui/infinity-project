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
  STAFF_CONFIRMATION_DERIVATION_VERSION, buildStaffConfirmationUrl, deriveStableStaffConfirmationToken,
  generateStaffConfirmationLinkNonce, generateStaffConfirmationToken, hashStaffConfirmationToken,
  isPlausibleStaffConfirmationToken, prepareStableStaffConfirmationCredential, staffConfirmationExpiryFrom,
  staffConfirmationLinkSecret,
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
const LINK_SECRET = 'test-only-staff-link-secret-material-32-bytes-minimum'
const LINK_NONCE = Buffer.alloc(16, 9).toString('base64url')
const ORIGIN = 'https://www.infinty-bba.com'
const SUPER_ADMIN = Object.freeze({ id: '55555555-5555-4555-8555-555555555555', role: 'super_admin' })
const STABLE_LINK_ENV = Object.freeze({ STAFF_CONFIRMATION_LINK_SECRET: LINK_SECRET })
const OTHER_LINK_SECRET = 'another-test-only-staff-link-secret-of-32-bytes'

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
      purpose: 'initial', expires_at: EXPIRES, consumed_at: null, revoked_at: null, blocked_at: null,
      link_nonce: LINK_NONCE, credential_version: 1, derivation_version: 1,
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

const databaseError = (message, code = '22023') => Object.assign(new Error(message), { code, databaseMessage: message })

// Mirrors admin_apply_stable_staff_confirmation_action, the
// admin_staff_link_credentials view and staff_submit_confirmation from
// 20261017120000_stable_staff_confirmation_links.sql. Like PostgreSQL, it only
// ever holds token hashes, nonces and versions, never a raw token or URL.
class StableLinkStore {
  constructor() {
    this.applicationRow = {
      id: APPLICATION_ID, reference: 'JOIN-26-TEST01', full_name: 'Amel Benali', email: 'private@example.dz',
      join_type: 'staff', status: 'in_review', staff_department: 'dev-tech', primary_field: 'Dev / Tech',
      submitted_at: NOW.toISOString(), updated_at: NOW.toISOString(),
    }
    this.confirmationRow = null
    this.tokens = []
    this.submissions = []
    this.actions = []
    this.linkAudits = []
  }

  persisted() {
    return JSON.stringify({
      confirmation: this.confirmationRow, tokens: this.tokens, submissions: this.submissions,
      actions: this.actions, linkAudits: this.linkAudits,
    })
  }

  currentToken() { return this.tokens.find((token) => !token.revoked_at) || null }

  async find() { return this.applicationRow }
  async notes() { return [] }
  async interviews() { return [] }
  async audit() { return [] }

  async staffConfirmation() {
    if (!this.confirmationRow) return null
    const token = this.currentToken()
    return {
      ...this.confirmationRow,
      link_access: !token ? 'none' : token.blocked_at ? 'blocked' : 'active',
      link_reconstructable: Boolean(token?.link_nonce),
      submissions: [...this.submissions].reverse(),
    }
  }

  async credentialForApplication() {
    const application = this.applicationRow
    const confirmation = this.confirmationRow
    const token = this.currentToken()
    return {
      application_id: application.id, reference: application.reference, full_name: application.full_name,
      email: application.email, staff_department: application.staff_department, primary_field: application.primary_field,
      application_status: application.status, application_submitted_at: application.submitted_at,
      application_updated_at: application.updated_at,
      confirmation_id: confirmation?.id ?? null, confirmation_status: confirmation?.status ?? null,
      expires_at: confirmation?.expires_at ?? null, submitted_at: confirmation?.submitted_at ?? null,
      confirmation_updated_at: confirmation?.updated_at ?? null,
      credential_id: token?.id ?? null, token_hash: token?.token_hash ?? null, link_nonce: token?.link_nonce ?? null,
      credential_version: token?.credential_version ?? null, derivation_version: token?.derivation_version ?? null,
      blocked_at: token?.blocked_at ?? null, revoked_at: null,
    }
  }

  async staffLinkExportCandidates() {
    return ['new', 'in_review', 'interview'].includes(this.applicationRow.status) ? [await this.credentialForApplication()] : []
  }

  async nextCredentialVersion(confirmationId) {
    if (!confirmationId) return 1
    return Math.max(0, ...this.tokens.filter((token) => token.confirmation_id === confirmationId).map((token) => token.credential_version)) + 1
  }

  async recordLinkAudit(input) { this.linkAudits.push(input) }

  async applyStaffConfirmationAction(input) {
    this.actions.push(input)
    const changedAt = input.now.toISOString()
    let token = this.currentToken()
    if (input.action === 'ensure_staff_confirmation_link' && token?.link_nonce) return this.actionRow(false)
    const needsCredential = [
      'invite_staff_confirmation', 'ensure_staff_confirmation_link',
      'create_stable_staff_confirmation_link', 'regenerate_staff_confirmation_link',
    ].includes(input.action)
    if (needsCredential && (!/^[A-Za-z0-9_-]{22}$/.test(input.linkNonce || '')
      || !/^[0-9a-f]{64}$/.test(input.tokenHash || '')
      || input.credentialVersion !== await this.nextCredentialVersion(this.confirmationRow?.id)
      || input.derivationVersion !== 1)) {
      throw databaseError('invalid_stable_staff_confirmation_credential')
    }

    if (!this.confirmationRow) {
      if (!['invite_staff_confirmation', 'ensure_staff_confirmation_link'].includes(input.action)) {
        throw databaseError('staff_confirmation_not_found', 'P0002')
      }
      this.confirmationRow = {
        id: input.proposedConfirmationId, application_id: APPLICATION_ID, status: 'invited',
        expires_at: input.expiresAt.toISOString(), revision_message: null, invited_at: changedAt,
        submitted_at: null, updated_at: changedAt,
      }
    } else if (input.action === 'invite_staff_confirmation') {
      throw databaseError('staff_confirmation_already_exists')
    }

    if (['block_staff_confirmation_link', 'unblock_staff_confirmation_link'].includes(input.action)) {
      const blocking = input.action === 'block_staff_confirmation_link'
      if (!token || Boolean(token.blocked_at) === blocking) throw databaseError('invalid_staff_link_access_transition')
      token.blocked_at = blocking ? changedAt : null
    } else if (input.action === 'request_staff_confirmation_revision') {
      if (this.confirmationRow.status !== 'submitted' || !token) throw databaseError('invalid_staff_confirmation_revision')
      Object.assign(this.confirmationRow, {
        status: 'revision_requested', revision_message: input.message, expires_at: input.expiresAt.toISOString(),
      })
      token.expires_at = input.expiresAt.toISOString()
    }

    if (needsCredential) {
      for (const previous of this.tokens) previous.revoked_at ??= changedAt
      token = {
        id: `44444444-4444-4444-8444-${String(this.tokens.length + 1).padStart(12, '0')}`,
        confirmation_id: this.confirmationRow.id, token_hash: input.tokenHash,
        purpose: input.action === 'regenerate_staff_confirmation_link' ? 'replacement' : 'initial',
        expires_at: this.confirmationRow.expires_at, link_nonce: input.linkNonce,
        credential_version: input.credentialVersion, derivation_version: input.derivationVersion,
        blocked_at: null, revoked_at: null, consumed_at: null,
      }
      this.tokens.push(token)
    }
    this.confirmationRow.updated_at = changedAt
    return this.actionRow(needsCredential)
  }

  actionRow(credentialCreated) {
    const token = this.currentToken()
    return {
      confirmation_id: this.confirmationRow.id, confirmation_status: this.confirmationRow.status,
      confirmation_updated_at: this.confirmationRow.updated_at, application_updated_at: this.applicationRow.updated_at,
      credential_id: token?.id ?? null, link_nonce: token?.link_nonce ?? null,
      credential_version: token?.credential_version ?? null, derivation_version: token?.derivation_version ?? null,
      token_hash: token?.token_hash ?? null, blocked_at: token?.blocked_at ?? null,
      expires_at: this.confirmationRow.expires_at, credential_created: credentialCreated,
    }
  }

  async tokenByHash(hash) { return this.tokens.find((token) => token.token_hash === hash) || null }
  async confirmation(id) { return this.confirmationRow?.id === id ? this.confirmationRow : null }
  async application(id) { return id === APPLICATION_ID ? this.applicationRow : null }

  async submit({ tokenHash, motivation, now }) {
    const token = await this.tokenByHash(tokenHash)
    if (!token || token.revoked_at) throw databaseError('staff_confirmation_invalid_token', '28000')
    if (token.blocked_at) throw databaseError('staff_confirmation_unavailable', '28000')
    if (!['invited', 'revision_requested'].includes(this.confirmationRow.status)) throw databaseError('staff_confirmation_inactive', '28000')
    const submission = {
      id: `33333333-3333-4333-8333-${String(this.submissions.length + 1).padStart(12, '0')}`,
      token_id: token.id, version: this.submissions.length + 1, motivation, submitted_at: now.toISOString(),
    }
    this.submissions.push(submission)
    Object.assign(this.confirmationRow, { status: 'submitted', submitted_at: submission.submitted_at, revision_message: null })
    return {
      application_id: APPLICATION_ID, application_reference: this.applicationRow.reference,
      confirmation_id: this.confirmationRow.id, submission_id: submission.id, submission_version: submission.version,
      submitted_at: submission.submitted_at, already_submitted: false,
    }
  }
}

const tokenOf = (url) => new URLSearchParams(new URL(url).hash.slice(1)).get('token')

const stableLinkService = (store, overrides = {}) => createAdminApplicationsService({
  store, now: () => NOW, env: STABLE_LINK_ENV, createId: () => CONFIRMATION_ID, ...overrides,
})

const runStaffAction = (service, action, payload = {}, user = SUPER_ADMIN) => service.act(APPLICATION_ID, {
  action, expectedUpdatedAt: NOW.toISOString(), payload: { confirmationUpdatedAt: NOW.toISOString(), ...payload },
}, user, { origin: ORIGIN })

const revealLink = (service, user = SUPER_ADMIN) => service.revealStaffLink(APPLICATION_ID, user, { origin: ORIGIN })

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
  store.token.blocked_at = NOW.toISOString()
  assert.deepEqual(await service.verify(RAW_TOKEN), { ok: false, status: 'unavailable' })
  store.token.blocked_at = null
  store.token.consumed_at = NOW.toISOString()
  assert.equal((await service.verify(RAW_TOKEN)).status, 'valid')
  store.token.consumed_at = null
  store.confirmationRow.status = 'submitted'
  assert.deepEqual(await service.verify(RAW_TOKEN), { ok: true, status: 'already_submitted' })
  store.confirmationRow.status = 'confirmed'
  assert.deepEqual(await service.verify(RAW_TOKEN), { ok: true, status: 'complete' })
  store.confirmationRow.status = 'invited'
  store.confirmationRow.expires_at = '2026-10-08T09:00:00.000Z'
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
      value: { q: '', status: 'submitted', linkAccess: '', department: 'dev-tech', sort: 'name_asc', page: 2, limit: 25 },
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

test('admin invitation creates a stable reconstructable fragment link without persisting the raw token', async () => {
  const store = new StableLinkStore()
  const service = stableLinkService(store)
  const result = await runStaffAction(service, 'invite_staff_confirmation')

  assert.equal(result.ok, true)
  assert.equal(store.actions.length, 1)
  const [actionInput] = store.actions
  assert.equal(actionInput.action, 'invite_staff_confirmation')
  assert.equal(actionInput.proposedConfirmationId, CONFIRMATION_ID)
  assert.match(actionInput.tokenHash, /^[0-9a-f]{64}$/)
  assert.match(actionInput.linkNonce, /^[A-Za-z0-9_-]{22}$/)
  assert.equal(actionInput.credentialVersion, 1)
  assert.equal(actionInput.derivationVersion, STAFF_CONFIRMATION_DERIVATION_VERSION)
  assert.ok(result.invitation.url.startsWith(`${ORIGIN}/join/staff-confirmation#token=`))
  const rawToken = tokenOf(result.invitation.url)
  assert.equal(hashStaffConfirmationToken(rawToken), actionInput.tokenHash)
  // The token is a pure function of the stored metadata and the server-only secret.
  assert.equal(rawToken, deriveStableStaffConfirmationToken({
    confirmationId: CONFIRMATION_ID, credentialVersion: 1,
    derivationVersion: STAFF_CONFIRMATION_DERIVATION_VERSION, linkNonce: actionInput.linkNonce,
  }, LINK_SECRET))
  assert.equal(JSON.stringify(actionInput).includes(rawToken), false)
  assert.equal(store.persisted().includes(rawToken), false)
  assert.equal(store.persisted().includes(result.invitation.url), false)
  assert.equal(result.invitation.linkState, 'active')
  assert.ok(result.invitation.message.includes(result.invitation.url))
  assert.match(result.invitation.message, /Please do not share this link/)
  assert.equal(result.application.staffConfirmation.linkReconstructable, true)

  // Same credential, same private link: revealing later rebuilds it without minting another credential.
  const revealed = await revealLink(service)
  assert.equal(revealed.ok, true)
  assert.equal(revealed.privateLink, result.invitation.url)
  assert.equal(revealed.linkState, 'active')
  assert.equal(store.actions.length, 1)
  assert.equal(store.tokens.length, 1)
  assert.deepEqual(store.linkAudits.map((entry) => entry.action), ['staff_link_revealed'])
  assert.equal(store.persisted().includes(rawToken), false)

  const bulk = await service.bulk({
    action: 'confirm_staff_membership', reason: '', records: [{ id: APPLICATION_ID, expectedUpdatedAt: NOW.toISOString() }],
  }, SUPER_ADMIN)
  assert.equal(bulk.status, 400)
})

test('stable token derivation is deterministic per credential and bound to its identity, version, nonce and secret', () => {
  assert.equal(generateStaffConfirmationLinkNonce((size) => { assert.equal(size, 16); return Buffer.alloc(size, 9) }), LINK_NONCE)
  const credential = { confirmationId: CONFIRMATION_ID, credentialVersion: 1, linkNonce: LINK_NONCE, secret: LINK_SECRET }
  const stable = prepareStableStaffConfirmationCredential(credential)
  assert.deepEqual(prepareStableStaffConfirmationCredential(credential), stable)
  assert.equal(isPlausibleStaffConfirmationToken(stable.rawToken), true)
  assert.equal(stable.tokenHash, hashStaffConfirmationToken(stable.rawToken))
  assert.equal(stable.derivationVersion, STAFF_CONFIRMATION_DERIVATION_VERSION)
  for (const change of [
    { confirmationId: APPLICATION_ID }, { credentialVersion: 2 },
    { linkNonce: Buffer.alloc(16, 8).toString('base64url') }, { secret: OTHER_LINK_SECRET },
  ]) {
    assert.notEqual(prepareStableStaffConfirmationCredential({ ...credential, ...change }).rawToken, stable.rawToken)
  }
  assert.throws(() => prepareStableStaffConfirmationCredential({ ...credential, derivationVersion: 2 }), { code: 'credential_error' })
  assert.throws(() => prepareStableStaffConfirmationCredential({ ...credential, linkNonce: 'too-short' }), { code: 'credential_error' })
})

test('blocking suspends the stable link and unblocking restores the exact same link', async () => {
  const store = new StableLinkStore()
  const admin = stableLinkService(store)
  const candidate = createStaffConfirmationsService({ store, now: () => NOW })
  const { invitation } = await runStaffAction(admin, 'invite_staff_confirmation')
  const rawToken = tokenOf(invitation.url)
  assert.equal((await candidate.verify(rawToken)).status, 'valid')

  const blocked = await runStaffAction(admin, 'block_staff_confirmation_link')
  assert.equal(blocked.ok, true)
  assert.equal(blocked.invitation, undefined)
  assert.equal(blocked.application.staffConfirmation.linkAccess, 'blocked')
  assert.deepEqual(await candidate.verify(rawToken), { ok: false, status: 'unavailable' })
  assert.deepEqual(await candidate.submit(rawToken, MOTIVATION), { ok: false, status: 'unavailable' })
  const whileBlocked = await revealLink(admin)
  assert.equal(whileBlocked.privateLink, invitation.url)
  assert.equal(whileBlocked.linkState, 'blocked')

  const unblocked = await runStaffAction(admin, 'unblock_staff_confirmation_link')
  assert.equal(unblocked.application.staffConfirmation.linkAccess, 'active')
  assert.equal((await candidate.verify(rawToken)).status, 'valid')
  const restored = await revealLink(admin)
  assert.equal(restored.privateLink, invitation.url)
  assert.equal(restored.linkState, 'active')
  assert.equal(store.tokens.length, 1)
  assert.equal(store.actions.slice(1).some((input) => input.tokenHash || input.linkNonce), false)
})

test('regeneration issues a new private link and permanently invalidates the previous one', async () => {
  const store = new StableLinkStore()
  const admin = stableLinkService(store)
  const candidate = createStaffConfirmationsService({ store, now: () => NOW })
  const first = await runStaffAction(admin, 'invite_staff_confirmation')
  const second = await runStaffAction(admin, 'regenerate_staff_confirmation_link')

  assert.equal(second.ok, true)
  assert.notEqual(second.invitation.url, first.invitation.url)
  assert.equal(store.actions[1].credentialVersion, 2)
  assert.equal(store.actions[1].proposedConfirmationId, CONFIRMATION_ID)
  assert.deepEqual(await candidate.verify(tokenOf(first.invitation.url)), { ok: false, status: 'invalid' })
  assert.deepEqual(await candidate.submit(tokenOf(first.invitation.url), MOTIVATION), { ok: false, status: 'invalid' })
  assert.equal((await candidate.verify(tokenOf(second.invitation.url))).status, 'valid')
  assert.equal((await revealLink(admin)).privateLink, second.invitation.url)
})

test('a revision request reuses the same stable link for the next submission', async () => {
  const store = new StableLinkStore()
  const admin = stableLinkService(store)
  const candidate = createStaffConfirmationsService({ store, now: () => NOW })
  const { invitation } = await runStaffAction(admin, 'invite_staff_confirmation')
  const rawToken = tokenOf(invitation.url)
  assert.equal((await candidate.submit(rawToken, MOTIVATION)).status, 'submitted')

  const revisionMessage = 'Please describe one student project you would like to help build.'
  const revision = await runStaffAction(admin, 'request_staff_confirmation_revision', { revisionMessage })
  assert.equal(revision.ok, true)
  assert.equal(revision.invitation, undefined)
  assert.equal(revision.application.staffConfirmation.statusKey, 'revision_requested')
  assert.equal(store.actions[1].tokenHash, undefined)

  const verified = await candidate.verify(rawToken)
  assert.equal(verified.status, 'valid')
  assert.deepEqual({ status: verified.confirmation.status, revisionMessage: verified.confirmation.revisionMessage }, {
    status: 'revision_requested', revisionMessage,
  })
  assert.equal((await candidate.submit(rawToken, MOTIVATION)).status, 'submitted')
  assert.deepEqual(store.submissions.map((submission) => [submission.version, submission.token_id]), [
    [1, store.tokens[0].id], [2, store.tokens[0].id],
  ])
  assert.equal(store.tokens.length, 1)
  assert.equal((await revealLink(admin)).privateLink, invitation.url)
})

test('stable-link operations fail closed without a valid link secret', async () => {
  assert.throws(() => staffConfirmationLinkSecret({}), { code: 'configuration_error' })
  assert.throws(() => staffConfirmationLinkSecret({ STAFF_CONFIRMATION_LINK_SECRET: 'x'.repeat(31) }), { code: 'configuration_error' })
  assert.equal(staffConfirmationLinkSecret({ STAFF_CONFIRMATION_LINK_SECRET: ` ${LINK_SECRET} ` }), LINK_SECRET)

  const store = new StableLinkStore()
  const notConfigured = { ok: false, status: 503, message: 'Stable Staff-link service is not configured.' }
  for (const env of [{}, { STAFF_CONFIRMATION_LINK_SECRET: 'too-short' }]) {
    assert.deepEqual(await runStaffAction(stableLinkService(store, { env }), 'invite_staff_confirmation'), notConfigured)
  }
  assert.equal(store.actions.length, 0)

  await runStaffAction(stableLinkService(store), 'invite_staff_confirmation')
  const unconfigured = stableLinkService(store, { env: {} })
  assert.deepEqual(await revealLink(unconfigured), notConfigured)
  assert.deepEqual(await unconfigured.previewStaffLinkExport(SUPER_ADMIN), notConfigured)
  assert.deepEqual(await unconfigured.exportStaffLinks(SUPER_ADMIN, { origin: ORIGIN }), notConfigured)
  assert.deepEqual(await runStaffAction(unconfigured, 'regenerate_staff_confirmation_link'), notConfigured)
  // A different secret must not silently rebuild a different, dead link for the stored credential.
  assert.deepEqual(await revealLink(stableLinkService(store, { env: { STAFF_CONFIRMATION_LINK_SECRET: OTHER_LINK_SECRET } })), {
    ok: false, status: 503, message: 'The stable Staff-link credential could not be verified.',
  })
  assert.equal(store.actions.length, 1)
  assert.equal(store.linkAudits.length, 0)
})

test('only super administrators can reveal, export or change private Staff links', async () => {
  const store = new StableLinkStore()
  const admin = stableLinkService(store)
  await runStaffAction(admin, 'invite_staff_confirmation')
  const administrator = { id: '66666666-6666-4666-8666-666666666666', role: 'administrator' }

  assert.equal((await revealLink(admin, administrator)).status, 403)
  assert.equal((await revealLink(admin, null)).status, 403)
  assert.equal((await admin.previewStaffLinkExport(administrator)).status, 403)
  assert.equal((await admin.exportStaffLinks(administrator, { origin: ORIGIN })).status, 403)
  for (const action of ['regenerate_staff_confirmation_link', 'block_staff_confirmation_link', 'unblock_staff_confirmation_link']) {
    assert.equal((await runStaffAction(admin, action, {}, administrator)).status, 403)
  }
  assert.equal(store.actions.length, 1)
  assert.equal(store.linkAudits.length, 0)
})

test('CSV export reuses existing stable links and creates a missing one only once', async () => {
  const invited = new StableLinkStore()
  const admin = stableLinkService(invited)
  const { invitation } = await runStaffAction(admin, 'invite_staff_confirmation')
  const exported = await admin.exportStaffLinks(SUPER_ADMIN, { origin: ORIGIN })
  assert.equal(exported.ok, true)
  assert.deepEqual({ rowCount: exported.rowCount, created: exported.created }, { rowCount: 1, created: 0 })
  assert.ok(exported.csv.includes(`"${invitation.url}"`))
  assert.equal(invited.actions.length, 1)
  assert.equal(invited.tokens.length, 1)

  const fresh = new StableLinkStore()
  const exporter = stableLinkService(fresh)
  const firstExport = await exporter.exportStaffLinks(SUPER_ADMIN, { origin: ORIGIN })
  const secondExport = await exporter.exportStaffLinks(SUPER_ADMIN, { origin: ORIGIN })
  assert.deepEqual([firstExport.created, secondExport.created], [1, 0])
  assert.deepEqual(fresh.actions.map((input) => input.action), ['ensure_staff_confirmation_link'])
  const { privateLink } = await revealLink(exporter)
  assert.ok(firstExport.csv.includes(`"${privateLink}"`))
  assert.ok(secondExport.csv.includes(`"${privateLink}"`))
  assert.equal((await createStaffConfirmationsService({ store: fresh, now: () => NOW }).verify(tokenOf(privateLink))).status, 'valid')
  assert.equal(fresh.persisted().includes(tokenOf(privateLink)), false)
  assert.deepEqual(fresh.linkAudits.map((entry) => entry.action), ['staff_link_csv_exported', 'staff_link_csv_exported', 'staff_link_revealed'])
})

test('stable-link migration persists derivation metadata only and never rotates on ensure', async () => {
  const migration = (await read('supabase/migrations/20261017120000_stable_staff_confirmation_links.sql')).toLowerCase()
  assert.doesNotMatch(migration, /raw_token|token_plain|plain_token|private_url|private_link\s+text/)
  assert.match(migration, /p_token_hash !~ '\^\[0-9a-f\]\{64\}\$'/)
  assert.match(migration, /if p_action = 'ensure_staff_confirmation_link'\s+and credential_row\.id is not null\s+and credential_row\.link_nonce is not null then\s+return query/)
  assert.match(migration, /- 'token' - 'privatelink' - 'private_link' - 'link_nonce' - 'secret'/)
  assert.match(migration, /revoke all on table public\.admin_staff_link_credentials from public, anon, authenticated/)
  assert.match(migration, /grant select on table public\.admin_staff_link_credentials to service_role/)
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
