import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { test } from 'node:test'
import {
  campaignStatusFor, formatAlgiersTimestamp, formatCampaignDate, parseAlgiersTimestamp,
} from '../shared/aivex/campaign-schedule.js'
import {
  canRegister, normalizeOperationalSettings, publicRegistrationStatus,
} from '../api/_lib/aivex-operational-settings.js'
import { createRegisterHandler } from '../api/aivex/register.js'
import { createRegistrationUploadInitHandler } from '../api/aivex/register/init.js'
import { createRegistrationUploadFinalizeHandler } from '../api/aivex/register/finalize.js'
import { registrationFingerprint } from '../api/_lib/aivex-registration-v4.js'
import {
  createAdminAivexCampaignSettingsStore, safeAivexCampaignSettings,
  validateAivexCampaignSettingsBody,
} from '../api/_lib/admin-aivex-campaign-settings.js'
import { createAdminAivexHandler } from '../api/admin-auth.js'
import { REGISTRATION_FILE_FIELDS, validateRegistrationV4 } from '../shared/aivex/contract-v4.js'
import { registrationStrings } from '../src/pages/aivex/register/registrationI18n.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const OPEN_AT = '2026-10-25T00:00:00+01:00'
const CLOSE_AT = '2026-11-20T23:59:59+01:00'
const ADMIN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SESSION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SUBMISSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const settings = (enabled = true) => normalizeOperationalSettings({
  edition: 2,
  registration_enabled: enabled,
  registration_open_at: OPEN_AT,
  registration_close_at: CLOSE_AT,
  document_upload_enabled: true,
  signed_document_deadline: CLOSE_AT,
})

function request(method, url = '/', body, headers = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
  req.method = method
  req.url = url
  req.headers = headers
  req.socket = { remoteAddress: '127.0.0.60' }
  return req
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value },
    end(value) { this.body = value ? JSON.parse(value) : null },
  }
}

const validPayload = () => ({
  submissionId: SUBMISSION_ID,
  edition: 2,
  formVersion: 4,
  team: {
    name: 'Atlas Logic',
    wilaya: { code: '34', name: 'Bordj Bou Arréridj' },
    institution: { id: 'univ-bba', name: 'Université Mohamed El Bachir El Ibrahimi', custom: false },
  },
  activityOfficial: { role: 'activities_officer', fullName: 'Amina Benali', email: 'activities@univ-bba.dz', phone: '0555123456' },
  delegationHead: { fullName: 'Karim Haddad', phone: '0661234567', rfid: '00471236', idCard: 'delegationHeadIdCard' },
  driver: { fullName: 'Nabil Saidi', phone: '0770112233', rfid: 'A1B2C3D4', idCard: 'driverIdCard' },
  students: [1, 2, 3].map((position) => ({
    position,
    fullName: ['Sara Meziane', 'Yacine Amrane', 'Lina Khelifi'][position - 1],
    phone: `055000000${position}`,
    gender: position === 2 ? 'male' : 'female',
    bacYear: 2021 + position,
    rfid: `0000000${position}`,
    studentCard: `studentCard_${position}`,
  })),
  consent: true,
})

const fileHints = () => REGISTRATION_FILE_FIELDS.map((field) => ({ field, mime: 'image/png', size: 128 }))

test('Edition 2 public status observes inclusive Algeria-time boundaries', () => {
  const campaign = settings()
  assert.deepEqual(canRegister(campaign, new Date('2026-10-24T23:59:59+01:00')), { ok: false, status: 'registration_not_open' })
  assert.equal(campaignStatusFor(campaign, new Date('2026-10-24T23:59:59+01:00')), 'not_open')
  assert.deepEqual(canRegister(campaign, new Date(OPEN_AT)), { ok: true })
  assert.equal(campaignStatusFor(campaign, new Date(OPEN_AT)), 'open')
  assert.equal(campaignStatusFor(campaign, new Date('2026-11-20T12:00:00+01:00')), 'open')
  assert.deepEqual(canRegister(campaign, new Date(CLOSE_AT)), { ok: true })
  assert.deepEqual(canRegister(campaign, new Date('2026-11-21T00:00:00+01:00')), { ok: false, status: 'registration_closed' })
  assert.equal(campaignStatusFor(campaign, new Date('2026-11-21T00:00:00+01:00')), 'closed')
  assert.equal(campaignStatusFor(settings(false), new Date(OPEN_AT)), 'disabled')
})

test('Algeria timestamps are explicit, reject impossible/browser-local dates, and format per language', () => {
  assert.equal(formatAlgiersTimestamp(parseAlgiersTimestamp(OPEN_AT)), OPEN_AT)
  assert.equal(parseAlgiersTimestamp('2026-10-25T00:00:00'), null)
  assert.equal(parseAlgiersTimestamp('2026-02-30T00:00:00+01:00'), null)
  assert.equal(formatCampaignDate(OPEN_AT, 'en'), 'October 25, 2026')
  assert.equal(formatCampaignDate(OPEN_AT, 'fr'), '25 octobre 2026')
  assert.equal(formatCampaignDate(OPEN_AT, 'ar'), '25 أكتوبر 2026')
})

test('GET /api/aivex/register is no-store and returns only the public campaign contract', async () => {
  const handler = createRegisterHandler({
    createSupabase: () => ({}),
    loadSettings: async () => settings(),
    now: () => new Date('2026-10-01T12:00:00+01:00'),
  })
  const res = response()
  await handler(request('GET', '/api/aivex/register'), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.deepEqual(Object.keys(res.body).sort(), [
    'edition', 'registrationCloseAt', 'registrationEnabled', 'registrationOpenAt', 'status', 'success',
  ].sort())
  assert.deepEqual(res.body, {
    success: true,
    edition: 2,
    status: 'not_open',
    registrationEnabled: true,
    registrationOpenAt: OPEN_AT,
    registrationCloseAt: CLOSE_AT,
  })
  assert.doesNotMatch(JSON.stringify(res.body), /submission|template|storage|retention|document|database|id/i)
})

test('the public serializer never exposes private operational settings', () => {
  const payload = publicRegistrationStatus(settings(), new Date(OPEN_AT))
  assert.equal(payload.status, 'open')
  assert.equal('documentUploadEnabled' in payload, false)
  assert.equal('signedDocumentDeadline' in payload, false)
  assert.equal('submissionEmail' in payload, false)
})

test('POST /api/aivex/register remains the retired 410 direct-upload response', async () => {
  const res = response()
  await createRegisterHandler()(request('POST', '/api/aivex/register'), res)
  assert.equal(res.statusCode, 410)
  assert.deepEqual(res.body, {
    success: false,
    status: 'direct_upload_required',
    message: 'This registration page is out of date. Reload it before submitting.',
  })
})

test('registration init rejects before/after the window and accepts during it', async () => {
  for (const [clock, expectedStatus] of [
    ['2026-10-24T23:59:59+01:00', 'registration_not_open'],
    ['2026-11-21T00:00:00+01:00', 'registration_closed'],
  ]) {
    let writes = 0
    const handler = createRegistrationUploadInitHandler({
      createSupabase: () => ({}),
      now: () => new Date(clock),
      loadSettings: async () => settings(),
      makeRegistrationStore: () => ({ findBySubmissionId: async () => { writes += 1 } }),
      makeSessionStore: () => ({}),
    })
    const res = response()
    await handler(request('POST', '/', { payload: validPayload(), files: fileHints() }), res)
    assert.equal(res.statusCode, 403)
    assert.equal(res.body.status, expectedStatus)
    assert.equal(writes, 0)
  }

  const payload = validPayload()
  const fingerprint = registrationFingerprint(validateRegistrationV4(payload).value)
  const handler = createRegistrationUploadInitHandler({
    createSupabase: () => ({}),
    now: () => new Date('2026-11-20T12:00:00+01:00'),
    loadSettings: async () => settings(),
    makeRegistrationStore: () => ({
      findBySubmissionId: async () => ({ studentCount: 3, fingerprint, reference: 'AIVEX2-7K9M2P4R' }),
    }),
    makeSessionStore: () => ({}),
  })
  const res = response()
  await handler(request('POST', '/', { payload, files: fileHints() }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
})

test('registration finalize independently rejects before/after and accepts during the window', async () => {
  for (const [clock, expectedStatus] of [
    ['2026-10-24T23:59:59+01:00', 'registration_not_open'],
    ['2026-11-21T00:00:00+01:00', 'registration_closed'],
  ]) {
    let reads = 0
    const handler = createRegistrationUploadFinalizeHandler({
      createSupabase: () => ({}),
      now: () => new Date(clock),
      loadSettings: async () => settings(),
      makeRegistrationStore: () => ({}),
      makeSessionStore: () => ({ loadSession: async () => { reads += 1 } }),
    })
    const res = response()
    await handler(request('POST', '/', { uploadSessionId: SESSION_ID, payload: validPayload() }), res)
    assert.equal(res.statusCode, 403)
    assert.equal(res.body.status, expectedStatus)
    assert.equal(reads, 0)
  }

  const payload = validPayload()
  const fingerprint = registrationFingerprint(validateRegistrationV4(payload).value)
  const handler = createRegistrationUploadFinalizeHandler({
    createSupabase: () => ({}),
    now: () => new Date('2026-11-20T12:00:00+01:00'),
    loadSettings: async () => settings(),
    makeRegistrationStore: () => ({
      findBySubmissionId: async () => ({ studentCount: 3, fingerprint, reference: 'AIVEX2-7K9M2P4R' }),
    }),
    makeSessionStore: () => ({
      loadSession: async () => ({
        id: SESSION_ID,
        kind: 'registration',
        submission_id: SUBMISSION_ID,
        payload_fingerprint: fingerprint,
        expires_at: '2026-11-20T20:00:00+01:00',
        expected_files: [],
      }),
      markCompleted: async () => {},
      removeStaging: async () => {},
    }),
  })
  const res = response()
  await handler(request('POST', '/', { uploadSessionId: SESSION_ID, payload }), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.success, true)
})

test('campaign settings validation is strict and keeps the signed deadline at/after close', () => {
  const valid = {
    registrationEnabled: true,
    registrationOpenAt: OPEN_AT,
    registrationCloseAt: CLOSE_AT,
    signedDocumentDeadline: CLOSE_AT,
  }
  assert.equal(validateAivexCampaignSettingsBody(valid).ok, true)
  for (const input of [
    { ...valid, registrationEnabled: 'true' },
    { ...valid, registrationOpenAt: '2026-10-25T00:00:00' },
    { ...valid, registrationOpenAt: '2026-02-30T00:00:00+01:00' },
    { ...valid, registrationCloseAt: OPEN_AT },
    { ...valid, signedDocumentDeadline: '2026-11-20T23:59:58+01:00' },
    { ...valid, submissionEmail: 'private@example.dz' },
  ]) assert.equal(validateAivexCampaignSettingsBody(input).ok, false)
})

test('admin campaign API requires a session and exact super_admin role', async () => {
  const service = () => ({ get: async () => ({ ok: true, settings: { edition: 2 } }) })
  for (const [session, expected] of [
    [null, 401],
    [{ user: { id: ADMIN_ID, role: 'reviewer' } }, 403],
    [{ user: { id: ADMIN_ID, role: 'administrator' } }, 403],
  ]) {
    const handler = createAdminAivexHandler({
      enabled: () => true,
      requireSession: async () => session,
      createSettingsService: service,
      createService: () => ({}),
    })
    const res = response()
    await handler(request('GET', '/api/admin-auth?__admin_path=aivex/settings'), res)
    assert.equal(res.statusCode, expected)
  }

  const handler = createAdminAivexHandler({
    enabled: () => true,
    requireSession: async () => ({ user: { id: ADMIN_ID, role: 'super_admin' } }),
    createSettingsService: () => ({
      get: async () => ({ ok: true, settings: safeAivexCampaignSettings({
        edition: 2,
        registration_enabled: true,
        registration_open_at: OPEN_AT,
        registration_close_at: CLOSE_AT,
        signed_document_deadline: CLOSE_AT,
      }, new Date('2026-10-01T00:00:00+01:00')) }),
    }),
    createService: () => ({}),
  })
  const res = response()
  await handler(request('GET', '/api/admin-auth?__admin_path=aivex/settings'), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.settings.status, 'scheduled')
})

test('super_admin update is allowed, malformed/cross-origin mutations are rejected', async () => {
  const input = {
    registrationEnabled: true,
    registrationOpenAt: OPEN_AT,
    registrationCloseAt: CLOSE_AT,
    signedDocumentDeadline: CLOSE_AT,
  }
  let updates = 0
  const dependencies = {
    enabled: () => true,
    requireSession: async () => ({ user: { id: ADMIN_ID, role: 'super_admin' } }),
    createSettingsService: () => ({
      update: async (edition, value) => {
        updates += 1
        return { ok: true, settings: { edition, ...value, status: 'scheduled', timeZone: 'Africa/Algiers' } }
      },
    }),
    createService: () => ({}),
  }
  const allowed = createAdminAivexHandler({ ...dependencies, trustedOrigin: () => true })
  const allowedRes = response()
  await allowed(request('POST', '/api/admin-auth?__admin_path=aivex/settings', input, { 'content-type': 'application/json' }), allowedRes)
  assert.equal(allowedRes.statusCode, 200)
  assert.equal(updates, 1)

  const invalidRes = response()
  await allowed(request('POST', '/api/admin-auth?__admin_path=aivex/settings', { ...input, registrationCloseAt: OPEN_AT }, { 'content-type': 'application/json' }), invalidRes)
  assert.equal(invalidRes.statusCode, 400)
  assert.equal(updates, 1)

  const wrongContentTypeRes = response()
  await allowed(request('POST', '/api/admin-auth?__admin_path=aivex/settings', input, { 'content-type': 'application/jsonp' }), wrongContentTypeRes)
  assert.equal(wrongContentTypeRes.statusCode, 415)
  assert.equal(updates, 1)

  const crossOrigin = createAdminAivexHandler({ ...dependencies, trustedOrigin: () => false })
  const crossOriginRes = response()
  await crossOrigin(request('POST', '/api/admin-auth?__admin_path=aivex/settings', input, { 'content-type': 'application/json', origin: 'https://evil.invalid' }), crossOriginRes)
  assert.equal(crossOriginRes.statusCode, 403)
  assert.equal(updates, 1)
})

test('campaign update store uses the atomic role-checking/audited RPC', async () => {
  let call
  const store = createAdminAivexCampaignSettingsStore({
    rpc: async (name, params) => {
      call = { name, params }
      return { data: [{ edition: 2, registration_enabled: true, registration_open_at: OPEN_AT, registration_close_at: CLOSE_AT, signed_document_deadline: CLOSE_AT }], error: null }
    },
  })
  await store.update(2, {
    registrationEnabled: true,
    registrationOpenAt: OPEN_AT,
    registrationCloseAt: CLOSE_AT,
    signedDocumentDeadline: CLOSE_AT,
  }, ADMIN_ID, new Date('2026-09-29T12:00:00+01:00'))
  assert.equal(call.name, 'admin_update_aivex_campaign_settings')
  assert.equal(call.params.p_admin_user_id, ADMIN_ID)
  assert.equal(call.params.p_edition, 2)

  const migration = await read('supabase/migrations/20261011120000_aivex_edition_2_campaign_schedule.sql')
  assert.match(migration, /v_role is distinct from 'super_admin'/)
  assert.match(migration, /'aivex_campaign_settings_updated'/)
  assert.match(migration, /insert into public\.admin_audit_events/)
  assert.match(migration, /'edition', p_edition/)
})

test('public registration UI fails closed, refreshes safely, and has complete EN/FR/AR campaign copy', async () => {
  const component = await read('src/pages/aivex/register/CompetitionRegistration.jsx')
  const panel = await read('src/pages/aivex/register/CampaignStatusPanel.jsx')
  const hook = await read('src/pages/aivex/register/useAivexCampaignStatus.js')
  assert.match(component, /campaign\.status !== 'open'/)
  assert.match(component, /<CampaignStatusPanel/)
  assert.match(panel, /campaign\.status === 'error'/)
  assert.match(hook, /cache: 'no-store'/)
  assert.match(hook, /window\.addEventListener\('focus', refresh\)/)
  assert.match(hook, /document\.addEventListener\('visibilitychange', refreshWhenVisible\)/)
  assert.doesNotMatch(hook, /setInterval|EventSource|WebSocket/)

  const keys = [
    'campaignPaperStatus', 'campaignLoading', 'campaignNotOpenKicker', 'campaignNotOpenTitle',
    'campaignPeriodLabel', 'campaignNotOpenNote', 'campaignClosedKicker', 'campaignClosedTitle',
    'campaignClosedNote', 'campaignDisabledKicker', 'campaignDisabledTitle', 'campaignDisabledText',
    'campaignErrorTitle', 'campaignRetry', 'campaignBack',
  ]
  for (const language of ['en', 'fr', 'ar']) {
    for (const key of keys) assert.equal(typeof registrationStrings[language][key], 'string', `${language}.${key}`)
  }
  assert.equal(registrationStrings.ar.dir, 'rtl')
})

test('admin AIVEX settings stay server-backed and registration changes do not couple existing-team workflows', async () => {
  const adminHook = await read('src/admin/useAdminAivexCampaignSettings.js')
  const adminPanel = await read('src/admin/AivexCampaignSettings.jsx')
  const settingsPage = await read('src/admin/AdminUtilityPages.jsx')
  const migration = await read('supabase/migrations/20261011120000_aivex_edition_2_campaign_schedule.sql')
  assert.match(adminHook, /\/api\/admin\/aivex\/settings/)
  assert.doesNotMatch(`${adminHook}\n${adminPanel}`, /localStorage|sessionStorage|AdminStore/)
  assert.match(settingsPage, /user\.role === 'super_admin'/)
  assert.match(adminPanel, /Update AIVEX registration period\?/)
  assert.match(adminPanel, /close the active campaign immediately/)
  assert.doesNotMatch(migration, /set\s+document_upload_enabled/i)
  assert.doesNotMatch(migration, /delete\s+from\s+public\.aivex_(registrations|magic_links|submitted_documents)/i)
  for (const path of ['api/aivex/magic-link/verify.js', 'api/aivex/magic-link/upload/init.js', 'api/aivex/magic-link/upload/finalize.js']) {
    assert.ok((await read(path)).length > 100, `${path} remains available`)
  }
})
